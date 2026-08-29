/**
 * Simultaneous movement resolution: 64-substep arc traversal with a
 * symmetric halt fixed point (arch §5.2, resolves OQ-7).
 *
 * Invariants:
 *   - All candidate positions per substep are computed from a frozen
 *     prior snapshot. No construct observes another's partial update.
 *   - Contact is a symmetric set predicate: if any pair overlaps, BOTH
 *     enter the halt set in the same iteration. No priority, no
 *     displacement, no pass-through (D-2, FR-15).
 *   - Halted constructs stick at their last non-contacting position for
 *     the rest of the round and can cause cascades (a third construct
 *     halting into a halted one halts too, in a later iteration of the
 *     same fixed point).
 *   - Order-independent by construction: the algorithm reads no ordered
 *     input except the sorted-by-id construct list, and contact is a
 *     symmetric relation over a snapshot.
 *
 * Emits `MOVED` events for every alive construct that had a plotted
 * path, plus one `HALTED` event per haltee naming the constructs it
 * contacted at the substep it halted at.
 */

import type { Fx, Vec2 } from "../fx/index";
import {
  FX_ZERO,
  fxRaw,
  measurePolyline,
  polylinePointAt,
  vecEq,
} from "../fx/index";
import type { Catalog } from "../catalog/index";
import type { Violation } from "../build/index";
import type { Event, HaltedEvent, MovedEvent } from "./events";
import type {
  ConstructId,
  MatchConstruct,
  MatchState,
  SquadId,
} from "./state";
import { SQUAD_COUNT, getConstruct } from "./state";
import { legalMovePlot, type SquadMovePlots } from "./plot";

/**
 * Look up a chassis's footprint from the catalog for a given construct.
 * Returns null if the catalog does not resolve the chassis (which is a
 * defect — the state should never carry an unresolved chassis code).
 */
function footprintOf(construct: MatchConstruct, catalog: Catalog): Fx | null {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) return null;
  return chassis.footprint;
}

/**
 * Substep index `k` at which `pos(k)` is derived, `k` in [0, MOVE_SUBSTEPS].
 * Arc length at substep `k` = `totalLength × k / MOVE_SUBSTEPS`.
 */
function arcAtSubstep(totalLength: Fx, k: number, substeps: number): Fx {
  // Integer arithmetic: totalLength * k / substeps (truncated). No float.
  const raw = ((totalLength as number) * k) / substeps;
  return fxRaw(Math.trunc(raw)) as Fx;
}

/**
 * Squared distance in fx² between two Vec2 without an isqrt call.
 */
function dist2(a: Vec2, b: Vec2): number {
  const dx = (a.x as number) - (b.x as number);
  const dy = (a.y as number) - (b.y as number);
  return dx * dx + dy * dy;
}

/**
 * Compact per-construct working record for the substep loop.
 */
interface Mover {
  readonly id: ConstructId;
  readonly squadId: SquadId;
  readonly footprint: number;
  readonly path: readonly Vec2[];
  readonly totalLength: Fx;
  readonly measure: ReturnType<typeof measurePolyline>;
  /** Position at the last committed substep (starts at path[0] or c.position). */
  position: Vec2;
  /** True the moment a contact halts this construct. */
  halted: boolean;
  /** Substep at which the halt occurred (1-indexed, or 0 if never). */
  haltAtSubstep: number;
  /** Construct ids this construct contacted at halt. Sorted ascending. */
  haltWith: number[];
  /** True if the plotted path was non-empty (HOLD emits no MOVED event). */
  hasPath: boolean;
}

/**
 * Result of `resolveMovementPhase`. State is advanced (phase moves to
 * ATTACK_PLOT with new positions) and the ordered event log lists
 * MOVED/HALTED for every alive construct.
 */
export interface MovementResult {
  readonly state: MatchState;
  readonly events: readonly Event[];
}

/**
 * Movement-stage transition. Validates that:
 *   - phase is MOVEMENT_PLOT
 *   - all five squads' plot arrays are present (one per SquadId)
 *   - every plot's constructId belongs to that squad
 *   - each MovePlot is individually legal via `legalMovePlot`
 *
 * On any violation returns an ok=false Result; on success returns the
 * post-movement MatchState (phase=ATTACK_PLOT) plus events.
 */
export function resolveMovementPhase(
  state: MatchState,
  plots: readonly [
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
  ],
  catalog: Catalog,
): { readonly ok: true; readonly value: MovementResult } | { readonly ok: false; readonly error: readonly Violation[] } {
  if (state.phase !== "MOVEMENT_PLOT") {
    return {
      ok: false,
      error: [
        {
          rule: "FR-13",
          kind: "WRONG_PHASE",
          message: `resolveMovementPhase requires MOVEMENT_PLOT; got ${state.phase}.`,
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
          message: `Movement expects ${SQUAD_COUNT} plots; got ${plots.length}.`,
          path: "plots",
        },
      ],
    };
  }

  const errors: Violation[] = [];
  // Normalize per construct. plotByCid stores the normalized path (or empty).
  // Plot arrays may be passed in any squad order (FR-15 order independence):
  // the engine indexes by `squadId`, not by array position.
  const plotByCid = new Map<number, readonly Vec2[]>();
  const seenSquad = new Set<number>();
  for (let i = 0; i < plots.length; i = i + 1) {
    const sp = plots[i];
    if (sp === undefined) continue;
    const sq = sp.squadId as number;
    if (sq < 0 || sq >= SQUAD_COUNT) {
      errors.push({
        rule: "FR-13",
        kind: "SQUAD_ID_OUT_OF_RANGE",
        message: `plots[${i}].squadId is ${sq}; must be in [0, ${SQUAD_COUNT - 1}].`,
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
    const seenAttacker = new Set<number>();
    for (let j = 0; j < sp.moves.length; j = j + 1) {
      const m = sp.moves[j];
      if (m === undefined) continue;
      const cid = m.constructId as number;
      if (seenAttacker.has(cid)) {
        errors.push({
          rule: "FR-14",
          kind: "DUPLICATE_MOVE",
          message: `Construct ${cid} has more than one move plot.`,
          path: `plots[${i}].moves[${j}].constructId`,
        });
        continue;
      }
      seenAttacker.add(cid);
      const c = getConstruct(state, m.constructId);
      if (c === undefined || (c.squadId as number) !== sq) {
        errors.push({
          rule: "FR-14",
          kind: "MOVE_NOT_OWNED",
          message: `Construct ${cid} is not owned by squad ${sq}.`,
          path: `plots[${i}].moves[${j}].constructId`,
        });
        continue;
      }
      if (c.destroyed) {
        // Silently HOLD a destroyed construct rather than reject — replay
        // logs can contain leftover plots for freshly-destroyed pieces.
        plotByCid.set(cid, []);
        continue;
      }
      const legality = legalMovePlot(state, m.constructId, m.path, catalog);
      if (!legality.ok) {
        for (const v of legality.error) {
          errors.push({
            rule: v.rule,
            kind: v.kind,
            message: v.message,
            path: `plots[${i}].moves[${j}].${v.path}`,
          });
        }
        continue;
      }
      plotByCid.set(cid, legality.value.path);
    }
  }
  // All five squads must be represented (empty moves = all HOLD is fine).
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    if (!seenSquad.has(sq)) {
      errors.push({
        rule: "FR-13",
        kind: "SQUAD_MISSING",
        message: `Squad ${sq} has no movement plot.`,
        path: "plots",
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors };
  }

  // Build movers for every alive construct. Missing plot = HOLD.
  const substeps = catalog.tunables.MOVE_SUBSTEPS;
  const movers: Mover[] = [];
  for (const c of state.constructs) {
    if (c.destroyed) continue;
    const footprint = footprintOf(c, catalog);
    if (footprint === null) {
      return {
        ok: false,
        error: [
          {
            rule: "FR-14",
            kind: "CHASSIS_UNRESOLVED",
            message: `Construct ${c.id as number}'s chassis code ${c.chassisCode as number} did not resolve.`,
            path: `constructs[${c.id as number}].chassisCode`,
          },
        ],
      };
    }
    const path = plotByCid.get(c.id as number) ?? [];
    const hasPath = path.length >= 2;
    const measure = measurePolyline({ vertices: path });
    movers.push({
      id: c.id,
      squadId: c.squadId,
      footprint: footprint as number,
      path,
      totalLength: measure.totalLength,
      measure,
      position: hasPath ? path[0] as Vec2 : c.position,
      halted: !hasPath, // Constructs holding position are inert; they still block.
      haltAtSubstep: 0,
      haltWith: [],
      hasPath,
    });
  }

  // Substep loop. Snapshot-then-apply: `candidates[i]` is derived from the
  // prior committed `positions`; contact is symmetric; halted cascades to
  // fixed point before positions commit.
  const candidates: Vec2[] = movers.map((m) => m.position);
  for (let k = 1; k <= substeps; k = k + 1) {
    // Advance candidates for non-halted movers.
    for (let i = 0; i < movers.length; i = i + 1) {
      const m = movers[i];
      if (m === undefined) continue;
      if (m.halted) {
        candidates[i] = m.position;
        continue;
      }
      const s = arcAtSubstep(m.totalLength, k, substeps);
      candidates[i] = polylinePointAt({ vertices: m.path }, m.measure, s);
    }

    // Symmetric contact detection + halt fixed point.
    let changed = true;
    while (changed) {
      changed = false;
      const newHalts = new Set<number>();
      const contacts = new Map<number, Set<number>>();
      for (let i = 0; i < movers.length; i = i + 1) {
        const mi = movers[i];
        if (mi === undefined) continue;
        const ci = candidates[i];
        if (ci === undefined) continue;
        for (let j = i + 1; j < movers.length; j = j + 1) {
          const mj = movers[j];
          if (mj === undefined) continue;
          const cj = candidates[j];
          if (cj === undefined) continue;
          // A pair "contacts" iff their disks overlap. If BOTH are already
          // halted, the pair state is irrelevant to future updates —
          // permanent overlap of halted pieces is possible if they started
          // there, and does not re-trigger.
          if (mi.halted && mj.halted) continue;
          const sum = mi.footprint + mj.footprint;
          if (dist2(ci, cj) <= sum * sum) {
            recordContact(contacts, mi.id as number, mj.id as number);
            recordContact(contacts, mj.id as number, mi.id as number);
            if (!mi.halted) newHalts.add(i);
            if (!mj.halted) newHalts.add(j);
          }
        }
      }
      if (newHalts.size > 0) {
        changed = true;
        for (const idx of newHalts) {
          const m = movers[idx];
          if (m === undefined) continue;
          m.halted = true;
          m.haltAtSubstep = k;
          const cw = contacts.get(m.id as number);
          if (cw !== undefined) {
            m.haltWith = Array.from(cw).sort((a, b) => a - b);
          }
          // Revert candidate to prior committed position (the last non-
          // contacting one).
          candidates[idx] = m.position;
        }
      }
    }

    // Commit candidates as the new positions.
    for (let i = 0; i < movers.length; i = i + 1) {
      const m = movers[i];
      if (m === undefined) continue;
      const c = candidates[i];
      if (c === undefined) continue;
      m.position = c;
    }
  }

  // Build events + update state.
  const events: Event[] = [];
  for (const m of movers) {
    if (!m.hasPath && !m.halted) continue; // pure HOLD — no event
    if (!m.hasPath && m.halted && m.haltAtSubstep === 0) continue; // inert HOLD; no halt event
    const from = m.path.length >= 1 ? (m.path[0] as Vec2) : m.position;
    const walked = arcWalked(m, substeps);
    const moved: MovedEvent = {
      kind: "MOVED",
      round: state.round,
      constructId: m.id,
      from,
      stopPosition: m.position,
      plottedPath: m.path,
      pathDistance: walked as number,
      plottedLength: m.totalLength as number,
      halted: m.halted && m.haltAtSubstep > 0,
    };
    events.push(moved);
    if (m.halted && m.haltAtSubstep > 0) {
      const halted: HaltedEvent = {
        kind: "HALTED",
        round: state.round,
        constructId: m.id,
        stopPosition: m.position,
        withConstructs: m.haltWith.slice().sort((a, b) => a - b) as unknown as readonly ConstructId[],
        reason: "CONTACT",
        atSubstep: m.haltAtSubstep,
      };
      events.push(halted);
    }
  }

  // Update construct positions in the state. Halted constructs sit at
  // their last accepted position, which is `m.position`.
  const posByCid = new Map<number, Vec2>();
  for (const m of movers) posByCid.set(m.id as number, m.position);
  const newConstructs = state.constructs.map((c) => {
    const p = posByCid.get(c.id as number);
    if (p === undefined) return c;
    if (vecEq(p, c.position)) return c;
    return { ...c, position: p };
  });

  const nextState: MatchState = {
    ...state,
    phase: "ATTACK_PLOT",
    constructs: newConstructs,
  };

  return { ok: true, value: { state: nextState, events } };
}

/**
 * Return the exact arc length the construct actually walked before it
 * halted (or the full length if it never halted). Uses integer scaling
 * to avoid floats: `walked = totalLength × haltAtSubstep / MOVE_SUBSTEPS`.
 */
function arcWalked(m: Mover, substeps: number): Fx {
  if (!m.halted) return m.totalLength;
  if (m.haltAtSubstep === 0) return FX_ZERO;
  // haltAtSubstep is the step at which contact was detected — the mover
  // was reverted to the state at haltAtSubstep - 1.
  const step = m.haltAtSubstep - 1;
  const raw = ((m.totalLength as number) * step) / substeps;
  return fxRaw(Math.trunc(raw)) as Fx;
}

/** Add `other` to `contacts.get(cid)`, creating the set on first insert. */
function recordContact(
  contacts: Map<number, Set<number>>,
  cid: number,
  other: number,
): void {
  let s = contacts.get(cid);
  if (s === undefined) {
    s = new Set<number>();
    contacts.set(cid, s);
  }
  s.add(other);
}
