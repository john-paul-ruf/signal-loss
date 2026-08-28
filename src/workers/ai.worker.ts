/**
 * AI worker entry (M15).
 *
 * The worker runs the shared `handleAiRequest` handler against every
 * posted message. The handler is exported separately so unit tests can
 * exercise it without a Worker context. The entry-file wiring at the
 * bottom of the module registers a `self.onmessage` listener when
 * running inside a Worker.
 *
 * Contract (arch §3.10):
 *   - Reads NO Date / performance / random API. Determinism is enforced
 *     by (seed, streamLabel, nodeBudget) — the caller's rng derivation.
 *   - Imports NO ./src/app or ./src/platform code (enforced by ESLint's
 *     import-restricted zones for the engine, and by review here).
 *   - Catches every thrown defect and returns a typed `WorkerErrorResponse`;
 *     never fabricates a legal decision.
 */

import { rngFromSeed, stream } from "../engine/rng/index";
import {
  aiAttackPlot,
  aiDeploy,
  aiMovePlot,
  generateAiRoster,
  nodeBudget as makeNodeBudget,
} from "../engine/ai/index";
import type { AiFailure } from "../engine/ai/index";
import type { SquadId } from "../engine/match/index";
import type {
  AiRequest,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";
import { WORKER_PROTOCOL_VERSION } from "./protocol";

/**
 * Pure request handler. Given a `WorkerRequest`, returns a
 * `WorkerResponse` synchronously. All caller-supplied inputs are already
 * validated by type; the handler enforces the version tag and dispatches
 * on `kind`. Any thrown defect becomes an `INTERNAL_DEFECT` error rather
 * than escaping the handler.
 */
export function handleAiRequest(req: WorkerRequest): WorkerResponse {
  try {
    if (req.version !== WORKER_PROTOCOL_VERSION) {
      return {
        id: req.id,
        version: WORKER_PROTOCOL_VERSION,
        kind: "ERROR",
        errorKind: "UNSUPPORTED_VERSION",
        message: `AI worker supports protocol version ${WORKER_PROTOCOL_VERSION}; got ${req.version as number}.`,
      };
    }
    if (
      req.kind !== "AI_DEPLOY" &&
      req.kind !== "AI_MOVE" &&
      req.kind !== "AI_ATTACK" &&
      req.kind !== "AI_ROSTER"
    ) {
      return {
        id: req.id,
        version: WORKER_PROTOCOL_VERSION,
        kind: "ERROR",
        errorKind: "UNKNOWN_REQUEST_KIND",
        message: `AI worker received a non-AI request kind: ${(req as { readonly kind: string }).kind}.`,
      };
    }
    return dispatchAi(req);
  } catch (err) {
    return {
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "ERROR",
      errorKind: "INTERNAL_DEFECT",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Dispatch a well-typed AI request to the correct engine function.
 * Derives the rng from `(seed, streamLabel)` deterministically.
 */
function dispatchAi(req: AiRequest): WorkerResponse {
  if (req.kind === "AI_ROSTER") {
    const rng = stream(rngFromSeed(req.seed), req.streamLabel);
    const result = generateAiRoster(rng, req.budget, req.catalog);
    if (!result.ok) {
      return {
        id: req.id,
        version: WORKER_PROTOCOL_VERSION,
        kind: "ERROR",
        errorKind: "AI_FAILURE",
        message: result.error.message,
        aiFailure: result.error,
      };
    }
    return {
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "AI_ROSTER_OK",
      result: result.value,
    };
  }
  const rng = stream(rngFromSeed(req.seed), req.streamLabel);
  const bud = makeNodeBudget(req.nodeBudget);
  if (req.kind === "AI_DEPLOY") {
    const out = aiDeploy(
      req.state,
      req.squadId as SquadId,
      req.catalog,
      rng,
      req.weights,
      bud,
    );
    if (!out.ok) {
      return errorFromAi(req.id, out.error);
    }
    return {
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "AI_DEPLOY_OK",
      decision: out.value,
    };
  }
  if (req.kind === "AI_MOVE") {
    const out = aiMovePlot(
      req.state,
      req.squadId as SquadId,
      req.catalog,
      rng,
      req.weights,
      bud,
      req.tier,
      req.opponentModel,
    );
    if (!out.ok) {
      return errorFromAi(req.id, out.error);
    }
    return {
      id: req.id,
      version: WORKER_PROTOCOL_VERSION,
      kind: "AI_MOVE_OK",
      decision: out.value,
    };
  }
  // req.kind === "AI_ATTACK"
  const out = aiAttackPlot(
    req.state,
    req.squadId as SquadId,
    req.catalog,
    rng,
    req.weights,
    bud,
    req.tier,
    req.opponentModel,
  );
  if (!out.ok) {
    return errorFromAi(req.id, out.error);
  }
  return {
    id: req.id,
    version: WORKER_PROTOCOL_VERSION,
    kind: "AI_ATTACK_OK",
    decision: out.value,
  };
}

function errorFromAi(id: number, failure: AiFailure): WorkerResponse {
  return {
    id,
    version: WORKER_PROTOCOL_VERSION,
    kind: "ERROR",
    errorKind: "AI_FAILURE",
    message: failure.message,
    aiFailure: failure,
  };
}

/* ------------------------------------------------------------------------- */
/* Worker entry wiring                                                        */
/* ------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anySelf: any = typeof self !== "undefined" ? self : undefined;
if (anySelf !== undefined && typeof anySelf.addEventListener === "function") {
  anySelf.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
    const response = handleAiRequest(event.data);
    anySelf.postMessage(response);
  });
}
