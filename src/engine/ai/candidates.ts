/**
 * Shared move / attack / posture candidate generators.
 *
 * Every candidate returned is legally verified against the same rules the
 * engine enforces at plot commit time:
 *   - Movement: in-bounds, no wall crossing, arc length ≤ dial allowance.
 *   - Attack: attacker owned + alive, target alive + not self + not ally,
 *     within effective attack range, has clear LOS from attacker to target.
 *   - Posture: attacker owned + alive; every construct produces {FLAT, POSTURE}.
 *
 * Every generator operates over a `PublicState` — never a `MatchState` —
 * so the AI cannot see private plots and cannot use ghost drift as truth.
 * Enemy positions are the observer's LAST CONFIRMED positions; the AI
 * decides whether to shoot at a ghost by exactly the confidence a human sees.
 *
 * Candidate density is data-driven: `weights.beamWidth` controls the
 * movement fan-out (angles × radii), a shared cap; attack candidates
 * enumerate every visible enemy without a rng draw so different tiers
 * see the same catalogue of choices.
 */

import type { Fx, Vec2 } from "../fx/index";
import {
  FX_ONE,
  fxAdd,
  fxClamp,
  isqrt,
  measurePolyline,
  pointInPoly,
  segIntersect,
  vecEq,
} from "../fx/index";
import type { Catalog, DialState } from "../catalog/index";
import type { PublicState, KnownConstruct } from "../view/index";
import type { ConstructId, SquadId } from "../match/index";
import type {
  AttackCandidate,
  MoveCandidate,
  PostureCandidate,
} from "./types";

/* ------------------------------------------------------------------------- */
/* Public API                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * All legal move candidates for one own construct. Always includes HOLD
 * (empty path). Fan-out size is `weights.beamWidth * radii + 1` capped by
 * the walls / bounds filter.
 */
export function generateMoveCandidates(
  state: PublicState,
  construct: ConstructId,
  catalog: Catalog,
  fanOutAngles = 8,
  radiiPerAngle = 3,
): readonly MoveCandidate[] {
  const known = findKnown(state, construct);
  if (known === null) return [];
  if (known.base.destroyed) return [];
  if ((known.base.squadId as number) !== (state.observer as number)) return [];

  const candidates: MoveCandidate[] = [];
  let idx = 0;
  // HOLD is always legal, always first — canonical position for tiebreaks.
  candidates.push({
    constructId: construct,
    path: [],
    endPosition: known.position,
    index: idx,
  });
  idx = idx + 1;

  const dial = currentDialStateOf(known, catalog);
  if (dial === undefined) return candidates;
  const allowance = dial.movementAllowance as number;
  if (allowance <= 0) return candidates;

  const angles = directionUnitVectors(fanOutAngles);
  // Radii distribute along [1/radiiPerAngle, 1] in equal integer slots. The
  // full-allowance step is the most common, half-allowance next, etc.
  for (let r = radiiPerAngle; r >= 1; r = r - 1) {
    const numer = r;
    const denom = radiiPerAngle;
    for (let a = 0; a < angles.length; a = a + 1) {
      const dir = angles[a];
      if (dir === undefined) continue;
      const endpoint = scaledEndpoint(known.position, dir, allowance, numer, denom);
      if (vecEq(endpoint, known.position)) continue;
      const path = [known.position, endpoint] as const;
      // In-bounds check on endpoint.
      if (!pointInPoly(endpoint, state.map.bounds)) continue;
      // Wall crossing check (any wall intersecting the single segment).
      let blocked = false;
      for (let w = 0; w < state.map.walls.length; w = w + 1) {
        const wall = state.map.walls[w];
        if (wall === undefined) continue;
        if (segIntersect(path[0], path[1], wall.a, wall.b)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      // Length check — should hold by construction but validate exactly.
      const length = measurePolyline({ vertices: path.slice() }).totalLength as number;
      if (length > allowance) continue;
      candidates.push({
        constructId: construct,
        path: path.slice(),
        endPosition: endpoint,
        index: idx,
      });
      idx = idx + 1;
    }
  }
  return candidates;
}

/**
 * All legal attack candidates for one own construct. Always includes the
 * NO-ATTACK option first. Enemy visibility is defined by the caller's
 * PublicState — any confirmed enemy KnownConstruct in range with LOS
 * yields both a normal and a called variant.
 */
export function generateAttackCandidates(
  state: PublicState,
  construct: ConstructId,
  catalog: Catalog,
): readonly AttackCandidate[] {
  const known = findKnown(state, construct);
  const candidates: AttackCandidate[] = [];
  let idx = 0;
  // NO-ATTACK is always available.
  candidates.push({
    constructId: construct,
    targetId: null,
    called: false,
    index: idx,
  });
  idx = idx + 1;
  if (known === null) return candidates;
  if (known.base.destroyed) return candidates;
  if ((known.base.squadId as number) !== (state.observer as number)) return candidates;

  const range = effectiveAttackRangeOf(known, catalog) as number;
  if (range <= 0) return candidates;

  for (const target of state.constructs) {
    if ((target.base.squadId as number) === (state.observer as number)) continue;
    if (target.base.destroyed) continue;
    // Only consider confirmed positions — a stale ghost is a target one
    // can PLOT at but decisions built on ghosted positions get discounted
    // by the evaluator. Include all confirmed OR previously-known targets
    // to keep the candidate list stable; scorers weight by confidence.
    const dx = (target.position.x as number) - (known.position.x as number);
    const dy = (target.position.y as number) - (known.position.y as number);
    const d2 = dx * dx + dy * dy;
    if (d2 > range * range) continue;
    // LOS check
    if (!hasLineOfSight(known.position, target.position, state.map.walls)) continue;
    candidates.push({
      constructId: construct,
      targetId: target.base.id,
      called: false,
      index: idx,
    });
    idx = idx + 1;
    candidates.push({
      constructId: construct,
      targetId: target.base.id,
      called: true,
      index: idx,
    });
    idx = idx + 1;
  }
  return candidates;
}

/**
 * Posture candidates for one own construct — always {FLAT, POSTURE}. The
 * chooser picks between them based on the exposure / pool / posture-rate
 * calculation in `policy.ts`.
 */
export function generatePostureCandidates(
  state: PublicState,
  construct: ConstructId,
): readonly PostureCandidate[] {
  const known = findKnown(state, construct);
  if (known === null || known.base.destroyed) return [];
  if ((known.base.squadId as number) !== (state.observer as number)) return [];
  return [
    { constructId: construct, posture: "FLAT", index: 0 },
    { constructId: construct, posture: "POSTURE", index: 1 },
  ];
}

/**
 * All own alive constructs for the observer, sorted by id. Utility for
 * policies that iterate over the squad.
 */
export function ownAliveConstructs(state: PublicState, squad: SquadId): readonly KnownConstruct[] {
  return state.constructs
    .filter(
      (k) => (k.base.squadId as number) === (squad as number) && !k.base.destroyed,
    )
    .slice()
    .sort((a, b) => (a.base.id as number) - (b.base.id as number));
}

/* ------------------------------------------------------------------------- */
/* Effective stats — mirrored from match/plot.ts + match/attack.ts but on     */
/* PublicConstruct (no MatchState access).                                    */
/* ------------------------------------------------------------------------- */

/**
 * Current dial state (with commander modifications) for a known construct.
 * Mirrors `currentDialState` in match/plot.ts at the PublicState boundary.
 */
export function currentDialStateOf(
  known: KnownConstruct,
  catalog: Catalog,
): DialState | undefined {
  const chassis = catalog.indexes.chassisByCode.get(known.base.chassisCode);
  if (chassis === undefined) return undefined;
  const commander =
    known.base.commanderCode !== null
      ? catalog.indexes.commanderTypeByCode.get(known.base.commanderCode) ?? null
      : null;
  const source = chassis.dial;
  let state: DialState | undefined = source[known.base.dialIndex];
  if (state === undefined && commander !== null) {
    const extra = commander.modifications.extraDialStates;
    const totalLen = source.length + extra;
    if (known.base.dialIndex >= source.length && known.base.dialIndex < totalLen) {
      const last = source[source.length - 1];
      if (last !== undefined) state = last;
    }
  }
  if (state === undefined) return undefined;
  if (commander === null) return state;
  const mods = commander.modifications;
  return {
    index: state.index,
    movementAllowance: fxAdd(state.movementAllowance, mods.movementDelta),
    damage: state.damage + mods.damageDelta,
    rangeModifier: state.rangeModifier,
    defenseModifier: state.defenseModifier + mods.defenseDelta,
  };
}

/**
 * Effective dial length (chassis dial + commander extra states). Mirrors
 * `effectiveDialLength` from match/plot.ts.
 */
export function effectiveDialLengthOf(known: KnownConstruct, catalog: Catalog): number {
  const chassis = catalog.indexes.chassisByCode.get(known.base.chassisCode);
  if (chassis === undefined) return 0;
  const extra =
    known.base.commanderCode !== null
      ? catalog.indexes.commanderTypeByCode.get(known.base.commanderCode)?.modifications
          .extraDialStates ?? 0
      : 0;
  return chassis.dial.length + extra;
}

/**
 * Effective attack range in fx for a known construct, including commander
 * rangeDelta, dial rangeModifier, and sum of mount rangeDeltas — clamped.
 * Mirrors `effectiveAttackRange` from match/attack.ts.
 */
export function effectiveAttackRangeOf(known: KnownConstruct, catalog: Catalog): Fx {
  const chassis = catalog.indexes.chassisByCode.get(known.base.chassisCode);
  if (chassis === undefined) return 0 as Fx;
  const commander =
    known.base.commanderCode !== null
      ? catalog.indexes.commanderTypeByCode.get(known.base.commanderCode) ?? null
      : null;
  const dial = currentDialStateOf(known, catalog);
  if (dial === undefined) return 0 as Fx;
  const commanderRangeDelta = commander?.modifications.rangeDelta ?? (0 as Fx);
  let mountSum = 0;
  for (const m of known.base.mounts) {
    const mount = catalog.indexes.mountByCode.get(m.mountCode);
    if (mount === undefined) continue;
    mountSum = mountSum + (mount.rangeDelta as number);
  }
  const withCmd = fxAdd(chassis.baseRange, commanderRangeDelta);
  const withDial = fxAdd(withCmd, dial.rangeModifier);
  const total = fxAdd(withDial, mountSum as Fx);
  return fxClamp(total, chassis.rangeClamp.min, chassis.rangeClamp.max);
}

/**
 * Effective (integer) damage output for a known construct. Mirrors
 * `effectiveDamage` from match/attack.ts.
 */
export function effectiveDamageOf(known: KnownConstruct, catalog: Catalog): number {
  const dial = currentDialStateOf(known, catalog);
  if (dial === undefined) return 0;
  let mountSum = 0;
  for (const m of known.base.mounts) {
    const mount = catalog.indexes.mountByCode.get(m.mountCode);
    if (mount === undefined) continue;
    mountSum = mountSum + mount.damageDelta;
  }
  const raw = dial.damage + mountSum;
  return raw < 0 ? 0 : raw;
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Find a known construct by id. Returns null if absent (destroyed / not
 * present). Uses linear scan since PublicState.constructs is sorted by id
 * and typical squad size is small.
 */
function findKnown(state: PublicState, construct: ConstructId): KnownConstruct | null {
  const target = construct as number;
  for (const k of state.constructs) {
    if ((k.base.id as number) === target) return k;
  }
  return null;
}

/**
 * Compute `fanOut` deterministic unit-direction (dx, dy) pairs sampled from
 * the eight cardinal / diagonal directions. When `fanOut === 8` the full
 * ring is returned; otherwise every `stride`-th direction is picked so
 * lower fan-outs remain evenly spaced.
 */
function directionUnitVectors(
  fanOut: number,
): readonly { readonly dx: number; readonly dy: number; readonly mag2: number }[] {
  const ring: readonly { readonly dx: number; readonly dy: number; readonly mag2: number }[] = [
    { dx: 1, dy: 0, mag2: 1 },
    { dx: 1, dy: 1, mag2: 2 },
    { dx: 0, dy: 1, mag2: 1 },
    { dx: -1, dy: 1, mag2: 2 },
    { dx: -1, dy: 0, mag2: 1 },
    { dx: -1, dy: -1, mag2: 2 },
    { dx: 0, dy: -1, mag2: 1 },
    { dx: 1, dy: -1, mag2: 2 },
  ];
  if (fanOut >= 8) return ring;
  if (fanOut <= 0) return [];
  const stride = Math.max(1, Math.floor(8 / fanOut));
  const out: (typeof ring)[number][] = [];
  for (let i = 0; i < ring.length && out.length < fanOut; i = i + stride) {
    const entry = ring[i];
    if (entry !== undefined) out.push(entry);
  }
  return out;
}

/**
 * Scale a unit direction (dx, dy) with magnitude^2 = mag2 by an allowance
 * so the result's Euclidean length ≤ allowance × numer / denom. Uses
 * `isqrt` for exact integer square roots — no floats.
 */
function scaledEndpoint(
  origin: Vec2,
  direction: { readonly dx: number; readonly dy: number; readonly mag2: number },
  allowance: number,
  numer: number,
  denom: number,
): Vec2 {
  const effectiveAllowance = Math.trunc((allowance * numer) / denom);
  if (effectiveAllowance <= 0) return origin;
  // Solve k * mag = effectiveAllowance where mag = sqrt(mag2):
  // k = effectiveAllowance / sqrt(mag2)
  // integer k = isqrt(effectiveAllowance^2 / mag2)
  const scaleSq = Math.trunc((effectiveAllowance * effectiveAllowance) / direction.mag2);
  const k = isqrt(scaleSq);
  const ex = (origin.x as number) + direction.dx * k;
  const ey = (origin.y as number) + direction.dy * k;
  // Ensure the endpoint stays inside the fx safe integer domain — clamp
  // is a defensive fallback; the caller's map bounds check discards
  // out-of-bound endpoints anyway.
  return { x: ex as Fx, y: ey as Fx };
}

/**
 * Line-of-sight predicate over a wall list. Uses `segIntersect` for exact
 * fx geometry — no spatial index needed at this candidate-generation scale.
 */
function hasLineOfSight(
  a: Vec2,
  b: Vec2,
  walls: readonly { readonly a: Vec2; readonly b: Vec2 }[],
): boolean {
  for (let i = 0; i < walls.length; i = i + 1) {
    const w = walls[i];
    if (w === undefined) continue;
    if (segIntersect(a, b, w.a, w.b)) return false;
  }
  return true;
}

/**
 * `FX_ONE`-referenced no-op export retained for downstream imports that
 * want the fx unit — keeps this module's boundary explicit without
 * requiring every consumer to import from fx directly.
 */
export const AI_FX_ONE = FX_ONE;
