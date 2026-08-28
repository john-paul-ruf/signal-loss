/**
 * Deterministic attack resolution and the shared exchange preview.
 *
 * `exchangePreview` and `resolveAttackPhase` call the SAME core
 * calculation (`computeShot`) with a hypothetical or committed posture
 * flag. FR-1's "no stat displayed differs from the stat used in
 * resolution" is impossible by construction: the ledger and the
 * resolution stage cannot drift.
 *
 * Order (FR-13):
 *   1. Snapshot at commit (all attackers, targets, postures, damage stats).
 *   2. Range + LOS check per shot; matrix ratio; integer floor; min 1 on
 *      landing shots only. Normal-into-posture is exactly 0 (no min).
 *   3. Accumulate damage by target (integer addition, commutative).
 *   4. Advance dials (destruction is applied AFTER damage).
 *   5. Commander loss is a permanent squad flag — set at end-round
 *      (Checkpoint 4).
 *
 * A construct destroyed by damage THIS round still fires this round —
 * because damage is computed from the pre-attack snapshot.
 */

import type { Fx } from "../fx/index";
import { FX_ZERO, dist2, isqrt, fxAdd, fxClamp } from "../fx/index";
import type {
  Catalog,
  Chassis,
  CommanderType,
  DialState,
  Mount,
} from "../catalog/index";
import type { Violation } from "../build/index";
import type { WallSegment } from "../map/index";
import { buildWallIndex, segmentBlocked } from "../map/spatial-index";
import type { Event, DamageAppliedEvent, DefenseInfoEvent, DialAdvancedEvent, PostureRevealEvent, ShotEvent } from "./events";
import type {
  ConstructId,
  MatchConstruct,
  MatchState,
  SquadId,
} from "./state";
import { SQUAD_COUNT, getConstruct } from "./state";
import { effectiveDialLength, legalAttackPlot, type SquadAttackPlot } from "./plot";

/* ------------------------------------------------------------------------- */
/* Effective stats                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Look up the CURRENT dial state for a construct with commander
 * modifications applied. Duplicates `plot.currentDialState` (which is
 * also exported) because the attack pipeline is a hot-loop consumer;
 * duplication keeps the import graph narrow.
 */
function activeDialState(
  construct: MatchConstruct,
  catalog: Catalog,
): { readonly chassis: Chassis; readonly state: DialState; readonly commander: CommanderType | null } | null {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) return null;
  const commander =
    construct.commanderCode !== null
      ? catalog.indexes.commanderTypeByCode.get(construct.commanderCode) ?? null
      : null;
  let base: DialState | undefined = chassis.dial[construct.dialIndex];
  if (base === undefined && commander !== null) {
    const extra = commander.modifications.extraDialStates;
    const totalLen = chassis.dial.length + extra;
    if (construct.dialIndex < totalLen) {
      base = chassis.dial[chassis.dial.length - 1];
    }
  }
  if (base === undefined) return null;
  const state: DialState = commander !== null
    ? {
        index: base.index,
        movementAllowance: fxAdd(base.movementAllowance, commander.modifications.movementDelta),
        damage: base.damage + commander.modifications.damageDelta,
        rangeModifier: base.rangeModifier,
        defenseModifier: base.defenseModifier + commander.modifications.defenseDelta,
      }
    : base;
  return { chassis, state, commander };
}

/**
 * Sum mount stat deltas for a construct.
 */
function mountStatSums(
  construct: MatchConstruct,
  catalog: Catalog,
): { readonly damage: number; readonly rangeDelta: Fx } {
  let damage = 0;
  let rangeDelta = 0;
  for (const m of construct.mounts) {
    const mount: Mount | undefined = catalog.indexes.mountByCode.get(m.mountCode);
    if (mount === undefined) continue;
    damage = damage + mount.damageDelta;
    rangeDelta = rangeDelta + (mount.rangeDelta as number);
  }
  return { damage, rangeDelta: rangeDelta as Fx };
}

/**
 * Effective attack range for `attacker` (fx). Formula:
 *   base = chassis.baseRange + commander.rangeDelta  (already applied in effective)
 *   effective = base + dial.rangeModifier + sum(mount.rangeDelta)
 *   clamped to [chassis.rangeClamp.min, chassis.rangeClamp.max]
 */
export function effectiveAttackRange(
  attacker: MatchConstruct,
  catalog: Catalog,
): Fx {
  const active = activeDialState(attacker, catalog);
  if (active === null) return FX_ZERO;
  const { chassis, state, commander } = active;
  const commanderRangeDelta = commander?.modifications.rangeDelta ?? FX_ZERO;
  const baseWithCommander = fxAdd(chassis.baseRange, commanderRangeDelta);
  const withDial = fxAdd(baseWithCommander, state.rangeModifier);
  const mountSums = mountStatSums(attacker, catalog);
  const total = fxAdd(withDial, mountSums.rangeDelta);
  return fxClamp(total, chassis.rangeClamp.min, chassis.rangeClamp.max);
}

/**
 * Effective damage output for `attacker` (integer). Formula:
 *   effective = dial.damage + sum(mount.damageDelta)
 * Damage is a plain non-negative integer. Commander damageDelta is
 * folded into the dial state above.
 */
export function effectiveDamage(
  attacker: MatchConstruct,
  catalog: Catalog,
): number {
  const active = activeDialState(attacker, catalog);
  if (active === null) return 0;
  const mountSums = mountStatSums(attacker, catalog);
  const raw = active.state.damage + mountSums.damage;
  return raw < 0 ? 0 : raw;
}

/* ------------------------------------------------------------------------- */
/* Shot core                                                                   */
/* ------------------------------------------------------------------------- */

/** One matrix cell — numerator/denominator; zero denotes 0 damage exactly. */
export type MatrixCell =
  | { readonly zero: true }
  | { readonly zero: false; readonly num: number; readonly den: number };

/** The four cells of the FR-18 outcome matrix. */
export const OUTCOME_MATRIX: {
  readonly normal: { readonly posture: MatrixCell; readonly flat: MatrixCell };
  readonly called: { readonly posture: MatrixCell; readonly flat: MatrixCell };
} = {
  normal: {
    posture: { zero: true },
    flat: { zero: false, num: 1, den: 1 },
  },
  called: {
    posture: { zero: false, num: 1, den: 2 },
    flat: { zero: false, num: 3, den: 2 },
  },
};

/**
 * Apply the matrix to a base damage integer. Rounding: floor. Any
 * landing shot returns min 1 EXCEPT the zero cell (normal into posture),
 * which is exactly 0.
 */
export function applyMatrix(
  baseDamage: number,
  called: boolean,
  targetPosture: "FLAT" | "POSTURE",
): number {
  const row = called ? OUTCOME_MATRIX.called : OUTCOME_MATRIX.normal;
  const cell = targetPosture === "POSTURE" ? row.posture : row.flat;
  if (cell.zero) return 0;
  const raw = Math.floor((baseDamage * cell.num) / cell.den);
  return raw < 1 ? 1 : raw;
}

/**
 * The single shot computation — used by both `exchangePreview` and
 * `resolveAttackPhase`. Reads NOTHING from state; every value comes from
 * catalog + supplied constructs + wall list, in an integer world.
 *
 * `wallIndex` is the deterministic spatial index over the map's walls.
 * Range check uses squared fx distance; LOS check uses the index.
 */
export interface ShotOutcome {
  readonly landed: boolean;
  readonly baseDamage: number;
  readonly damage: number;
  readonly range: Fx;
  readonly dist: Fx;
  readonly reason: "OK" | "OUT_OF_RANGE" | "NO_LOS" | "TARGET_DESTROYED" | "SELF_TARGET";
}

export function computeShot(
  attacker: MatchConstruct,
  target: MatchConstruct,
  called: boolean,
  targetPosture: "FLAT" | "POSTURE",
  catalog: Catalog,
  wallIndex: ReturnType<typeof buildWallIndex>,
): ShotOutcome {
  if (attacker.id === target.id) {
    return zeroOutcome("SELF_TARGET");
  }
  if (target.destroyed) {
    return zeroOutcome("TARGET_DESTROYED");
  }
  const baseDamage = effectiveDamage(attacker, catalog);
  const range = effectiveAttackRange(attacker, catalog);
  const d2 = dist2(attacker.position, target.position);
  const rangeInt = range as number;
  const distFx = (isqrt(d2) as number) as Fx;
  if (d2 > rangeInt * rangeInt) {
    return {
      landed: false,
      baseDamage,
      damage: 0,
      range,
      dist: distFx,
      reason: "OUT_OF_RANGE",
    };
  }
  if (segmentBlocked(wallIndex, attacker.position, target.position)) {
    return {
      landed: false,
      baseDamage,
      damage: 0,
      range,
      dist: distFx,
      reason: "NO_LOS",
    };
  }
  const damage = applyMatrix(baseDamage, called, targetPosture);
  return {
    landed: true,
    baseDamage,
    damage,
    range,
    dist: distFx,
    reason: "OK",
  };
}

function zeroOutcome(reason: ShotOutcome["reason"]): ShotOutcome {
  return {
    landed: false,
    baseDamage: 0,
    damage: 0,
    range: FX_ZERO,
    dist: FX_ZERO,
    reason,
  };
}

/* ------------------------------------------------------------------------- */
/* Exchange preview (design.md §5.7)                                           */
/* ------------------------------------------------------------------------- */

/**
 * One exchange card. Returns damage in BOTH posture states, computed by
 * the same `computeShot` used at resolution time. FR-18 requirement:
 * "The player can see exactly the damage each declared shot would deal
 * under each of the two enemy posture states."
 */
export interface ExchangeCard {
  readonly attackerId: ConstructId;
  readonly targetId: ConstructId;
  readonly called: boolean;
  readonly vsFlat: ShotOutcome;
  readonly vsPosture: ShotOutcome;
}

/**
 * Compute an exchange card without mutating state. Ignores whether the
 * shot is currently plotted; UI can call this ahead of commit.
 */
export function exchangePreview(
  state: MatchState,
  attackerId: ConstructId,
  targetId: ConstructId,
  called: boolean,
  catalog: Catalog,
): ExchangeCard | null {
  const attacker = getConstruct(state, attackerId);
  const target = getConstruct(state, targetId);
  if (attacker === undefined || target === undefined) return null;
  const wallIndex = buildIndex(state.map.walls, state, catalog);
  const vsFlat = computeShot(attacker, target, called, "FLAT", catalog, wallIndex);
  const vsPosture = computeShot(attacker, target, called, "POSTURE", catalog, wallIndex);
  return { attackerId, targetId, called, vsFlat, vsPosture };
}

/**
 * Build the wall spatial index using the tunables' BOARD_SIZE-derived
 * default cell size. Sized to a single construct footprint (fx),
 * consistent with M08's expected use.
 */
function buildIndex(
  walls: readonly WallSegment[],
  state: MatchState,
  catalog: Catalog,
): ReturnType<typeof buildWallIndex> {
  // Bounds from the map polygon — use the AABB of the first vertex fold.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const v of state.map.bounds) {
    if ((v.x as number) < minX) minX = v.x as number;
    if ((v.y as number) < minY) minY = v.y as number;
    if ((v.x as number) > maxX) maxX = v.x as number;
    if ((v.y as number) > maxY) maxY = v.y as number;
  }
  const cell = (catalog.tunables.BOARD_SIZE as number) / 40; // ~40 cells per side
  const cellInt = Math.max(1, Math.floor(cell)) as unknown as Fx;
  return buildWallIndex(
    walls,
    { min: { x: minX as Fx, y: minY as Fx }, max: { x: maxX as Fx, y: maxY as Fx } },
    cellInt,
  );
}

/* ------------------------------------------------------------------------- */
/* Full attack-phase resolution                                                */
/* ------------------------------------------------------------------------- */

/** Post-attack transition result. */
export interface AttackResult {
  readonly state: MatchState;
  readonly events: readonly Event[];
  readonly attackerDamageDealt: ReadonlyMap<number, number>; // by construct id
}

/**
 * Snapshot-then-apply attack resolution. Validates plots, computes
 * committed shot outcomes over the pre-attack snapshot, accumulates
 * per-target damage, then advances dials in a single atomic pass. The
 * post-state is either ATTACK_PLOT still (if damage/trace/end-round are
 * separated) OR MOVEMENT_PLOT of the next round (Checkpoint 4 composes
 * this with end-round). At this checkpoint we leave the phase at
 * ATTACK_PLOT and defer round advancement to `end-round.ts`.
 */
export function resolveAttackStage(
  state: MatchState,
  plots: readonly [
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
  ],
  catalog: Catalog,
): { readonly ok: true; readonly value: AttackResult } | { readonly ok: false; readonly error: readonly Violation[] } {
  if (state.phase !== "ATTACK_PLOT") {
    return {
      ok: false,
      error: [
        {
          rule: "FR-13",
          kind: "WRONG_PHASE",
          message: `resolveAttackStage requires ATTACK_PLOT; got ${state.phase}.`,
          path: "phase",
        },
      ],
    };
  }
  if (plots.length !== SQUAD_COUNT) {
    return {
      ok: false,
      error: [
        {
          rule: "FR-13",
          kind: "WRONG_PLOT_COUNT",
          message: `Attack expects ${SQUAD_COUNT} plots; got ${plots.length}.`,
          path: "plots",
        },
      ],
    };
  }

  const errors: Violation[] = [];
  const seenSquad = new Set<number>();
  const bySquad: SquadAttackPlot[] = new Array(SQUAD_COUNT);
  for (let i = 0; i < plots.length; i = i + 1) {
    const sp = plots[i];
    if (sp === undefined) continue;
    const sq = sp.squadId as number;
    if (sq < 0 || sq >= SQUAD_COUNT) {
      errors.push({
        rule: "FR-13",
        kind: "SQUAD_ID_OUT_OF_RANGE",
        message: `plots[${i}].squadId is ${sq}.`,
        path: `plots[${i}].squadId`,
      });
      continue;
    }
    if (seenSquad.has(sq)) {
      errors.push({
        rule: "FR-13",
        kind: "SQUAD_ID_DUPLICATE",
        message: `Squad ${sq} appears more than once in the plots array.`,
        path: `plots[${i}].squadId`,
      });
      continue;
    }
    seenSquad.add(sq);
    bySquad[sq] = sp;
    const inner = legalAttackPlot(state, sq as SquadId, sp);
    for (const v of inner) {
      errors.push({
        rule: v.rule,
        kind: v.kind,
        message: v.message,
        path: `plots[${i}].${v.path}`,
      });
    }
  }
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    if (!seenSquad.has(sq)) {
      errors.push({
        rule: "FR-13",
        kind: "SQUAD_MISSING",
        message: `Squad ${sq} has no attack plot.`,
        path: "plots",
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors };
  }

  const wallIndex = buildIndex(state.map.walls, state, catalog);

  // Build posture map per construct.
  const posture = new Map<number, "FLAT" | "POSTURE">();
  for (const c of state.constructs) posture.set(c.id as number, "FLAT");
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const sp = bySquad[sq];
    if (sp === undefined) continue;
    for (const p of sp.postures) posture.set(p.constructId as number, p.posture);
  }

  const events: Event[] = [];

  // FR-13: posture reveals emitted first (canonical order).
  for (const c of state.constructs) {
    if (c.destroyed) continue;
    const post = posture.get(c.id as number) ?? "FLAT";
    if (post === "FLAT" && !hasPostureAssignment(bySquad, c.id as number, c.squadId as number)) {
      // Skip emitting an explicit FLAT event for constructs that never had a
      // posture assignment — the ledger is quieter and the canonical order
      // still reflects the committed choices.
      continue;
    }
    const rev: PostureRevealEvent = {
      kind: "POSTURE_REVEAL",
      round: state.round,
      constructId: c.id,
      posture: post,
      squadId: c.squadId,
    };
    events.push(rev);
  }

  // Accumulate damage. `damageByTarget` accumulates integer damage from
  // committed attacks against the pre-attack snapshot.
  const damageByTarget = new Map<number, number>();
  const attackerDealt = new Map<number, number>();
  const calledCountBySquad = new Map<number, number>();
  const postureCountBySquad = new Map<number, number>();
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    calledCountBySquad.set(sq, 0);
    postureCountBySquad.set(sq, 0);
  }

  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const sp = bySquad[sq];
    if (sp === undefined) continue;
    // Sort attacks by attacker id for canonical event order.
    const sorted = sp.attacks.slice().sort((a, b) => (a.constructId as number) - (b.constructId as number));
    for (const a of sorted) {
      const attacker = getConstruct(state, a.constructId);
      const target = getConstruct(state, a.targetId);
      if (attacker === undefined || target === undefined) continue;
      const post = posture.get(target.id as number) ?? "FLAT";
      const outcome = computeShot(attacker, target, a.called, post, catalog, wallIndex);
      const shotEvent: ShotEvent = {
        kind: "SHOT",
        round: state.round,
        attackerId: attacker.id,
        targetId: target.id,
        called: a.called,
        landed: outcome.landed,
        damage: outcome.damage,
        targetPosture: post,
        baseDamage: outcome.baseDamage,
      };
      events.push(shotEvent);
      if (!outcome.landed) {
        const reason: DefenseInfoEvent["reason"] =
          outcome.reason === "OUT_OF_RANGE"
            ? "OUT_OF_RANGE"
            : outcome.reason === "NO_LOS"
            ? "NO_LOS"
            : "TARGET_DESTROYED";
        events.push({
          kind: "DEFENSE_INFO",
          round: state.round,
          attackerId: attacker.id,
          targetId: target.id,
          reason,
        });
        continue;
      }
      damageByTarget.set(
        target.id as number,
        (damageByTarget.get(target.id as number) ?? 0) + outcome.damage,
      );
      attackerDealt.set(
        attacker.id as number,
        (attackerDealt.get(attacker.id as number) ?? 0) + outcome.damage,
      );
      if (a.called) {
        calledCountBySquad.set(sq, (calledCountBySquad.get(sq) ?? 0) + 1);
      }
    }
    for (const p of sp.postures) {
      if (p.posture === "POSTURE") {
        postureCountBySquad.set(sq, (postureCountBySquad.get(sq) ?? 0) + 1);
      }
    }
  }

  // Emit DAMAGE_APPLIED per target (ascending id).
  const damagedIds = Array.from(damageByTarget.keys()).sort((a, b) => a - b);
  for (const id of damagedIds) {
    const applied: DamageAppliedEvent = {
      kind: "DAMAGE_APPLIED",
      round: state.round,
      targetId: id as unknown as ConstructId,
      damage: damageByTarget.get(id) ?? 0,
    };
    events.push(applied);
  }

  // Advance dials from accumulated damage. Emit DIAL_ADVANCED per
  // construct that advanced (in ascending id).
  const newConstructs = state.constructs.map((c) => {
    const dmg = damageByTarget.get(c.id as number) ?? 0;
    const dealt = attackerDealt.get(c.id as number) ?? 0;
    if (dmg === 0 && dealt === 0) return c;
    const advance = dmg;
    let newIndex = c.dialIndex + advance;
    const maxLen = effectiveDialLength(c, catalog);
    if (newIndex > maxLen) newIndex = maxLen;
    return {
      ...c,
      dialIndex: newIndex,
      damageDealt: c.damageDealt + dealt,
      damageTaken: c.damageTaken + dmg,
    };
  });

  for (const c of newConstructs) {
    const old = state.constructs.find((k) => k.id === c.id);
    if (old === undefined) continue;
    if (c.dialIndex > old.dialIndex) {
      const dial: DialAdvancedEvent = {
        kind: "DIAL_ADVANCED",
        round: state.round,
        constructId: c.id,
        from: old.dialIndex,
        to: c.dialIndex,
      };
      events.push(dial);
    }
  }

  // Update squad running totals.
  const newSquads = state.squads.map((s, i) => {
    let dealt = 0;
    let taken = 0;
    for (const c of newConstructs) {
      if ((c.squadId as number) !== i) continue;
      const old = state.constructs.find((k) => k.id === c.id);
      const oldDealt = old?.damageDealt ?? 0;
      const oldTaken = old?.damageTaken ?? 0;
      dealt = dealt + (c.damageDealt - oldDealt);
      taken = taken + (c.damageTaken - oldTaken);
    }
    const called = calledCountBySquad.get(i) ?? 0;
    const postures = postureCountBySquad.get(i) ?? 0;
    const spend = called + postures;
    return {
      ...s,
      poolSpent: spend,
      totalDamageDealt: s.totalDamageDealt + dealt,
      totalDamageTaken: s.totalDamageTaken + taken,
      totalPoolSpent: s.totalPoolSpent + spend,
      totalPoolWasted: s.totalPoolWasted + Math.max(0, s.poolTotal - spend),
      totalCalledShots: s.totalCalledShots + called,
      totalPostures: s.totalPostures + postures,
    };
  }) as unknown as MatchState["squads"];

  const nextState: MatchState = {
    ...state,
    constructs: newConstructs,
    squads: newSquads,
  };

  return {
    ok: true,
    value: { state: nextState, events, attackerDamageDealt: attackerDealt },
  };
}

/** Returns true iff the squad's plot lists the construct in postures. */
function hasPostureAssignment(
  bySquad: readonly SquadAttackPlot[],
  cid: number,
  squad: number,
): boolean {
  const sp = bySquad[squad];
  if (sp === undefined) return false;
  for (const p of sp.postures) {
    if ((p.constructId as number) === cid) return true;
  }
  return false;
}

