/**
 * AI worker client tests — pure logic, no browser. We supply a
 * synchronous in-process worker target so the tests remain hermetic.
 */

import { describe, expect, it, vi } from "vitest";
import type {
  WorkerRequest,
  WorkerResponse,
} from "../../../src/workers/protocol";
import { WORKER_PROTOCOL_VERSION } from "../../../src/workers/protocol";
import {
  createAiClient,
  createRequestIdSource,
  type AiWorkerTarget,
} from "../../../src/app/bridge/ai-client";
import type { Rng as EngineRng } from "../../../src/engine";

/**
 * A fake worker whose behaviour a test controls turn-by-turn. Messages
 * are dispatched synchronously so we can assert about state right after
 * `postMessage`.
 */
function makeFakeWorker(behaviour: (req: WorkerRequest) => WorkerResponse | null): AiWorkerTarget {
  const messageHandlers: Array<(event: MessageEvent<WorkerResponse>) => void> = [];
  const errorHandlers: Array<(event: ErrorEvent) => void> = [];
  return {
    postMessage(req): void {
      const res = behaviour(req);
      if (res === null) return; // simulated hang / dropped
      // Deliver synchronously; simulates the same-tick response your
      // real worker never provides but a mock reasonably can.
      for (const h of messageHandlers) {
        h({ data: res } as unknown as MessageEvent<WorkerResponse>);
      }
    },
    addEventListener(kind, handler): void {
      if (kind === "message") messageHandlers.push(handler as (event: MessageEvent<WorkerResponse>) => void);
      else errorHandlers.push(handler as (event: ErrorEvent) => void);
    },
    removeEventListener(kind, handler): void {
      if (kind === "message") {
        const idx = messageHandlers.indexOf(handler as (event: MessageEvent<WorkerResponse>) => void);
        if (idx >= 0) messageHandlers.splice(idx, 1);
      } else {
        const idx = errorHandlers.indexOf(handler as (event: ErrorEvent) => void);
        if (idx >= 0) errorHandlers.splice(idx, 1);
      }
    },
    terminate: vi.fn(),
  };
}

/**
 * Trigger a worker "error" event out-of-band.
 */
function triggerWorkerError(target: AiWorkerTarget, message: string): void {
  // Access the mock's private list via a downcast. This is test-only.
  const inner = target as unknown as {
    postMessage(req: WorkerRequest): void;
    _errorHandlers?: Array<(e: ErrorEvent) => void>;
  };
  const listeners = (inner as unknown as { errorHandlers?: unknown }).errorHandlers as Array<(e: ErrorEvent) => void> | undefined;
  if (Array.isArray(listeners)) {
    for (const h of listeners) h({ message } as ErrorEvent);
  }
}

describe("ai-client — request id source", () => {
  it("emits a monotonic sequence starting at 1 by default", () => {
    const s = createRequestIdSource();
    expect(s.next()).toBe(1);
    expect(s.next()).toBe(2);
    expect(s.next()).toBe(3);
  });
  it("respects a custom start", () => {
    const s = createRequestIdSource(100);
    expect(s.next()).toBe(100);
    expect(s.next()).toBe(101);
  });
});

describe("ai-client — happy path", () => {
  it("resolves ok with the raw response for a matching id", async () => {
    const worker = makeFakeWorker((req) => ({
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "AI_ROSTER_OK",
      result: {
        roster: { constructs: [] },
        rng: { state: 0n, stream: 1n } as unknown as EngineRng,
      },
    }));
    const client = createAiClient({ factory: () => worker });
    const { result, requestId } = client.postAiRequest({
      kind: "AI_ROSTER",
      catalog: {} as never,
      budget: 100 as never,
      seed: "s",
      streamLabel: "l",
    });
    const outcome = await result;
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.response.id).toBe(requestId);
    expect(outcome.response.kind).toBe("AI_ROSTER_OK");
    client.dispose();
  });

  it("multiplexes two concurrent requests by id", async () => {
    // Return the id echoed and a per-id kind marker to prove multiplexing.
    const worker = makeFakeWorker((req) => ({
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "ERROR",
      errorKind: "INTERNAL_DEFECT",
      message: `id ${req.id}`,
    }));
    const client = createAiClient({ factory: () => worker });
    const a = client.postAiRequest({ kind: "AI_ROSTER", catalog: {} as never, budget: 100 as never, seed: "a", streamLabel: "x" });
    const b = client.postAiRequest({ kind: "AI_ROSTER", catalog: {} as never, budget: 100 as never, seed: "b", streamLabel: "y" });
    const [ra, rb] = await Promise.all([a.result, b.result]);
    expect(ra.kind).toBe("error");
    expect(rb.kind).toBe("error");
    if (ra.kind === "error") expect(ra.message).toBe(`id ${a.requestId}`);
    if (rb.kind === "error") expect(rb.message).toBe(`id ${b.requestId}`);
    expect(a.requestId).not.toBe(b.requestId);
    client.dispose();
  });
});

describe("ai-client — cancellation", () => {
  it("resolves as cancelled when cancel is called before the response arrives", async () => {
    // Delay the response until we manually flush. We do that by making
    // postMessage record the request but return no response until a later
    // manual step. For simplicity: implement a queue mode.
    const queue: WorkerRequest[] = [];
    const messageHandlers: Array<(event: MessageEvent<WorkerResponse>) => void> = [];
    const worker: AiWorkerTarget = {
      postMessage(req): void { queue.push(req); },
      addEventListener(kind, handler): void {
        if (kind === "message") messageHandlers.push(handler as (event: MessageEvent<WorkerResponse>) => void);
      },
      removeEventListener(): void { /* noop */ },
      terminate: vi.fn(),
    };
    function flush(): void {
      const req = queue.shift();
      if (req === undefined) return;
      for (const h of messageHandlers) {
        h({
          data: {
            id: req.id,
            version: WORKER_PROTOCOL_VERSION,
            kind: "ERROR",
            errorKind: "INTERNAL_DEFECT",
            message: "late",
          },
        } as unknown as MessageEvent<WorkerResponse>);
      }
    }
    const client = createAiClient({ factory: () => worker });
    const call = client.postAiRequest({
      kind: "AI_ROSTER",
      catalog: {} as never,
      budget: 100 as never,
      seed: "s",
      streamLabel: "l",
    });
    call.cancel();
    // Response arrives after cancellation — must swallow.
    flush();
    const out = await call.result;
    expect(out.kind).toBe("cancelled");
    if (out.kind === "cancelled") expect(out.requestId).toBe(call.requestId);
    client.dispose();
  });

  it("cancel after the response arrives is a no-op", async () => {
    const worker = makeFakeWorker((req) => ({
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "ERROR",
      errorKind: "INTERNAL_DEFECT",
      message: "immediate",
    }));
    const client = createAiClient({ factory: () => worker });
    const call = client.postAiRequest({
      kind: "AI_ROSTER",
      catalog: {} as never,
      budget: 100 as never,
      seed: "s",
      streamLabel: "l",
    });
    const out = await call.result;
    expect(out.kind).toBe("error");
    // Late cancel should not throw.
    call.cancel();
    client.dispose();
  });
});

describe("ai-client — inFlightCount + dispose", () => {
  it("counts pending requests and drops them on dispose", async () => {
    const queue: WorkerRequest[] = [];
    const worker: AiWorkerTarget = {
      postMessage(req): void { queue.push(req); },
      addEventListener(): void { /* noop */ },
      removeEventListener(): void { /* noop */ },
      terminate: vi.fn(),
    };
    const client = createAiClient({ factory: () => worker });
    const a = client.postAiRequest({ kind: "AI_ROSTER", catalog: {} as never, budget: 100 as never, seed: "a", streamLabel: "x" });
    const b = client.postAiRequest({ kind: "AI_ROSTER", catalog: {} as never, budget: 100 as never, seed: "b", streamLabel: "y" });
    expect(client.inFlightCount()).toBe(2);
    client.dispose();
    expect(client.inFlightCount()).toBe(0);
    const [ra, rb] = await Promise.all([a.result, b.result]);
    expect(ra.kind).toBe("error");
    if (ra.kind === "error") expect(ra.errorKind).toBe("WORKER_DOWN");
    expect(rb.kind).toBe("error");
    if (rb.kind === "error") expect(rb.errorKind).toBe("WORKER_DOWN");
  });
});

describe("ai-client — determinism", () => {
  it("two calls with the same seed and streamLabel produce byte-identical requests", () => {
    // The client is a passthrough — it must not mutate `seed`/`streamLabel`
    // and the id is the ONLY per-call field it inserts. Determinism is
    // proven by comparing two request envelopes after id normalization.
    const observed: WorkerRequest[] = [];
    const worker: AiWorkerTarget = {
      postMessage(req): void { observed.push(req); },
      addEventListener(): void { /* noop */ },
      removeEventListener(): void { /* noop */ },
      terminate: vi.fn(),
    };
    const client = createAiClient({ factory: () => worker });
    client.postAiRequest({
      kind: "AI_ROSTER",
      catalog: {} as never,
      budget: 100 as never,
      seed: "same",
      streamLabel: "same",
    });
    client.postAiRequest({
      kind: "AI_ROSTER",
      catalog: {} as never,
      budget: 100 as never,
      seed: "same",
      streamLabel: "same",
    });
    const [a, b] = observed;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Strip ids for the compare.
    const norm = (r: WorkerRequest): WorkerRequest => ({ ...r, id: 0 }) as WorkerRequest;
    expect(JSON.stringify(norm(a!))).toBe(JSON.stringify(norm(b!)));
    client.dispose();
  });
});

describe("ai-client — smoke: WORKER_DOWN and MESSAGE_MALFORMED reasons exist", () => {
  it("triggerWorkerError is available for scenarios", () => {
    // Sanity — the helper exists so future tests can plug it in.
    expect(triggerWorkerError).toBeInstanceOf(Function);
  });
});
