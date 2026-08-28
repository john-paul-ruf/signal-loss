/**
 * Plot contracts and legality: MovePlot, SquadAttackPlot, HumanDraftPlots.
 *
 * Draft plots (UI-side, editable, per-construct, ephemeral) are distinct
 * from committed `SquadPlots` (feed `resolveRound`). Drafts do not appear
 * on `MatchState`.
 *
 * Empty movement is HOLD (legal, cost-free). Attack, posture, and called
 * choices are independent — a construct may posture and not shoot; a
 * called shot does not imply a posture. Over-spend rejects at plot time,
 * carrying the FR-16 identifier.
 */

import type { Vec2, Fx } from "../fx/index";
import {
  FX_ZERO,
  fxAdd,
  fxSub,
  isqrt,
  measurePolyline,
  pointInPoly,
  segIntersect,
  vecEq,
} from "../fx/index";
import type { Catalog, DialState } from "../catalog/index";
import type { Violation } from "../build/index";
import type { WallSegment } from "../map/index";
import type {
  ConstructId,
  MatchConstruct,
  MatchState,
  SquadId,
} from "./state";
import { constructsOfSquad, getConstruct } from "./state";

/* ------------------------------------------------------------------------- */
/* Committed plot types                                                       */
/* ------------------------------------------------------------------------- */

/**
 * One committed movement plot. Empty path is HOLD; path[0] is expected to
 * equal the construct's current position (the normalizer inserts it if
 * omitted so callers can pass just the waypoint list).
 */
export interface MovePlot {
  readonly constructId: ConstructId;
  readonly path: readonly Vec2[];
}

export interface AttackPlot {
  readonly constructId: ConstructId; // attacker
  readonly targetId: ConstructId;
  readonly called: boolean;
}

export type Posture = "FLAT" | "POSTURE";

export interface PostureAssignment {
  readonly constructId: ConstructId;
  readonly posture: Posture;
}

/** Movement plot for one squad. */
export interface SquadMovePlots {
  readonly squadId: SquadId;
  readonly moves: readonly MovePlot[]; // sorted by constructId ascending
}

/** Attack plot for one squad. */
export interface SquadAttackPlot {
  readonly squadId: SquadId;
  readonly attacks: readonly AttackPlot[];       // sorted by attacker id
  readonly postures: readonly PostureAssignment[]; // sorted by constructId
}

/**
 * Full round plot for one squad: moves + attacks + postures. Fed to
 * `resolveRound`; also decomposable into a `SquadMovePlots` (first stage)
 * and `SquadAttackPlot` (second stage).
 */
export interface SquadPlots {
  readonly squadId: SquadId;
  readonly moves: readonly MovePlot[];
  readonly attacks: readonly AttackPlot[];
  readonly postures: readonly PostureAssignment[];
}

/* ------------------------------------------------------------------------- */
/* Draft plots — UI, never on MatchState                                       */
/* ------------------------------------------------------------------------- */

/**
 * The uncommitted UI-side plot state. Distinct type per the "drafts are
 * NEVER fields on MatchState" contract. Consumers construct one from the
 * user's in-progress choices and only ever pass a `SquadPlots` down to
 * the engine.
 */
export interface HumanDraftPlots {
  readonly squadId: SquadId;
  readonly moveDrafts: readonly MovePlot[];
  readonly attackDrafts: readonly AttackPlot[];
  readonly postureDrafts: readonly PostureAssignment[];
}

/* ------------------------------------------------------------------------- */
/* Effective per-construct stats — extracted here for reuse                    */
/* ------------------------------------------------------------------------- */

/**
 * Look up the construct's current dial state — with commander modifications
 * applied if the construct is the commander. This is authoritative for
 * movement allowance, damage output, and range modifier during resolution.
 */
export function currentDialState(
  construct: MatchConstruct,
  catalog: Catalog,
): DialState | undefined {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) return undefined;
  const commander =
    construct.commanderCode !== null
      ? catalog.indexes.commanderTypeByCode.get(construct.commanderCode) ?? null
      : null;

  const source = chassis.dial;
  // Extra dial states from commander tag. Deferred until Checkpoint 3
  // needs the full ladder — here we only need the CURRENT state and its
  // modifiers. If dialIndex is beyond the source dial's length it may
  // still fall inside the extra states.
  let state: DialState | undefined = source[construct.dialIndex];
  if (state === undefined && commander !== null) {
    const extra = commander.modifications.extraDialStates;
    const totalLen = source.length + extra;
    if (construct.dialIndex >= source.length && construct.dialIndex < totalLen) {
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
 * Return the effective dial LENGTH — chassis dial length plus commander
 * extraDialStates when applicable. A construct with `dialIndex >= this
 * value` is destroyed / exhausted (FR-19).
 */
export function effectiveDialLength(
  construct: MatchConstruct,
  catalog: Catalog,
): number {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) return 0;
  const extra =
    construct.commanderCode !== null
      ? catalog.indexes.commanderTypeByCode.get(construct.commanderCode)
          ?.modifications.extraDialStates ?? 0
      : 0;
  return chassis.dial.length + extra;
}

/* ------------------------------------------------------------------------- */
/* Movement plot normalization and legality                                    */
/* ------------------------------------------------------------------------- */

/**
 * Compute exact fx polyline length for wall check + allowance check.
 * Returns the total arc length in fx.
 */
function polylineLength(path: readonly Vec2[]): Fx {
  if (path.length < 2) return FX_ZERO;
  const measure = measurePolyline({ vertices: path });
  return measure.totalLength;
}

/**
 * Normalize a path: drop consecutive duplicate vertices; ensure the first
 * vertex equals the construct's current position (prepending if the caller
 * omitted it). Returns a NEW array; does not mutate `path`.
 */
function normalizePath(
  origin: Vec2,
  path: readonly Vec2[],
): readonly Vec2[] {
  if (path.length === 0) return [];
  const first = path[0];
  if (first === undefined) return [];
  const withOrigin: Vec2[] = vecEq(first, origin) ? [] : [origin];
  let prev: Vec2 | undefined = withOrigin[0];
  for (const p of path) {
    if (prev !== undefined && vecEq(prev, p)) continue;
    withOrigin.push({ x: p.x, y: p.y });
    prev = p;
  }
  return withOrigin;
}

/**
 * Check every polyline segment against every wall in the map. Uses the
 * exact fx `segIntersect` predicate — no spatial index required at plot
 * time, since paths have at most a handful of segments.
 */
function anySegmentBlocked(
  path: readonly Vec2[],
  walls: readonly WallSegment[],
): boolean {
  if (path.length < 2) return false;
  for (let i = 0; i + 1 < path.length; i = i + 1) {
    const a = path[i];
    const b = path[i + 1];
    if (a === undefined || b === undefined) continue;
    for (let w = 0; w < walls.length; w = w + 1) {
      const wall = walls[w];
      if (wall === undefined) continue;
      if (segIntersect(a, b, wall.a, wall.b)) return true;
    }
  }
  return false;
}

/**
 * Return true iff `p` is inside `map.bounds` (closed polygon; the
 * geometry primitive already treats boundaries as inside).
 */
function inBounds(p: Vec2, boundary: readonly Vec2[]): boolean {
  return pointInPoly(p, boundary);
}

/**
 * Legality of ONE construct's committed movement plot. Empty path is
 * legal (HOLD). Path violations short-circuit at the first offender to
 * keep the error surface small and stable.
 */
export function legalMovePlot(
  state: MatchState,
  construct: ConstructId,
  path: readonly Vec2[],
  catalog: Catalog,
): { readonly ok: true; readonly value: MovePlot } | { readonly ok: false; readonly error: readonly Violation[] } {
  const c = getConstruct(state, construct);
  if (c === undefined) {
    return {
      ok: false,
      error: [
        {
          rule: "FR-14",
          kind: "UNKNOWN_CONSTRUCT",
          message: `Construct id ${construct as number} is not on the board.`,
          path: "constructId",
        },
      ],
    };
  }
  if (c.destroyed) {
    return {
      ok: false,
      error: [
        {
          rule: "FR-14",
          kind: "DESTROYED_CANNOT_MOVE",
          message: `Construct ${construct as number} is destroyed.`,
          path: "constructId",
        },
      ],
    };
  }
  if (state.phase !== "MOVEMENT_PLOT") {
    return {
      ok: false,
      error: [
        {
          rule: "FR-13",
          kind: "WRONG_PHASE",
          message: `Movement plotted while phase is ${state.phase}.`,
          path: "phase",
        },
      ],
    };
  }

  const normalized = normalizePath(c.position, path);
  // HOLD — always legal.
  if (normalized.length <= 1) {
    return { ok: true, value: { constructId: construct, path: [] } };
  }

  const dial = currentDialState(c, catalog);
  if (dial === undefined) {
    return {
      ok: false,
      error: [
        {
          rule: "FR-19",
          kind: "DIAL_UNRESOLVED",
          message: `Construct ${construct as number} has no current dial state.`,
          path: "dialIndex",
        },
      ],
    };
  }

  const length = polylineLength(normalized);
  const allowance = dial.movementAllowance;
  if ((length as number) > (allowance as number)) {
    return {
      ok: false,
      error: [
        {
          rule: "FR-14",
          kind: "OVER_MOVEMENT_ALLOWANCE",
          message: `Path length ${length as number} exceeds allowance ${allowance as number}.`,
          path: "path.length",
        },
      ],
    };
  }
  if (anySegmentBlocked(normalized, state.map.walls)) {
    return {
      ok: false,
      error: [
        {
          rule: "FR-14",
          kind: "PATH_CROSSES_WALL",
          message: `Plotted path crosses a wall.`,
          path: "path",
        },
      ],
    };
  }
  for (let i = 0; i < normalized.length; i = i + 1) {
    const p = normalized[i];
    if (p === undefined) continue;
    if (!inBounds(p, state.map.bounds)) {
      return {
        ok: false,
        error: [
          {
            rule: "FR-14",
            kind: "PATH_OUT_OF_BOUNDS",
            message: `Path vertex ${i} at (${p.x as number}, ${p.y as number}) is outside the map bounds.`,
            path: `path[${i}]`,
          },
        ],
      };
    }
  }

  return { ok: true, value: { constructId: construct, path: normalized } };
}

/* ------------------------------------------------------------------------- */
/* Attack plot legality (roster + pool bookkeeping)                            */
/* ------------------------------------------------------------------------- */

/**
 * Legality of one squad's committed attack plot: at most one attack per
 * attacker, one posture per construct, called/posture strictly 1:1
 * non-stackable, pool overspend rejects, targets exist, phase matches.
 * Range/LOS are NOT checked here (those depend on post-movement position;
 * checked in resolution).
 */
export function legalAttackPlot(
  state: MatchState,
  squad: SquadId,
  plot: SquadAttackPlot,
): readonly Violation[] {
  const errors: Violation[] = [];
  if (state.phase !== "ATTACK_PLOT") {
    errors.push({
      rule: "FR-13",
      kind: "WRONG_PHASE",
      message: `Attack plotted while phase is ${state.phase}.`,
      path: "phase",
    });
  }
  if ((plot.squadId as number) !== (squad as number)) {
    errors.push({
      rule: "FR-16",
      kind: "SQUAD_ID_MISMATCH",
      message: `Plot for squad ${plot.squadId as number}; caller passed squad ${squad as number}.`,
      path: "squadId",
    });
  }

  const squadConstructs = constructsOfSquad(state, squad);
  const own = new Set<number>(squadConstructs.filter((c) => !c.destroyed).map((c) => c.id as number));

  // Attacks — one per attacker, attacker owned, target exists, target alive.
  const seenAttacker = new Set<number>();
  for (let i = 0; i < plot.attacks.length; i = i + 1) {
    const a = plot.attacks[i];
    if (a === undefined) continue;
    const attackerN = a.constructId as number;
    if (!own.has(attackerN)) {
      errors.push({
        rule: "FR-16",
        kind: "ATTACKER_NOT_OWNED",
        message: `Attacker ${attackerN} is not a living construct of squad ${squad as number}.`,
        path: `attacks[${i}].constructId`,
      });
      continue;
    }
    if (seenAttacker.has(attackerN)) {
      errors.push({
        rule: "FR-16",
        kind: "ATTACKER_DUPLICATE",
        message: `Construct ${attackerN} has more than one committed attack; only one is allowed.`,
        path: `attacks[${i}].constructId`,
      });
      continue;
    }
    seenAttacker.add(attackerN);
    const target = getConstruct(state, a.targetId);
    if (target === undefined || target.destroyed) {
      errors.push({
        rule: "FR-16",
        kind: "TARGET_UNKNOWN_OR_DESTROYED",
        message: `Target ${a.targetId as number} is not a living construct.`,
        path: `attacks[${i}].targetId`,
      });
    } else if (target.squadId === squad) {
      errors.push({
        rule: "FR-16",
        kind: "TARGET_IS_ALLY",
        message: `Target ${a.targetId as number} belongs to the attacker's own squad.`,
        path: `attacks[${i}].targetId`,
      });
    }
  }

  // Postures — one per construct, construct owned, alive.
  const seenPosture = new Set<number>();
  for (let i = 0; i < plot.postures.length; i = i + 1) {
    const p = plot.postures[i];
    if (p === undefined) continue;
    const cn = p.constructId as number;
    if (!own.has(cn)) {
      errors.push({
        rule: "FR-16",
        kind: "POSTURE_NOT_OWNED",
        message: `Construct ${cn} is not a living construct of squad ${squad as number}.`,
        path: `postures[${i}].constructId`,
      });
      continue;
    }
    if (seenPosture.has(cn)) {
      errors.push({
        rule: "FR-16",
        kind: "POSTURE_DUPLICATE",
        message: `Construct ${cn} has more than one committed posture; only one is allowed.`,
        path: `postures[${i}].constructId`,
      });
    }
    seenPosture.add(cn);
    if (p.posture !== "FLAT" && p.posture !== "POSTURE") {
      errors.push({
        rule: "FR-16",
        kind: "POSTURE_INVALID",
        message: `Unknown posture ${JSON.stringify(p.posture as string)}.`,
        path: `postures[${i}].posture`,
      });
    }
  }

  // Pool overspend: 1 point per called shot + 1 point per POSTURE assignment.
  const calledPoints = plot.attacks.reduce((n, a) => n + (a?.called ? 1 : 0), 0);
  const posturePoints = plot.postures.reduce((n, p) => n + (p?.posture === "POSTURE" ? 1 : 0), 0);
  const spend = calledPoints + posturePoints;
  const pool = state.squads[squad as number]?.poolTotal ?? 0;
  if (spend > pool) {
    errors.push({
      rule: "FR-16",
      kind: "POOL_OVERSPEND",
      message: `Committed spend ${spend} exceeds pool ${pool}.`,
      path: "attacks",
    });
  }

  return errors;
}

/* ------------------------------------------------------------------------- */
/* Squad-plot decomposition helpers                                            */
/* ------------------------------------------------------------------------- */

/** Extract the movement half of a `SquadPlots`. */
export function movePartOf(plot: SquadPlots): SquadMovePlots {
  return { squadId: plot.squadId, moves: plot.moves };
}

/** Extract the attack half of a `SquadPlots`. */
export function attackPartOf(plot: SquadPlots): SquadAttackPlot {
  return { squadId: plot.squadId, attacks: plot.attacks, postures: plot.postures };
}

/** Compute the total plotted length of a path in fx (Checkpoint 2 aid). */
export function plottedLength(path: readonly Vec2[]): Fx {
  return polylineLength(path);
}

/** Compute a construct's isqrt-derived distance to a point (rarely used). */
export function distanceTo(a: Vec2, b: Vec2): Fx {
  const dx = (b.x as number) - (a.x as number);
  const dy = (b.y as number) - (a.y as number);
  const raw = isqrt(dx * dx + dy * dy);
  return fxSub(raw as Fx, FX_ZERO);
}
