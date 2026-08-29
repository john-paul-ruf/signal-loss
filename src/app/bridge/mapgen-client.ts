/**
 * Map-generation worker client (M17 bridge, session 02 checkpoint 1).
 *
 * A thin, typed request/response envelope over the map-generation Worker
 * (`./src/workers/mapgen.worker.ts`). It mirrors the transport behaviour of
 * the AI client (`./ai-client.ts`) but keeps its public surface map-specific.
 *
 * Contracts (session prompt §Checkpoint 1):
 *
 *   1. Each request is identified by a client-generated `id`. The worker
 *      echoes it on the response so concurrent requests never clobber each
 *      other.
 *
 *   2. Requests are cancellable. Cancelling before the response arrives
 *      resolves the caller's promise with a `cancelled` marker; the eventual
 *      worker response is swallowed. Determinism is unaffected — a re-sent
 *      request with the same `baseSeed`/`selector` produces byte-identical
 *      output.
 *
 *   3. The failure surface is closed and distinguishable: a malformed
 *      message, a worker `error` event, a typed protocol error, and the
 *      `MAP_MAX_REGEN` regeneration exhaustion each stay separable to
 *      callers. The client NEVER retries or relaxes generation — the
 *      worker's typed error is the product-visible truth.
 *
 *   4. `dispose()` terminates the worker and resolves every outstanding call
 *      as `WORKER_DOWN` without throwing.
 */

import type {
  MapGenRequest,
  MapGenResponse,
  WorkerErrorKind,
  WorkerRequest,
  WorkerResponse,
} from "../../workers/protocol";
import { WORKER_PROTOCOL_VERSION } from "../../workers/protocol";

/* ------------------------------------------------------------------------- */
/* Public types                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Discriminated union returned by `MapGenClient.request`. `cancelled` and
 * `error` are terminal but never throw. `MAP_MAX_REGEN` arrives verbatim in
 * the `errorKind` of an `error` result, so callers can branch on regeneration
 * exhaustion without string-matching.
 */
export type MapGenCallResult =
  | { readonly kind: "ok"; readonly response: MapGenResponse }
  | { readonly kind: "cancelled"; readonly requestId: number }
  | {
      readonly kind: "error";
      readonly requestId: number;
      readonly errorKind: WorkerErrorKind | "WORKER_DOWN" | "MESSAGE_MALFORMED";
      readonly message: string;
    };

/**
 * The minimal contract this client requires from a Worker-like target. Real
 * Web Workers, `MessagePort`, and a synchronous in-process fake all satisfy
 * it — which keeps the tests hermetic.
 */
export interface MapWorkerTarget {
  postMessage(msg: WorkerRequest): void;
  addEventListener(
    kind: "message",
    handler: (event: MessageEvent<WorkerResponse>) => void,
  ): void;
  addEventListener(kind: "error", handler: (event: ErrorEvent) => void): void;
  terminate?(): void;
}

/** Factory used to spawn a fresh map worker. Injected so tests stay hermetic. */
export type MapWorkerFactory = () => MapWorkerTarget;

export interface MapGenClientOptions {
  readonly factory: MapWorkerFactory;
}

/**
 * Handle returned by `createMapGenClient`. Held for the lifetime of the setup
 * flow; `dispose` releases the worker.
 */
export interface MapGenClient {
  /**
   * Post a map-generation request. Returns a promise that resolves with the
   * response, a cancellation marker, or a structured error. The returned
   * `cancel` closure aborts the specific request; calling it after the
   * response arrives is a safe no-op.
   */
  request(input: Omit<MapGenRequest, "id" | "version">): {
    readonly requestId: number;
    readonly result: Promise<MapGenCallResult>;
    cancel(): void;
  };
  /** Terminate the worker and drop every outstanding call as `WORKER_DOWN`. */
  dispose(): void;
  /** The number of in-flight (uncancelled) requests. */
  inFlightCount(): number;
}

/* ------------------------------------------------------------------------- */
/* Client                                                                    */
/* ------------------------------------------------------------------------- */

interface OutstandingCall {
  readonly resolve: (result: MapGenCallResult) => void;
  readonly requestId: number;
  cancelled: boolean;
}

/**
 * Assemble the client. The worker is created lazily on the first request so
 * nothing spawns until the setup screen asks for a map.
 */
export function createMapGenClient(options: MapGenClientOptions): MapGenClient {
  const outstanding = new Map<number, OutstandingCall>();
  let worker: MapWorkerTarget | null = null;
  let counter = 0;
  let disposed = false;

  function ensureWorker(): MapWorkerTarget {
    if (worker !== null) return worker;
    const w = options.factory();
    w.addEventListener("message", (event: MessageEvent<WorkerResponse>): void => {
      handleMessage(event.data);
    });
    w.addEventListener("error", (event: ErrorEvent): void => {
      handleWorkerDown(
        event.message !== undefined && event.message !== ""
          ? event.message
          : "worker error event",
      );
    });
    worker = w;
    return w;
  }

  function handleMessage(response: WorkerResponse): void {
    if (
      response === null ||
      response === undefined ||
      typeof response !== "object" ||
      typeof (response as { id?: unknown }).id !== "number"
    ) {
      // Missing id — the worker is now suspect; drop everything.
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
    if (response.kind === "MAP_GEN_OK") {
      call.resolve({ kind: "ok", response });
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
    // A well-formed response of an unexpected kind (e.g. an AI response on the
    // map channel) is a protocol violation for this request only.
    call.resolve({
      kind: "error",
      requestId: response.id,
      errorKind: "MESSAGE_MALFORMED",
      message: `Map worker returned an unexpected response kind: ${response.kind}.`,
    });
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

  function request(input: Omit<MapGenRequest, "id" | "version">): {
    readonly requestId: number;
    readonly result: Promise<MapGenCallResult>;
    cancel(): void;
  } {
    if (disposed) {
      throw new Error("MapGenClient has been disposed.");
    }
    const target = ensureWorker();
    counter = counter + 1;
    const requestId = counter;
    const envelope: MapGenRequest = {
      ...input,
      id: requestId,
      version: WORKER_PROTOCOL_VERSION,
    };

    let resolveFn: (result: MapGenCallResult) => void = () => undefined;
    const result = new Promise<MapGenCallResult>((resolve) => {
      resolveFn = resolve;
    });
    outstanding.set(requestId, { resolve: resolveFn, requestId, cancelled: false });
    try {
      target.postMessage(envelope);
    } catch (err) {
      outstanding.delete(requestId);
      resolveFn({
        kind: "error",
        requestId,
        errorKind: "MESSAGE_MALFORMED",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return {
      requestId,
      result,
      cancel(): void {
        const alive = outstanding.get(requestId);
        if (alive === undefined) return;
        // Keep the record so the eventual worker response is swallowed; the
        // message handler flips it to a cancellation resolution.
        alive.cancelled = true;
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
    handleWorkerDown("MapGenClient disposed.");
    try {
      worker?.terminate?.();
    } catch {
      /* ignore */
    }
    worker = null;
  }

  return { request, dispose, inFlightCount };
}

/* ------------------------------------------------------------------------- */
/* Browser factory                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Spawn a real map worker in the browser using Vite's module-worker pattern.
 * Tests inject a synchronous fake instead of calling this.
 */
export function browserMapGenWorker(): MapWorkerTarget {
  return new Worker(new URL("../../workers/mapgen.worker.ts", import.meta.url), {
    type: "module",
  });
}
