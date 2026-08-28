/**
 * AI worker client (M17 bridge, session 08 checkpoint 1).
 *
 * A thin, typed request/response envelope over one or more Web Workers.
 * Contracts (arch §3.10, session prompt §Checkpoint 1):
 *
 *   1. Every AI request carries `PublicState` and a `NodeBudget`. The
 *      typed protocol (./src/workers/protocol.ts) forbids passing a
 *      `MatchState` at compile time; this client honours that surface.
 *
 *   2. Each request is identified by a unique `id`. The worker echoes the
 *      id on the response so concurrent requests do not clobber each other.
 *
 *   3. Requests are cancellable. Cancelling before the response arrives
 *      resolves the caller's promise with a `{ cancelled: true }` marker;
 *      the eventual worker response is dropped. Determinism is not
 *      affected — a re-sent request with the same seed/streamLabel produces
 *      byte-identical output (FR-29).
 *
 *   4. A worker crash rejects every outstanding request with a fatal
 *      error so callers can surface an actionable failure. The client
 *      never fabricates a "success" for a downed worker.
 *
 * This module intentionally holds NO knowledge of match phase, roster, or
 * plotting UI. Callers assemble the correct request payload from their
 * store and hand it to `postAiRequest`.
 */

import type {
  AiDeployRequest,
  AiMoveRequest,
  AiAttackRequest,
  AiRosterRequest,
  AiDeployResponse,
  AiMoveResponse,
  AiAttackResponse,
  AiRosterResponse,
  WorkerErrorKind,
  WorkerRequest,
  WorkerResponse,
} from "../../workers/protocol";
import { WORKER_PROTOCOL_VERSION } from "../../workers/protocol";

/**
 * A request as callers pass it — every field except `id` and `version`
 * (the client fills those in). We use a manual union rather than
 * `Omit<WorkerRequest, "id"|"version">` because `Omit` over a
 * discriminated union collapses the discriminant.
 */
export type AiClientRequest =
  | Omit<AiDeployRequest, "id" | "version">
  | Omit<AiMoveRequest, "id" | "version">
  | Omit<AiAttackRequest, "id" | "version">
  | Omit<AiRosterRequest, "id" | "version">;

/* ------------------------------------------------------------------------- */
/* Public types                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Discriminated union returned by `postAiRequest`. `cancelled` and `error`
 * are terminal but non-fatal to the caller — they never throw. A raw
 * exception from the worker layer becomes an `error` with kind
 * `INTERNAL_DEFECT`.
 */
export type AiCallResult =
  | { readonly kind: "ok"; readonly response: WorkerResponse }
  | { readonly kind: "cancelled"; readonly requestId: number }
  | {
      readonly kind: "error";
      readonly requestId: number;
      readonly errorKind: WorkerErrorKind | "WORKER_DOWN" | "MESSAGE_MALFORMED";
      readonly message: string;
    };

/**
 * Convenience helper — the caller passes the discriminant expected on
 * success and gets a narrowed response back.
 */
export type ExpectedResponseKind = WorkerResponse["kind"];

/**
 * The minimal contract this client requires from a Worker-like target.
 * Real Web Workers, `MessagePort`, `MessageChannel`, and a synchronous
 * in-process handler all satisfy it — which keeps the tests hermetic.
 */
export interface AiWorkerTarget {
  postMessage(msg: WorkerRequest): void;
  addEventListener(
    kind: "message",
    handler: (event: MessageEvent<WorkerResponse>) => void,
  ): void;
  addEventListener(
    kind: "error",
    handler: (event: ErrorEvent) => void,
  ): void;
  removeEventListener(
    kind: "message",
    handler: (event: MessageEvent<WorkerResponse>) => void,
  ): void;
  removeEventListener(
    kind: "error",
    handler: (event: ErrorEvent) => void,
  ): void;
  terminate?(): void;
}

/**
 * Factory used to spin a fresh Web Worker. Kept as a parameter so tests
 * can inject a synchronous target and so a future runtime can swap the
 * bundling strategy without touching this file.
 */
export type AiWorkerFactory = () => AiWorkerTarget;

/**
 * Client configuration.
 *   - `poolSize` — how many workers to keep warm. One is enough for a
 *     match (four AI decisions per phase queued in sequence); the pool
 *     size is left configurable for headless benchmarking.
 *   - `factory` — how to spawn a worker.
 */
export interface AiClientOptions {
  readonly poolSize?: number;
  readonly factory: AiWorkerFactory;
}

/**
 * Outstanding-request bookkeeping — one row per in-flight call. Kept in
 * a Map keyed by request id so cancellation is O(1).
 */
interface OutstandingCall {
  readonly resolve: (result: AiCallResult) => void;
  readonly requestId: number;
  cancelled: boolean;
}

/* ------------------------------------------------------------------------- */
/* Deterministic id sequence                                                  */
/* ------------------------------------------------------------------------- */

/**
 * The client maintains a monotonic per-instance id counter. Ids are ONLY
 * used to multiplex worker responses — they never enter engine state and
 * never affect determinism.
 */
export interface RequestIdSource {
  next(): number;
}

export function createRequestIdSource(start: number = 1): RequestIdSource {
  let counter = start - 1;
  return {
    next(): number {
      counter = counter + 1;
      return counter;
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Client                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Handle returned by `createAiClient`. Callers hold onto it for the
 * lifetime of the match; `dispose` releases every worker.
 */
export interface AiClient {
  /**
   * Post a fully-typed AI request. Returns a promise that resolves with
   * either the response, a cancellation marker, or a structured error.
   * The returned `cancel` closure aborts the specific request; calling
   * it after the response arrives is a safe no-op.
   */
  postAiRequest(
    request: AiClientRequest,
  ): {
    readonly requestId: number;
    readonly result: Promise<AiCallResult>;
    cancel(): void;
  };
  /**
   * Terminate every worker in the pool and drop every outstanding call
   * as `WORKER_DOWN`. Safe to call more than once.
   */
  dispose(): void;
  /**
   * Introspection — the number of in-flight (uncancelled) requests.
   * Used by the store to know whether to enable the commit button.
   */
  inFlightCount(): number;
}

/**
 * Assemble the client. The pool is created lazily on the first request
 * so nothing spawns until the match screen mounts.
 */
export function createAiClient(options: AiClientOptions): AiClient {
  const poolSize = options.poolSize ?? 1;
  if (poolSize < 1) {
    throw new Error(
      `AiClient poolSize must be >= 1; got ${String(poolSize)}.`,
    );
  }
  const ids = createRequestIdSource(1);
  const outstanding = new Map<number, OutstandingCall>();
  const workers: AiWorkerTarget[] = [];
  let nextWorkerIndex = 0;
  let disposed = false;

  function ensurePool(): void {
    if (workers.length > 0) return;
    for (let i = 0; i < poolSize; i = i + 1) {
      workers.push(spawnWorker(options.factory));
    }
  }

  function spawnWorker(factory: AiWorkerFactory): AiWorkerTarget {
    const w = factory();
    const messageHandler = (event: MessageEvent<WorkerResponse>): void => {
      handleMessage(event.data);
    };
    const errorHandler = (event: ErrorEvent): void => {
      handleWorkerDown(
        event.message !== undefined && event.message !== ""
          ? event.message
          : "worker error event",
      );
    };
    w.addEventListener("message", messageHandler);
    w.addEventListener("error", errorHandler);
    return w;
  }

  function pickWorker(): AiWorkerTarget {
    const w = workers[nextWorkerIndex % workers.length];
    nextWorkerIndex = nextWorkerIndex + 1;
    if (w === undefined) {
      throw new Error("AiClient worker pool is empty despite ensurePool().");
    }
    return w;
  }

  function handleMessage(response: WorkerResponse): void {
    if (
      response === null ||
      response === undefined ||
      typeof response !== "object" ||
      typeof (response as { id?: unknown }).id !== "number"
    ) {
      // Malformed message — the pool is now suspect; drop everything.
      handleWorkerDown("Malformed worker response (missing id).");
      return;
    }
    const call = outstanding.get(response.id);
    if (call === undefined) return; // late arrival for a cancelled request
    outstanding.delete(response.id);
    if (call.cancelled) {
      call.resolve({ kind: "cancelled", requestId: response.id });
      return;
    }
    if (response.kind === "ERROR") {
      call.resolve({
        kind: "error",
        requestId: response.id,
        errorKind: response.errorKind,
        message: response.message,
      });
      return;
    }
    call.resolve({ kind: "ok", response });
  }

  function handleWorkerDown(message: string): void {
    for (const [id, call] of outstanding) {
      outstanding.delete(id);
      if (call.cancelled) {
        call.resolve({ kind: "cancelled", requestId: id });
      } else {
        call.resolve({
          kind: "error",
          requestId: id,
          errorKind: "WORKER_DOWN",
          message,
        });
      }
    }
  }

  function postAiRequest(
    request: AiClientRequest,
  ): {
    readonly requestId: number;
    readonly result: Promise<AiCallResult>;
    cancel(): void;
  } {
    if (disposed) {
      throw new Error("AiClient has been disposed.");
    }
    ensurePool();
    const requestId = ids.next();
    const envelope = {
      ...request,
      id: requestId,
      version: WORKER_PROTOCOL_VERSION,
    } as WorkerRequest;

    let resolveFn: (result: AiCallResult) => void = () => undefined;
    const result = new Promise<AiCallResult>((resolve) => {
      resolveFn = resolve;
    });
    const record: OutstandingCall = {
      resolve: resolveFn,
      requestId,
      cancelled: false,
    };
    outstanding.set(requestId, record);
    try {
      pickWorker().postMessage(envelope);
    } catch (err) {
      outstanding.delete(requestId);
      const message = err instanceof Error ? err.message : String(err);
      resolveFn({
        kind: "error",
        requestId,
        errorKind: "MESSAGE_MALFORMED",
        message,
      });
    }
    return {
      requestId,
      result,
      cancel(): void {
        const alive = outstanding.get(requestId);
        if (alive === undefined) return;
        alive.cancelled = true;
        // We intentionally keep the record in outstanding so the eventual
        // response can be swallowed. The response handler flips it to a
        // cancellation resolution.
      },
    };
  }

  function inFlightCount(): number {
    let n = 0;
    for (const [, call] of outstanding) {
      if (!call.cancelled) n = n + 1;
    }
    return n;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    handleWorkerDown("AiClient disposed.");
    for (const w of workers) {
      try {
        w.terminate?.();
      } catch {
        /* ignore */
      }
    }
    workers.length = 0;
  }

  return { postAiRequest, dispose, inFlightCount };
}

/* ------------------------------------------------------------------------- */
/* Narrowing helpers used by the store                                       */
/* ------------------------------------------------------------------------- */

/**
 * Narrow an `AiCallResult` to a deploy response. Returns null on any
 * non-matching kind so the store can retain the raw error surface.
 */
export function asDeployOk(result: AiCallResult): AiDeployResponse | null {
  return result.kind === "ok" && result.response.kind === "AI_DEPLOY_OK"
    ? result.response
    : null;
}

export function asMoveOk(result: AiCallResult): AiMoveResponse | null {
  return result.kind === "ok" && result.response.kind === "AI_MOVE_OK"
    ? result.response
    : null;
}

export function asAttackOk(result: AiCallResult): AiAttackResponse | null {
  return result.kind === "ok" && result.response.kind === "AI_ATTACK_OK"
    ? result.response
    : null;
}

export function asRosterOk(result: AiCallResult): AiRosterResponse | null {
  return result.kind === "ok" && result.response.kind === "AI_ROSTER_OK"
    ? result.response
    : null;
}
