/**
 * The complete, ordered, plain-language record of everything that happens in
 * one round. `Event[]` is the sole playback input (FR-26) and the sole
 * source of the round log (design.md §5.8) and reduced-motion card list
 * (§7.10). Every field an animation would convey MUST be present here.
 *
 * Ordering (canonical, session prompt "one declared total order"):
 *   1. `DEPLOYMENT_REVEAL` (once, at start of round 1)
 *   2. `POOL_REFILL` per squad (ascending squadId)
 *   3. `MOVED` and `HALTED` events per construct (ascending id), interleaved
 *      in the order of the substep at which they occurred
 *   4. `POSTURE_REVEAL` per construct (ascending id)
 *   5. `SHOT` events per attacker (ascending id)
 *   6. `DEFENSE_INFO` events immediately after each `SHOT` if the shot was
 *      blocked / out of range / no LOS
 *   7. `DAMAGE_APPLIED` per target (ascending id)
 *   8. `DIAL_ADVANCED` per construct (ascending id)
 *   9. `TRACE_DAMAGE` per construct (ascending id)
 *  10. `DESTROYED` per construct (ascending id)
 *  11. `ELIMINATED` per squad (ascending squadId)
 *  12. `MATCH_COMPLETE` (once, if the match ended this round)
 *
 * The order is enforced by `sortEventsCanonical` in this module. Callers
 * MUST rely on this ordering for byte-identical replay, not on the natural
 * emission order of the resolution stages.
 */

import type { Vec2 } from "../fx/index";
import type { ConstructId, SquadId } from "./state";

/* ------------------------------------------------------------------------- */
/* Event kinds — one discriminant per rule concept                            */
/* ------------------------------------------------------------------------- */

/** Emitted once at round 1's start summarizing the simultaneous reveal. */
export interface DeploymentRevealEvent {
  readonly kind: "DEPLOYMENT_REVEAL";
  readonly round: number;
  readonly placements: readonly {
    readonly constructId: ConstructId;
    readonly squadId: SquadId;
    readonly position: Vec2;
  }[];
}

/** Emitted at each round's refill with the full FR-17 breakdown. */
export interface PoolRefillEvent {
  readonly kind: "POOL_REFILL";
  readonly round: number;
  readonly squadId: SquadId;
  readonly total: number;
  readonly base: 1;
  readonly commanderBase: number;
  readonly aliveCount: number;
  readonly rDivisor: number;
  readonly unitTerm: number;
  readonly commanderLost: boolean;
}

/**
 * A construct's completed movement for the round. `pathDistance` is the
 * arc length actually traversed at halt (or full plotted length otherwise);
 * `stopPosition` is the final resting place. `plottedLength` records the
 * originally plotted total path length so playback can render the
 * unwalked stub. `plottedPath` is the engine-normalized polyline used by
 * resolution; it is presentation-only and is never copied into MatchState.
 */
export interface MovedEvent {
  readonly kind: "MOVED";
  readonly round: number;
  readonly constructId: ConstructId;
  readonly from: Vec2;
  readonly stopPosition: Vec2;
  readonly plottedPath: readonly Vec2[];
  readonly pathDistance: number;   // fx integer (walked arc length)
  readonly plottedLength: number;  // fx integer (originally plotted)
  readonly halted: boolean;
}

/** Explicit halt event, one per haltee, naming the other constructs. */
export interface HaltedEvent {
  readonly kind: "HALTED";
  readonly round: number;
  readonly constructId: ConstructId;
  readonly stopPosition: Vec2;
  readonly withConstructs: readonly ConstructId[]; // sorted
  readonly reason: "CONTACT";                       // reserved for future kinds
  readonly atSubstep: number;                       // 1..MOVE_SUBSTEPS
}

/** Reveal each construct's committed posture at the top of resolution. */
export interface PostureRevealEvent {
  readonly kind: "POSTURE_REVEAL";
  readonly round: number;
  readonly constructId: ConstructId;
  readonly posture: "FLAT" | "POSTURE";
  readonly squadId: SquadId;
}

/** One committed shot's outcome (attempted or landed). */
export interface ShotEvent {
  readonly kind: "SHOT";
  readonly round: number;
  readonly attackerId: ConstructId;
  readonly targetId: ConstructId;
  readonly called: boolean;
  readonly landed: boolean;    // false when blocked / out of range / no LOS
  readonly damage: number;      // integer applied to target on landing
  readonly targetPosture: "FLAT" | "POSTURE";
  readonly baseDamage: number;  // dial-state damage output (pre-matrix)
}

/** Explanation of a shot that did not land. Emitted immediately after SHOT. */
export interface DefenseInfoEvent {
  readonly kind: "DEFENSE_INFO";
  readonly round: number;
  readonly attackerId: ConstructId;
  readonly targetId: ConstructId;
  readonly reason: "OUT_OF_RANGE" | "NO_LOS" | "TARGET_DESTROYED";
}

/** Aggregated damage applied to one target this round. */
export interface DamageAppliedEvent {
  readonly kind: "DAMAGE_APPLIED";
  readonly round: number;
  readonly targetId: ConstructId;
  readonly damage: number;
}

/** Dial advance for one construct. `to` is the new (already-advanced) index. */
export interface DialAdvancedEvent {
  readonly kind: "DIAL_ADVANCED";
  readonly round: number;
  readonly constructId: ConstructId;
  readonly from: number;
  readonly to: number;
}

/** Trace damage applied to one construct this round. */
export interface TraceDamageEvent {
  readonly kind: "TRACE_DAMAGE";
  readonly round: number;
  readonly constructId: ConstructId;
  readonly damage: number;
  readonly stepIndex: number;
  readonly safeRegionRound: number;
}

/** Construct destroyed. Emit once per destruction. */
export interface DestroyedEvent {
  readonly kind: "DESTROYED";
  readonly round: number;
  readonly constructId: ConstructId;
  readonly squadId: SquadId;
  readonly cause: "ATTACK" | "TRACE";
  readonly wasCommander: boolean;
}

/** Squad eliminated. Emit once per squad. */
export interface EliminatedEvent {
  readonly kind: "ELIMINATED";
  readonly round: number;
  readonly squadId: SquadId;
  readonly placement: 1 | 2 | 3 | 4 | 5;
}

/** Terminal event when the match ends this round. */
export interface MatchCompleteEvent {
  readonly kind: "MATCH_COMPLETE";
  readonly round: number;
  readonly winner: SquadId | null;
  readonly reason: "HUMAN_ELIMINATED" | "LAST_STANDING" | "SIMULTANEOUS";
}

export type Event =
  | DeploymentRevealEvent
  | PoolRefillEvent
  | MovedEvent
  | HaltedEvent
  | PostureRevealEvent
  | ShotEvent
  | DefenseInfoEvent
  | DamageAppliedEvent
  | DialAdvancedEvent
  | TraceDamageEvent
  | DestroyedEvent
  | EliminatedEvent
  | MatchCompleteEvent;

/* ------------------------------------------------------------------------- */
/* Canonical ordering                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Canonical order of every kind — used as the primary sort key. Kinds not
 * enumerated here are treated as the last group by design (extension slot).
 */
const KIND_ORDER: Readonly<Record<Event["kind"], number>> = {
  DEPLOYMENT_REVEAL: 0,
  POOL_REFILL: 1,
  MOVED: 2,
  HALTED: 2, // interleaved with MOVED by construct id / substep
  POSTURE_REVEAL: 3,
  SHOT: 4,
  DEFENSE_INFO: 5,
  DAMAGE_APPLIED: 6,
  DIAL_ADVANCED: 7,
  TRACE_DAMAGE: 8,
  DESTROYED: 9,
  ELIMINATED: 10,
  MATCH_COMPLETE: 11,
};

/**
 * Return the "primary integer id" this event anchors on, for secondary
 * sort inside a kind group. Squads have priority over constructs where
 * both exist (deployment reveal has neither → 0).
 */
function primaryId(e: Event): number {
  switch (e.kind) {
    case "DEPLOYMENT_REVEAL":
      return 0;
    case "POOL_REFILL":
      return e.squadId as number;
    case "MOVED":
    case "HALTED":
      return e.constructId as number;
    case "POSTURE_REVEAL":
      return e.constructId as number;
    case "SHOT":
      return e.attackerId as number;
    case "DEFENSE_INFO":
      return e.attackerId as number;
    case "DAMAGE_APPLIED":
      return e.targetId as number;
    case "DIAL_ADVANCED":
      return e.constructId as number;
    case "TRACE_DAMAGE":
      return e.constructId as number;
    case "DESTROYED":
      return e.constructId as number;
    case "ELIMINATED":
      return e.squadId as number;
    case "MATCH_COMPLETE":
      return 0;
  }
}

/**
 * MOVED and HALTED are in the same kind group; their tiebreak inside that
 * group is (constructId asc, substep asc, kind: MOVED before HALTED for the
 * same construct/substep).
 */
function secondaryTiebreak(a: Event, b: Event): number {
  if (a.kind === "HALTED" && b.kind === "HALTED") {
    if (a.atSubstep !== b.atSubstep) return a.atSubstep - b.atSubstep;
  }
  if (a.kind === "MOVED" && b.kind === "HALTED") return -1;
  if (a.kind === "HALTED" && b.kind === "MOVED") return 1;
  if (a.kind === "SHOT" && b.kind === "SHOT") {
    if ((a.targetId as number) !== (b.targetId as number)) {
      return (a.targetId as number) - (b.targetId as number);
    }
  }
  if (a.kind === "DEFENSE_INFO" && b.kind === "DEFENSE_INFO") {
    if ((a.targetId as number) !== (b.targetId as number)) {
      return (a.targetId as number) - (b.targetId as number);
    }
  }
  return 0;
}

/**
 * Sort a list of events into their canonical replay order. Deterministic,
 * order-independent w.r.t. the calling stage's emission order. Stability
 * is guaranteed by the tiebreak returning 0 identically for equal keys and
 * the sort being a plain comparator.
 */
export function sortEventsCanonical(events: readonly Event[]): readonly Event[] {
  const copy = events.slice();
  copy.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    const ka = KIND_ORDER[a.kind];
    const kb = KIND_ORDER[b.kind];
    if (ka !== kb) return ka - kb;
    const pa = primaryId(a);
    const pb = primaryId(b);
    if (pa !== pb) return pa - pb;
    return secondaryTiebreak(a, b);
  });
  return copy;
}
