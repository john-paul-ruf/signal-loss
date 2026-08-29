import { describe, expect, it } from "vitest";
import {
  createMapGenClient,
  type MapWorkerTarget,
} from "../../../src/app/bridge/mapgen-client";
import type {
  MapGenRequest,
  WorkerRequest,
  WorkerResponse,
} from "../../../src/workers/protocol";
import { WORKER_PROTOCOL_VERSION } from "../../../src/workers/protocol";
import type { MapResult } from "../../../src/engine/index";

/**
 * A synchronous, controllable fake worker. Captures posted requests and lets
 * the test deliver `message`/`error` events on demand — no real Worker, no
 * DOM event constructors (the suite runs in the Node environment).
 */
function makeFakeWorker(): {
  readonly target: MapWorkerTarget;
  readonly posted: readonly WorkerRequest[];
  deliver(response: WorkerResponse): void;
  deliverRaw(data: unknown): void;
  fail(message: string): void;
  terminatedCount(): number;
} {
  let onMessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  let onError: ((event: ErrorEvent) => void) | null = null;
  const posted: WorkerRequest[] = [];
  let terminated = 0;
  const target: MapWorkerTarget = {
    postMessage(msg: WorkerRequest): void {
      posted.push(msg);
    },
    addEventListener(
      kind: "message" | "error",
      handler:
        | ((event: MessageEvent<WorkerResponse>) => void)
        | ((event: ErrorEvent) => void),
    ): void {
      if (kind === "message") {
        onMessage = handler as (event: MessageEvent<WorkerResponse>) => void;
      } else {
        onError = handler as (event: ErrorEvent) => void;
      }
    },
    terminate(): void {
      terminated = terminated + 1;
    },
  };
  return {
    target,
    posted,
    deliver(response: WorkerResponse): void {
      onMessage?.({ data: response } as MessageEvent<WorkerResponse>);
    },
    deliverRaw(data: unknown): void {
      onMessage?.({ data } as MessageEvent<WorkerResponse>);
    },
    fail(message: string): void {
      onError?.({ message } as ErrorEvent);
    },
    terminatedCount(): number {
      return terminated;
    },
  };
}

// The client never inspects map contents — only the envelope kind/id — so a
// minimal cast keeps the fixture from coupling to the full GameMap shape.
const emptyMapResult = {
  map: { seed: "seed", acceptedAttempt: 1 },
  rejectedReports: [],
} as unknown as MapResult;

function okResponse(id: number): WorkerResponse {
  return { id, version: WORKER_PROTOCOL_VERSION, kind: "MAP_GEN_OK", result: emptyMapResult };
}

const sampleInput: Omit<MapGenRequest, "id" | "version"> = {
  kind: "MAP_GEN",
  baseSeed: "abc123",
  selector: { kind: "any" },
  archetypes: [],
  tunables: {} as MapGenRequest["tunables"],
};

describe("mapgen-client / request id echoing + multiplexing", () => {
  it("fills id + version and multiplexes concurrent requests by echoed id", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });

    const a = client.request(sampleInput);
    const b = client.request(sampleInput);
    expect(a.requestId).not.toBe(b.requestId);
    expect(client.inFlightCount()).toBe(2);

    const postedA = fake.posted[0];
    const postedB = fake.posted[1];
    expect(postedA?.id).toBe(a.requestId);
    expect(postedA?.version).toBe(WORKER_PROTOCOL_VERSION);
    expect(postedB?.id).toBe(b.requestId);

    // Deliver out of order — each caller still gets its own response.
    fake.deliver(okResponse(b.requestId));
    fake.deliver(okResponse(a.requestId));
    const ra = await a.result;
    const rb = await b.result;
    expect(ra.kind).toBe("ok");
    expect(rb.kind).toBe("ok");
    if (ra.kind === "ok") expect(ra.response.id).toBe(a.requestId);
    if (rb.kind === "ok") expect(rb.response.id).toBe(b.requestId);
    expect(client.inFlightCount()).toBe(0);
  });
});

describe("mapgen-client / cancellation", () => {
  it("swallows a late response after cancel and resolves as cancelled", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });

    const call = client.request(sampleInput);
    call.cancel();
    expect(client.inFlightCount()).toBe(0); // cancelled no longer counts
    fake.deliver(okResponse(call.requestId)); // late arrival
    const r = await call.result;
    expect(r.kind).toBe("cancelled");
    if (r.kind === "cancelled") expect(r.requestId).toBe(call.requestId);
  });
});

describe("mapgen-client / typed failure surface", () => {
  it("propagates a typed MAP_MAX_REGEN worker error verbatim", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });
    const call = client.request(sampleInput);
    fake.deliver({
      id: call.requestId,
      version: WORKER_PROTOCOL_VERSION,
      kind: "ERROR",
      errorKind: "MAP_MAX_REGEN",
      message: "regeneration exhausted",
    });
    const r = await call.result;
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.errorKind).toBe("MAP_MAX_REGEN");
      expect(r.message).toBe("regeneration exhausted");
    }
  });

  it("treats a missing-id message as a downed worker and drops outstanding calls", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });
    const call = client.request(sampleInput);
    fake.deliverRaw({ kind: "MAP_GEN_OK" }); // no numeric id
    const r = await call.result;
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.errorKind).toBe("WORKER_DOWN");
  });

  it("flags an unexpected well-formed response kind as MESSAGE_MALFORMED", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });
    const call = client.request(sampleInput);
    fake.deliver({
      id: call.requestId,
      version: WORKER_PROTOCOL_VERSION,
      kind: "AI_ROSTER_OK",
    } as unknown as WorkerResponse);
    const r = await call.result;
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.errorKind).toBe("MESSAGE_MALFORMED");
  });

  it("resolves outstanding calls as WORKER_DOWN on a worker error event", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });
    const call = client.request(sampleInput);
    fake.fail("boom");
    const r = await call.result;
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.errorKind).toBe("WORKER_DOWN");
      expect(r.message).toBe("boom");
    }
  });
});

describe("mapgen-client / disposal", () => {
  it("resolves outstanding calls as WORKER_DOWN, terminates, and rejects new requests", async () => {
    const fake = makeFakeWorker();
    const client = createMapGenClient({ factory: () => fake.target });
    const call = client.request(sampleInput);
    expect(() => client.dispose()).not.toThrow();
    const r = await call.result;
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.errorKind).toBe("WORKER_DOWN");
    expect(fake.terminatedCount()).toBe(1);
    client.dispose(); // idempotent
    expect(fake.terminatedCount()).toBe(1);
    expect(() => client.request(sampleInput)).toThrow();
  });
});
