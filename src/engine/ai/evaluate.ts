/**
 * Shared derived-stat evaluator (M11).
 *
 * ONE evaluator serves every tier. Tier differences live in `policy.ts` and
 * `search.ts`; scoring math never varies by tier. Consequences:
 *   - "Unknown arrangements of known parts" score identically at every tier.
 *   - Adding a new chassis / mount / commander cannot silently break a
 *     tier-specific fast path — there is none.
 *   - Every AI decision term reads from `weights` (`AiWeights`) — no numeric
 *     literals leak into rule paths.
 *
 * Score philosophy:
 *   - Positive = better for the observer's squad.
 *   - Every term is an integer, computed from fx / catalog / dial state only.
 *   - Aggregate is a plain sum (no non-linear combination) so tier-3 anti-
 *     kingmaking terms compose without invalidating the tier-1 rankings.
 */

import type { Vec2 } from "../fx/index";
import { segIntersect } from "../fx/index";
import type { Catalog } from "../catalog/index";
import type { KnownConstruct, PublicState } from "../view/index";
import type { WallSegment } from "../map/index";
import {
  currentDialStateOf,
  effectiveAttackRangeOf,
  effectiveDamageOf,
  effectiveDialLengthOf,
  ownAliveConstructs,
} from "./candidates";
import type { AiWeights } from "./types";

/* ------------------------------------------------------------------------- */
/* Attack scoring                                                              */
/* ------------------------------------------------------------------------- */

/** Structured breakdown of one attack decision's score. */
export interface AttackTerms {
  /** Integer damage expected on landing (post-matrix, floor, min-1). */
  readonly expectedDamage: number;
  /** killBonus (>0) if the shot would destroy the target given its integrity. */
  readonly killBonus: number;
  /** commanderBonus (>0) if the target is a commander. */
  readonly commanderBonus: number;
  /** commanderProtection ADDS to the score (positive) when NOT firing on a
   *  target that would leave own commander in a threatened exchange —
   *  in Tier 1 this term is zero for attack scores; the MOVE scorer uses it. */
  readonly calledCost: number;
}

export interface ScoredAttack {
  readonly score: number;
  readonly expectedDamage: number;
  readonly isKill: boolean;
  readonly targetIsCommander: boolean;
  readonly terms: AttackTerms;
}

/**
 * Score one attack candidate: attacker fires at `target` with the given
 * `called` flag. Assumes target posture = FLAT for Tier 1 (no opponent
 * modelling); Tier 2 overrides via the `postureFrequency` parameter.
 *
 * The matrix cell values come from the SAME `applyMatrix` semantics the
 * engine uses at resolution (FR-18): normal-into-posture is exactly 0;
 * called-into-flat is 3/2; called-into-posture is 1/2; every landing shot
 * has a min-1 floor except the zero cell.
 */
export function scoreAttackCandidate(
  attacker: KnownConstruct,
  target: KnownConstruct,
  called: boolean,
  postureFrequencyNumer: number, // Tier 1 passes 0; Tier 2+ passes observed.
  postureFrequencyDenom: number, // Tier 1 passes 1.
  catalog: Catalog,
  weights: AiWeights,
): ScoredAttack {
  const baseDamage = effectiveDamageOf(attacker, catalog);
  // Blended damage across FLAT/POSTURE weighted by observed frequency.
  // Integer math: dmgFlat and dmgPosture are integers; blend uses ratio.
  const dmgFlat = matrixDamage(baseDamage, called, "FLAT");
  const dmgPosture = matrixDamage(baseDamage, called, "POSTURE");
  const denom = postureFrequencyDenom;
  const numer = postureFrequencyNumer;
  const expectedDamage = Math.floor(
    (dmgFlat * (denom - numer) + dmgPosture * numer) / denom,
  );
  const remainingIntegrity =
    effectiveDialLengthOf(target, catalog) - target.base.dialIndex;
  const isKill = expectedDamage >= remainingIntegrity && remainingIntegrity > 0;
  const targetIsCommander = target.base.commanderCode !== null;
  const damageScore = expectedDamage * weights.damageWeight;
  const killScore = isKill ? weights.killBonus : 0;
  const commanderScore = targetIsCommander ? weights.commanderBonus : 0;
  const calledCost = called ? weights.calledCost : 0;
  const score = damageScore + killScore + commanderScore - calledCost;
  return {
    score,
    expectedDamage,
    isKill,
    targetIsCommander,
    terms: {
      expectedDamage,
      killBonus: killScore,
      commanderBonus: commanderScore,
      calledCost,
    },
  };
}

/** Matrix damage integer (mirrors match/attack.ts applyMatrix). */
function matrixDamage(
  baseDamage: number,
  called: boolean,
  targetPosture: "FLAT" | "POSTURE",
): number {
  if (!called && targetPosture === "POSTURE") return 0;
  const num = called ? 3 : 1;
  const den = called ? 2 : 1;
  const denPost = targetPosture === "POSTURE" ? 2 : 1;
  // Called + FLAT: 3/2 base; Called + POSTURE: 1/2 base; Normal + FLAT: base.
  const rawScaled = called
    ? targetPosture === "POSTURE"
      ? Math.floor(baseDamage / 2)
      : Math.floor((baseDamage * 3) / 2)
    : baseDamage;
  const raw = rawScaled;
  void num;
  void den;
  void denPost;
  return raw < 1 ? 1 : raw;
}

/* ------------------------------------------------------------------------- */
/* Move scoring                                                                */
/* ------------------------------------------------------------------------- */

/** Structured breakdown of one move decision's score. */
export interface MoveTerms {
  readonly exposure: number;             // sum of enemy retaliation power reachable at endpoint
  readonly exposurePenalty: number;      // exposurePenalty applied
  readonly traceSafety: number;          // reward for being inside safe region
  readonly positionUtility: number;      // reward for being within own attack range of a target
  readonly commanderProtection: number;  // penalty if own commander lands in an exposed position
}

export interface ScoredMove {
  readonly score: number;
  readonly terms: MoveTerms;
}

/**
 * Score a move endpoint against exposure / trace safety / position utility /
 * commander protection. Uses the enemy constructs in `state.constructs` as
 * the retaliation set — confirmed positions only; the AI does NOT use
 * ghost drift as truth.
 */
export function scoreMoveEndpoint(
  state: PublicState,
  mover: KnownConstruct,
  endpoint: Vec2,
  catalog: Catalog,
  weights: AiWeights,
): ScoredMove {
  const walls = state.map.walls;
  let exposure = 0;
  // Enemies confirmed this round contribute their full retaliation damage
  // to exposure; unconfirmed enemies contribute half (integer floor) since
  // they may or may not be there.
  for (const other of state.constructs) {
    if ((other.base.squadId as number) === (state.observer as number)) continue;
    if (other.base.destroyed) continue;
    const enemyRange = effectiveAttackRangeOf(other, catalog) as number;
    if (enemyRange <= 0) continue;
    const dx = (other.position.x as number) - (endpoint.x as number);
    const dy = (other.position.y as number) - (endpoint.y as number);
    const d2 = dx * dx + dy * dy;
    if (d2 > enemyRange * enemyRange) continue;
    if (!hasLineOfSight(endpoint, other.position, walls)) continue;
    const dmg = effectiveDamageOf(other, catalog);
    const confidence = other.confirmed ? 1 : 0;
    // Confidence-scaled: full damage if confirmed, half (integer floor) if not.
    const scaled = other.confirmed ? dmg : Math.floor(dmg / 2);
    exposure = exposure + scaled;
    void confidence;
  }
  const exposurePenalty = exposure * weights.exposurePenalty;

  // Trace safety: reward for being inside the CURRENT round's safe region.
  const activeStep = pickCurrentTraceStep(state);
  let traceSafety = 0;
  if (activeStep !== null) {
    if (pointInPoly(endpoint, activeStep)) traceSafety = weights.traceSafetyBonus;
    else traceSafety = -weights.traceExposurePenalty;
  }

  // Position utility: reward for being within own attack range of any enemy
  // with clear LOS from the endpoint.
  const ownRange = effectiveAttackRangeOf(mover, catalog) as number;
  let positionUtility = 0;
  for (const other of state.constructs) {
    if ((other.base.squadId as number) === (state.observer as number)) continue;
    if (other.base.destroyed) continue;
    const dx = (other.position.x as number) - (endpoint.x as number);
    const dy = (other.position.y as number) - (endpoint.y as number);
    const d2 = dx * dx + dy * dy;
    if (d2 > ownRange * ownRange) continue;
    if (!hasLineOfSight(endpoint, other.position, walls)) continue;
    // Prefer positioning against wounded / commander targets more than
    // healthy rank-and-file; enrich the position utility per target.
    const remaining = effectiveDialLengthOf(other, catalog) - other.base.dialIndex;
    const woundBonus = remaining > 0 ? Math.max(0, weights.positionUtility - remaining) : weights.positionUtility;
    const commanderBonus = other.base.commanderCode !== null ? weights.commanderBonus : 0;
    positionUtility = positionUtility + weights.positionUtility + woundBonus + commanderBonus;
  }

  // Commander protection: if MOVER IS commander, exposure counts double.
  let commanderProtection = 0;
  if (mover.base.commanderCode !== null && exposure > 0) {
    commanderProtection = -exposure * weights.commanderProtection;
  }

  const score = -exposurePenalty + traceSafety + positionUtility + commanderProtection;
  return {
    score,
    terms: {
      exposure,
      exposurePenalty,
      traceSafety,
      positionUtility,
      commanderProtection,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Squad-level context: exposure, pool capacity, etc.                          */
/* ------------------------------------------------------------------------- */

/**
 * Per-squad start-of-round context that every policy consumes. Computed
 * once per decision so per-candidate scoring does not repeat work.
 */
export interface SquadContext {
  readonly ownConstructs: readonly KnownConstruct[];
  /** Per own construct: exposure (integer sum of enemy retaliation damage). */
  readonly exposureByOwnId: ReadonlyMap<number, number>;
  /** Per own construct: their current effective damage output. */
  readonly damageByOwnId: ReadonlyMap<number, number>;
  /** Squad's pool total for this round. */
  readonly poolTotal: number;
  /** Own commander id if alive, null otherwise. */
  readonly ownCommanderId: number | null;
}

export function buildSquadContext(
  state: PublicState,
  catalog: Catalog,
): SquadContext {
  const owns = ownAliveConstructs(state, state.observer);
  const exposureByOwnId = new Map<number, number>();
  const damageByOwnId = new Map<number, number>();
  const walls = state.map.walls;
  let ownCommanderId: number | null = null;
  for (const own of owns) {
    if (own.base.commanderCode !== null) ownCommanderId = own.base.id as number;
    let ex = 0;
    for (const other of state.constructs) {
      if ((other.base.squadId as number) === (state.observer as number)) continue;
      if (other.base.destroyed) continue;
      const range = effectiveAttackRangeOf(other, catalog) as number;
      if (range <= 0) continue;
      const dx = (other.position.x as number) - (own.position.x as number);
      const dy = (other.position.y as number) - (own.position.y as number);
      const d2 = dx * dx + dy * dy;
      if (d2 > range * range) continue;
      if (!hasLineOfSight(own.position, other.position, walls)) continue;
      const dmg = effectiveDamageOf(other, catalog);
      ex = ex + (other.confirmed ? dmg : Math.floor(dmg / 2));
    }
    exposureByOwnId.set(own.base.id as number, ex);
    damageByOwnId.set(own.base.id as number, effectiveDamageOf(own, catalog));
  }
  const poolTotal = state.squads[state.observer as number]?.poolTotal ?? 0;
  return { ownConstructs: owns, exposureByOwnId, damageByOwnId, poolTotal, ownCommanderId };
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function hasLineOfSight(a: Vec2, b: Vec2, walls: readonly WallSegment[]): boolean {
  for (let i = 0; i < walls.length; i = i + 1) {
    const w = walls[i];
    if (w === undefined) continue;
    if (segIntersect(a, b, w.a, w.b)) return false;
  }
  return true;
}

function pointInPoly(p: Vec2, polygon: readonly Vec2[]): boolean {
  // Local copy of the fx/geometry ray cast + boundary. Kept inline to avoid
  // extra import surface at the AI/view boundary.
  const n = polygon.length;
  if (n < 3) return false;
  const px = p.x as number;
  const py = p.y as number;
  for (let i = 0; i < n; i = i + 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const ax = a.x as number;
    const ay = a.y as number;
    const bx = b.x as number;
    const by = b.y as number;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0) {
      const xLo = ax <= bx ? ax : bx;
      const xHi = ax >= bx ? ax : bx;
      const yLo = ay <= by ? ay : by;
      const yHi = ay >= by ? ay : by;
      if (px >= xLo && px <= xHi && py >= yLo && py <= yHi) return true;
    }
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i = i + 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const ay = a.y as number;
    const by = b.y as number;
    const aAbove = ay > py;
    const bAbove = by > py;
    if (aAbove !== bAbove) {
      const ax = a.x as number;
      const bx = b.x as number;
      const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
      const denomSign = by - ay > 0 ? 1 : -1;
      if (cross * denomSign > 0) inside = !inside;
    }
  }
  return inside;
}

/** Currently-active trace safe region for `state.round`, or null. */
function pickCurrentTraceStep(state: PublicState): readonly Vec2[] | null {
  const schedule = state.map.traceSchedule;
  let latest: readonly Vec2[] | null = null;
  for (let i = 0; i < schedule.length; i = i + 1) {
    const step = schedule[i];
    if (step === undefined) continue;
    if (state.round >= step.round) latest = step.safeRegion;
    else break;
  }
  return latest;
}

/**
 * Current dial info summary — exposed for tests / diagnostics without
 * re-implementing the effective-dial lookup. Callers use this to introspect
 * why a target was chosen.
 */
export function ownDialSummary(
  construct: KnownConstruct,
  catalog: Catalog,
): { readonly damage: number; readonly rangeFx: number; readonly integrityLeft: number } {
  const dial = currentDialStateOf(construct, catalog);
  const damage = effectiveDamageOf(construct, catalog);
  const rangeFx = effectiveAttackRangeOf(construct, catalog) as number;
  const integrityLeft = effectiveDialLengthOf(construct, catalog) - construct.base.dialIndex;
  void dial;
  return { damage, rangeFx, integrityLeft };
}
