/**
 * Shared AI types (M11).
 *
 * The three tiers differ in POLICY only — search depth / opponent modelling
 * quality / anti-kingmaking sophistication. Every tier consumes the same
 * `PublicState` projection, obeys the same `AiWeights` coefficients, and is
 * bounded by an explicit `NodeBudget` (never a wall-clock budget). No tier
 * has access to `MatchState`, human draft plots, or another squad's private
 * intent — a compile-time negative fixture verifies this.
 *
 * The AI is a deterministic function: `(publicState, squadId, rng, weights,
 * nodeBudget) → decision`. Two calls with equal inputs produce equal outputs
 * INCLUDING the returned `rng` — one of the AD-4 tiebreak requirements.
 */

import type { Fx } from "../fx/index";
import type { Rng } from "../rng/index";
import type { ConstructId, SquadId } from "../match/index";
import type { Violation } from "../build/index";

/* ------------------------------------------------------------------------- */
/* Tier / budget                                                              */
/* ------------------------------------------------------------------------- */

/**
 * The three AI difficulty tiers. Higher tier means richer search and
 * opponent modelling; NEVER richer information, larger pool, or relaxed
 * legality.
 */
export type AiTier = 1 | 2 | 3;

/**
 * Deterministic node budget. Every search implementation counts every
 * evaluated candidate against this and truncates the moment the count is
 * reached — no time-based interrupt.
 */
declare const brandNodeBudget: unique symbol;
export type NodeBudget = number & { readonly [brandNodeBudget]: "NodeBudget" };

/** Cast a positive integer to `NodeBudget`. */
export function nodeBudget(value: number): NodeBudget {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`nodeBudget: expected positive integer; got ${value}.`);
  }
  return value as NodeBudget;
}

/* ------------------------------------------------------------------------- */
/* Injected tunables                                                          */
/* ------------------------------------------------------------------------- */

/**
 * All rule-affecting AI coefficients. Passed in by the caller (Session 06
 * will author release values); the AI reads no numeric literal for a
 * decision term. Every weight is an integer (fixed-point, or an integer
 * scalar); AI eval never uses floats (§4.1 rule-path float ban).
 *
 * Terms:
 *   - `damageWeight`: value of a point of damage.
 *   - `killBonus`: extra reward for a shot that destroys a target.
 *   - `commanderBonus`: extra reward for damaging the enemy commander.
 *   - `commanderProtection`: penalty for exposing OWN commander.
 *   - `traceSafetyBonus`: reward for ending inside the current safe region.
 *   - `traceExposurePenalty`: penalty for ending outside a trace safe region.
 *   - `exposurePenalty`: penalty per point of expected retaliation.
 *   - `poolWastePenalty`: penalty per unused pool point committed.
 *   - `postureCost`: base cost for taking POSTURE (competes with damage).
 *   - `calledCost`: base cost for taking a called shot.
 *   - `positionUtility`: reward for finishing within resolutionRange of a target.
 *   - `kingmakingPenalty`: penalty applied Tier 3 when concentrating on the
 *     current leader; scaled by the leader's advantage over the pack.
 *   - `postureRateNumer/Denom`: Tier 1 baseline posture rate (numer/denom).
 *   - `calledRateNumer/Denom`: Tier 1 baseline called-shot rate (numer/denom).
 *   - `postureExposureNumer/Denom`: extra posture weight per exposed integrity
 *     unit at start of round.
 *   - `beamWidth`, `beamDepth`: Tier 3 beam-search bounds.
 *   - `deployCoverBonus`: reward per nearby cover wall at deployment time.
 *   - `deployTraceBonus`: reward for deploying inside the round-1 safe region.
 *   - `deploySamples`: minimum sample count when picking a deployment slot.
 *
 * All values are integer scalars. Ratios are (numer, denom) pairs so no
 * float is ever multiplied.
 */
export interface AiWeights {
  readonly damageWeight: number;
  readonly killBonus: number;
  readonly commanderBonus: number;
  readonly commanderProtection: number;
  readonly traceSafetyBonus: number;
  readonly traceExposurePenalty: number;
  readonly exposurePenalty: number;
  readonly poolWastePenalty: number;
  readonly postureCost: number;
  readonly calledCost: number;
  readonly positionUtility: number;
  readonly kingmakingPenalty: number;
  readonly postureRateNumer: number;
  readonly postureRateDenom: number;
  readonly calledRateNumer: number;
  readonly calledRateDenom: number;
  readonly postureExposureNumer: number;
  readonly postureExposureDenom: number;
  readonly beamWidth: number;
  readonly beamDepth: number;
  readonly deployCoverBonus: number;
  readonly deployTraceBonus: number;
  readonly deploySamples: number;
}

/* ------------------------------------------------------------------------- */
/* Diagnostics — returned but never on rule state                              */
/* ------------------------------------------------------------------------- */

/**
 * Structured diagnostics for one AI decision. Consumed by the harness /
 * costing battery to validate node accounting, information-boundary
 * assertions, and tier-quality ordering. NEVER persisted in MatchState /
 * PublicState / Event.
 */
export interface AiDiagnostics {
  readonly tier: AiTier;
  readonly nodesVisited: number;
  readonly nodeBudget: number;
  readonly candidateCount: number;
  readonly selectedIds: readonly number[];
  /** Named score components (aggregate) for the selected decision. */
  readonly scoreTerms: Readonly<Record<string, number>>;
}

/**
 * Every AI decision returns its choice plus diagnostics plus the advanced
 * `Rng` so the caller can seed the next decision with the correct state.
 */
export interface AiDecision<T> {
  readonly choice: T;
  readonly diagnostics: AiDiagnostics;
  readonly rng: Rng;
}

/* ------------------------------------------------------------------------- */
/* Typed failures                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Structured AI failure. The AI never fabricates a legal decision; a
 * catalog / budget / state combination that admits no legal roster or
 * plot surfaces as a typed error and the caller decides how to handle it.
 */
export type AiFailure =
  | {
      readonly kind: "NO_LEGAL_ROSTER";
      readonly message: string;
      readonly budget: number;
    }
  | {
      readonly kind: "ROSTER_INVALID";
      readonly message: string;
      readonly violations: readonly Violation[];
    }
  | {
      readonly kind: "NO_LEGAL_DEPLOYMENT";
      readonly message: string;
      readonly squadId: SquadId;
    }
  | {
      readonly kind: "NO_LEGAL_CANDIDATES";
      readonly message: string;
      readonly squadId: SquadId;
    }
  | {
      readonly kind: "STATE_UNRESOLVED";
      readonly message: string;
    };

export type AiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AiFailure };

/* ------------------------------------------------------------------------- */
/* Candidate types                                                            */
/* ------------------------------------------------------------------------- */

/**
 * One candidate move plot for a single construct. `path` is normalized:
 * either empty (HOLD) or a polyline whose first vertex equals the
 * construct's current confirmed position. `endPosition` caches the last
 * vertex so scorers do not repeatedly look it up. Every candidate is
 * legality-checked by `generateMoveCandidates` before being returned.
 */
export interface MoveCandidate {
  readonly constructId: ConstructId;
  readonly path: readonly { readonly x: Fx; readonly y: Fx }[];
  readonly endPosition: { readonly x: Fx; readonly y: Fx };
  /** Stable index within its construct's candidate list — used for tiebreaks. */
  readonly index: number;
}

/**
 * One candidate attack plot. `null` targetId means "no shot" (do not fire
 * this round); explicit rather than omission so ordering + tiebreaks over
 * the whole candidate list stay uniform.
 */
export interface AttackCandidate {
  readonly constructId: ConstructId;
  readonly targetId: ConstructId | null;
  readonly called: boolean;
  readonly index: number;
}

/**
 * One candidate posture assignment for a construct.
 */
export interface PostureCandidate {
  readonly constructId: ConstructId;
  readonly posture: "FLAT" | "POSTURE";
  readonly index: number;
}
