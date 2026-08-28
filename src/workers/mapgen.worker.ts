/**
 * Map-generation worker entry (M15).
 *
 * Runs the shared `handleMapRequest` handler against every posted message.
 * Handler is exported for unit tests; the entry wires it up to
 * `self.onmessage` inside a Worker context.
 *
 * Contract (arch §3.10):
 *   - No app / platform / DOM imports.
 *   - No wall-clock reads.
 *   - Regeneration exhaustion returns a typed `MAP_MAX_REGEN` error
 *     without a fabricated map; the caller decides what to do.
 */

import { MaxRegenExceededError, generateMap } from "../engine/map/index";
import type {
  MapRequest,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";
import { WORKER_PROTOCOL_VERSION } from "./protocol";

/**
 * Pure request handler. Given a `WorkerRequest`, returns a
 * `WorkerResponse` synchronously. Rejects wrong version + wrong kind up
 * front; catches every defect and returns a typed error.
 */
export function handleMapRequest(req: WorkerRequest): WorkerResponse {
  try {
    if (req.version !== WORKER_PROTOCOL_VERSION) {
      return {
        id: req.id,
        version: WORKER_PROTOCOL_VERSION,
        kind: "ERROR",
        errorKind: "UNSUPPORTED_VERSION",
        message: `Map worker supports protocol version ${WORKER_PROTOCOL_VERSION}; got ${req.version as number}.`,
      };
    }
    if (req.kind !== "MAP_GEN") {
      return {
        id: req.id,
        version: WORKER_PROTOCOL_VERSION,
        kind: "ERROR",
        errorKind: "UNKNOWN_REQUEST_KIND",
        message: `Map worker received a non-map request kind: ${(req as { readonly kind: string }).kind}.`,
      };
    }
    return runMapGen(req);
  } catch (err) {
    if (err instanceof MaxRegenExceededError) {
      return {
        id: req.id,
        version: WORKER_PROTOCOL_VERSION,
        kind: "ERROR",
        errorKind: "MAP_MAX_REGEN",
        message: err.message,
        mapDefect: {
          baseSeed: err.defect.baseSeed,
          attempts: err.defect.attempts.length,
        },
      };
    }
    return {
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "ERROR",
      errorKind: "INTERNAL_DEFECT",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function runMapGen(req: MapRequest): WorkerResponse {
  const result = generateMap(req.baseSeed, req.selector, req.archetypes, req.tunables);
  return {
    id: req.id,
    version: WORKER_PROTOCOL_VERSION,
    kind: "MAP_GEN_OK",
    result,
  };
}

/* ------------------------------------------------------------------------- */
/* Worker entry wiring                                                        */
/* ------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anySelf: any = typeof self !== "undefined" ? self : undefined;
if (anySelf !== undefined && typeof anySelf.addEventListener === "function") {
  anySelf.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
    const response = handleMapRequest(event.data);
    anySelf.postMessage(response);
  });
}
