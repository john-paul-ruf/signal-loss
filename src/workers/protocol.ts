/**
 * Typed, cloneable worker protocol (M15).
 *
 * Every request/response is a plain, structurally cloneable object — safe
 * to postMessage between the main thread and a Worker. Every payload
 * carries:
 *   - `id`: caller-generated request id; the worker echoes it verbatim on
 *     the response so callers can multiplex concurrent requests.
 *   - `version`: protocol version (currently 1); the worker refuses any
 *     other version rather than silently interpreting a mismatch.
 *   - `kind`: discriminant tag; the request type set is closed.
 *
 * Fairness contract (FR-24 / arch §3.10):
 *   - AI requests accept `PublicState` ONLY. They CANNOT represent a
 *     `MatchState`, a `HumanDraftPlots`, or another squad's private
 *     intent. This is a compile-time property: a MatchState is not
 *     assignable to a PublicState. A negative fixture test asserts it.
 *   - Every AI request carries an explicit `NodeBudget` — never a wall
 *     clock budget. The worker never reads `Date.now()` / `performance.now()`
 *     in a decision path.
 *
 * The failure surface is closed too — a defect propagates as a typed
 * `WorkerError` rather than a fabricated success.
 */

import type {
  ArchetypeSelector,
  MapResult,
} from "../engine/map/index";
import type {
  Catalog,
  Budget,
  MapArchetype,
  Tunables,
} from "../engine/catalog/index";
import type { Placement, SquadAttackPlot, SquadMovePlots } from "../engine/match/index";
import type { PublicState } from "../engine/view/index";
import type {
  AiDecision,
  AiFailure,
  AiTier,
  AiWeights,
  OpponentModel,
  AiRosterResult,
} from "../engine/ai/index";

/* ------------------------------------------------------------------------- */
/* Version tag                                                                */
/* ------------------------------------------------------------------------- */

export const WORKER_PROTOCOL_VERSION = 1;

/* ------------------------------------------------------------------------- */
/* Base envelope                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Every request / response has this shape. The union types below add the
 * kind-specific fields.
 */
export interface WorkerEnvelope {
  readonly id: number;
  readonly version: 1;
}

/* ------------------------------------------------------------------------- */
/* AI requests                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Shared fields for every AI request. `state` is a `PublicState` — the
 * type deliberately does NOT accept a MatchState. `seed` + `streamLabel`
 * combine to derive the AI's rng: `stream(rngFromSeed(seed), streamLabel)`.
 * `catalog` is the loaded catalog; workers do not re-load from the raw
 * bundle so the request is self-contained.
 */
export interface AiRequestBase extends WorkerEnvelope {
  readonly state: PublicState;
  readonly squadId: number;
  readonly catalog: Catalog;
  readonly seed: string;
  readonly streamLabel: string;
  readonly weights: AiWeights;
  readonly nodeBudget: number;
  readonly tier: AiTier;
  readonly opponentModel: OpponentModel;
}

export interface AiDeployRequest extends AiRequestBase {
  readonly kind: "AI_DEPLOY";
}
export interface AiMoveRequest extends AiRequestBase {
  readonly kind: "AI_MOVE";
}
export interface AiAttackRequest extends AiRequestBase {
  readonly kind: "AI_ATTACK";
}

/**
 * Roster generation request. Does not need a PublicState — the AI generates
 * a fresh roster from catalog + budget + rng only.
 */
export interface AiRosterRequest extends WorkerEnvelope {
  readonly kind: "AI_ROSTER";
  readonly catalog: Catalog;
  readonly budget: Budget;
  readonly seed: string;
  readonly streamLabel: string;
}

export type AiRequest =
  | AiDeployRequest
  | AiMoveRequest
  | AiAttackRequest
  | AiRosterRequest;

/* ------------------------------------------------------------------------- */
/* Map requests                                                                */
/* ------------------------------------------------------------------------- */

export interface MapGenRequest extends WorkerEnvelope {
  readonly kind: "MAP_GEN";
  readonly baseSeed: string;
  readonly selector: ArchetypeSelector;
  readonly archetypes: readonly MapArchetype[];
  readonly tunables: Tunables;
}

export type MapRequest = MapGenRequest;

/* ------------------------------------------------------------------------- */
/* Full request union                                                          */
/* ------------------------------------------------------------------------- */

export type WorkerRequest = AiRequest | MapRequest;

/* ------------------------------------------------------------------------- */
/* Responses                                                                   */
/* ------------------------------------------------------------------------- */

export interface AiDeployResponse extends WorkerEnvelope {
  readonly kind: "AI_DEPLOY_OK";
  readonly decision: AiDecision<readonly Placement[]>;
}
export interface AiMoveResponse extends WorkerEnvelope {
  readonly kind: "AI_MOVE_OK";
  readonly decision: AiDecision<SquadMovePlots>;
}
export interface AiAttackResponse extends WorkerEnvelope {
  readonly kind: "AI_ATTACK_OK";
  readonly decision: AiDecision<SquadAttackPlot>;
}
export interface AiRosterResponse extends WorkerEnvelope {
  readonly kind: "AI_ROSTER_OK";
  readonly result: AiRosterResult;
}

export interface MapGenResponse extends WorkerEnvelope {
  readonly kind: "MAP_GEN_OK";
  readonly result: MapResult;
}

/**
 * Structured error surface. Every failure mode reports a canonical kind
 * so callers can branch without string-matching.
 */
export type WorkerErrorKind =
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_REQUEST_KIND"
  | "AI_FAILURE"
  | "MAP_GENERATION_FAILURE"
  | "MAP_MAX_REGEN"
  | "INTERNAL_DEFECT";

export interface WorkerErrorResponse extends WorkerEnvelope {
  readonly kind: "ERROR";
  readonly errorKind: WorkerErrorKind;
  readonly message: string;
  /** For AI_FAILURE, the underlying typed failure. */
  readonly aiFailure?: AiFailure;
  /** For MAP_MAX_REGEN, the map defect. */
  readonly mapDefect?: { readonly baseSeed: string; readonly attempts: number };
}

export type WorkerResponse =
  | AiDeployResponse
  | AiMoveResponse
  | AiAttackResponse
  | AiRosterResponse
  | MapGenResponse
  | WorkerErrorResponse;

/* ------------------------------------------------------------------------- */
/* Pure handler — used by workers and unit tests                              */
/* ------------------------------------------------------------------------- */

// Handler is implemented in ai.worker.ts / mapgen.worker.ts. This module
// only declares the transport types.
