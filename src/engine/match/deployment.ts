/**
 * Deployment legality (FR-12): each squad has one spawn region; the
 * player places every construct inside its region without overlapping
 * walls or other placements; all deployments are revealed simultaneously
 * once the match begins.
 *
 * The engine exposes:
 *   - legalDeployment(state, squadId, placements) — one-squad check,
 *     used by the composer as the player pins pieces.
 *   - applyDeployments(state, [5 placements]) — simultaneous reveal
 *     transition that commits every squad's placements at once and
 *     transitions the phase to MOVEMENT_PLOT round 1.
 *
 * All checks are computed against the pre-transition snapshot; no partial
 * state is emitted. Failure returns the full violation list with no
 * placement applied.
 */

import type { Fx, Vec2 } from "../fx/index";
import { circleOverlap, pointInPoly } from "../fx/index";
import type { Catalog } from "../catalog/index";
import type { Violation } from "../build/index";
import { SQUAD_COUNT, type MatchState, type Placement, type SquadId } from "./state";
import { constructsOfSquad } from "./state";

/**
 * Return the FR-12 violations for one squad's set of placements.
 * `placements` is a caller-supplied list, one per roster construct;
 * legality checks:
 *   - Phase is DEPLOYMENT.
 *   - Exactly one placement per squad's roster construct (all-deployed gate).
 *   - Each rosterIndex referenced exactly once (no duplicates, no misses).
 *   - Each placement lies inside the squad's spawn region and inside the
 *     map bounds.
 *   - Each placement is footprint-clear of every wall segment (segment
 *     does not intersect the disk); overlaps between two placements are
 *     detected and reported.
 */
export function legalDeployment(
  state: MatchState,
  squad: SquadId,
  placements: readonly Placement[],
  catalog: Catalog,
): readonly Violation[] {
  const errors: Violation[] = [];

  if (state.phase !== "DEPLOYMENT") {
    errors.push({
      rule: "FR-12",
      kind: "WRONG_PHASE",
      message: `Deployment attempted while phase is ${state.phase}.`,
      path: "phase",
    });
    return errors;
  }
  if ((squad as number) < 0 || (squad as number) >= SQUAD_COUNT) {
    errors.push({
      rule: "FR-12",
      kind: "SQUAD_OUT_OF_RANGE",
      message: `Squad ${squad as number} is not in [0, ${SQUAD_COUNT - 1}].`,
      path: "squadId",
    });
    return errors;
  }
  const region = state.map.spawns[squad as number];
  if (region === undefined) {
    errors.push({
      rule: "FR-12",
      kind: "MISSING_SPAWN",
      message: `Spawn region for squad ${squad as number} is not defined.`,
      path: `map.spawns[${squad as number}]`,
    });
    return errors;
  }

  const roster = constructsOfSquad(state, squad);
  const rosterSize = roster.length;
  if (placements.length !== rosterSize) {
    errors.push({
      rule: "FR-12",
      kind: "PARTIAL_DEPLOYMENT",
      message: `Squad ${squad as number} deployed ${placements.length}/${rosterSize} constructs.`,
      path: "placements",
    });
  }

  // Duplicate / out-of-range rosterIndex.
  const seen = new Set<number>();
  for (let i = 0; i < placements.length; i = i + 1) {
    const p = placements[i];
    if (p === undefined) continue;
    if (!Number.isInteger(p.rosterIndex) || p.rosterIndex < 0 || p.rosterIndex >= rosterSize) {
      errors.push({
        rule: "FR-12",
        kind: "ROSTER_INDEX_OUT_OF_RANGE",
        message: `rosterIndex ${p.rosterIndex} is not in [0, ${rosterSize - 1}].`,
        path: `placements[${i}].rosterIndex`,
      });
      continue;
    }
    if (seen.has(p.rosterIndex)) {
      errors.push({
        rule: "FR-12",
        kind: "ROSTER_INDEX_DUPLICATE",
        message: `Roster construct ${p.rosterIndex} is placed more than once.`,
        path: `placements[${i}].rosterIndex`,
      });
    }
    seen.add(p.rosterIndex);
    if (!pointInPoly(p.position, region.polygon)) {
      errors.push({
        rule: "FR-12",
        kind: "OUTSIDE_SPAWN_REGION",
        message: `Placement at (${p.position.x as number}, ${p.position.y as number}) is not in squad ${squad as number}'s spawn region.`,
        path: `placements[${i}].position`,
      });
    } else if (!pointInPoly(p.position, state.map.bounds)) {
      errors.push({
        rule: "FR-12",
        kind: "OUTSIDE_BOUNDS",
        message: `Placement at (${p.position.x as number}, ${p.position.y as number}) is outside the map bounds.`,
        path: `placements[${i}].position`,
      });
    }
  }

  // Wall overlap and pairwise overlap. Uses each construct's chassis
  // footprint (radius) from the catalog.
  for (let i = 0; i < placements.length; i = i + 1) {
    const p = placements[i];
    if (p === undefined) continue;
    const c = roster[p.rosterIndex];
    if (c === undefined) continue;
    const chassis = catalog.indexes.chassisByCode.get(c.chassisCode);
    if (chassis === undefined) continue;
    const r = chassis.footprint;
    // Each wall must not cross the footprint disk (approximated: any
    // wall segment intersecting the AABB tangent to the disk).
    for (let w = 0; w < state.map.walls.length; w = w + 1) {
      const wall = state.map.walls[w];
      if (wall === undefined) continue;
      // Distance-from-segment test: convert to a "disk overlaps segment"
      // check via a closed-form projection. Cheap and exact in integers.
      if (segmentDiskContact(wall.a, wall.b, p.position, r as number)) {
        errors.push({
          rule: "FR-12",
          kind: "PLACEMENT_ON_WALL",
          message: `Placement at (${p.position.x as number}, ${p.position.y as number}) is on or through wall ${wall.id}.`,
          path: `placements[${i}].position`,
        });
        break;
      }
    }
    for (let j = i + 1; j < placements.length; j = j + 1) {
      const q = placements[j];
      if (q === undefined) continue;
      const cj = roster[q.rosterIndex];
      if (cj === undefined) continue;
      const chassisJ = catalog.indexes.chassisByCode.get(cj.chassisCode);
      if (chassisJ === undefined) continue;
      if (circleOverlap(p.position, r, q.position, chassisJ.footprint)) {
        errors.push({
          rule: "FR-12",
          kind: "PLACEMENTS_OVERLAP",
          message: `Placements at rosterIndex ${p.rosterIndex} and ${q.rosterIndex} overlap.`,
          path: `placements[${i}].position`,
        });
      }
    }
  }

  return errors;
}

/**
 * Simultaneous public reveal of every squad's deployment. On success,
 * returns a MatchState in MOVEMENT_PLOT round 1 with all positions
 * committed and every squad's own known-positions initialized. On any
 * violation across any squad, returns the whole ordered violation list.
 */
export function applyDeployments(
  state: MatchState,
  placementsPerSquad: readonly [
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
  ],
  catalog: Catalog,
): { readonly ok: true; readonly value: MatchState } | { readonly ok: false; readonly error: readonly Violation[] } {
  if (state.phase !== "DEPLOYMENT") {
    return {
      ok: false,
      error: [
        {
          rule: "FR-12",
          kind: "WRONG_PHASE",
          message: `applyDeployments called while phase is ${state.phase}.`,
          path: "phase",
        },
      ],
    };
  }

  const errors: Violation[] = [];
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const per = placementsPerSquad[sq];
    if (per === undefined) continue;
    const inner = legalDeployment(state, sq as SquadId, per, catalog);
    for (const v of inner) {
      errors.push({
        rule: v.rule,
        kind: v.kind,
        message: v.message,
        path: `squads[${sq}].${v.path}`,
      });
    }
  }
  // Cross-squad overlap: two squads' placements must not intersect.
  for (let a = 0; a < SQUAD_COUNT; a = a + 1) {
    const pa = placementsPerSquad[a];
    if (pa === undefined) continue;
    const rosterA = constructsOfSquad(state, a as SquadId);
    for (let b = a + 1; b < SQUAD_COUNT; b = b + 1) {
      const pb = placementsPerSquad[b];
      if (pb === undefined) continue;
      const rosterB = constructsOfSquad(state, b as SquadId);
      for (let i = 0; i < pa.length; i = i + 1) {
        const p = pa[i];
        if (p === undefined) continue;
        const ci = rosterA[p.rosterIndex];
        if (ci === undefined) continue;
        const chi = catalog.indexes.chassisByCode.get(ci.chassisCode);
        if (chi === undefined) continue;
        for (let j = 0; j < pb.length; j = j + 1) {
          const q = pb[j];
          if (q === undefined) continue;
          const cj = rosterB[q.rosterIndex];
          if (cj === undefined) continue;
          const chj = catalog.indexes.chassisByCode.get(cj.chassisCode);
          if (chj === undefined) continue;
          if (circleOverlap(p.position, chi.footprint, q.position, chj.footprint)) {
            errors.push({
              rule: "FR-12",
              kind: "CROSS_SQUAD_OVERLAP",
              message: `Squad ${a}'s roster ${p.rosterIndex} overlaps squad ${b}'s roster ${q.rosterIndex}.`,
              path: `squads[${a}].placements[${i}]`,
            });
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors };
  }

  // Apply — assign positions to each construct by scanning constructs in id
  // order and matching roster index within squad.
  const rosterPosition = new Map<number, Vec2>();
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const per = placementsPerSquad[sq];
    if (per === undefined) continue;
    for (let i = 0; i < per.length; i = i + 1) {
      const pl = per[i];
      if (pl === undefined) continue;
      rosterPosition.set(sq * 1_000_000 + pl.rosterIndex, {
        x: pl.position.x,
        y: pl.position.y,
      });
    }
  }
  // Walk constructs (already in creation order) and assign.
  const seenPerSquad = new Map<number, number>();
  const newConstructs = state.constructs.map((c) => {
    const key =
      (c.squadId as number) * 1_000_000 + (seenPerSquad.get(c.squadId as number) ?? 0);
    seenPerSquad.set(
      c.squadId as number,
      (seenPerSquad.get(c.squadId as number) ?? 0) + 1,
    );
    const pos = rosterPosition.get(key);
    if (pos === undefined) return c;
    return { ...c, position: pos };
  });

  // Own-squad known positions confirmed at round 1.
  const knownPositions: {
    observer: SquadId;
    subject: number;
    position: Vec2;
    confirmedRound: number;
  }[] = [];
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    for (const c of newConstructs) {
      if ((c.squadId as number) !== sq) continue;
      knownPositions.push({
        observer: sq as SquadId,
        subject: c.id as number,
        position: { x: c.position.x as Fx, y: c.position.y as Fx },
        confirmedRound: 1,
      });
    }
  }
  knownPositions.sort((a, b) => {
    if ((a.observer as number) !== (b.observer as number)) {
      return (a.observer as number) - (b.observer as number);
    }
    return a.subject - b.subject;
  });

  const nextState: MatchState = {
    ...state,
    phase: "MOVEMENT_PLOT",
    round: 1,
    constructs: newConstructs,
    knownPositions: knownPositions.map((kp) => ({
      observer: kp.observer,
      subject: kp.subject as unknown as MatchState["knownPositions"][number]["subject"],
      position: kp.position,
      confirmedRound: kp.confirmedRound,
    })),
  };
  return { ok: true, value: nextState };
}

/* ------------------------------------------------------------------------- */
/* Geometry helper — segment-disk contact                                     */
/* ------------------------------------------------------------------------- */

/**
 * True iff the closed segment ab is within `r` fx of point `c` (or crosses
 * it). Uses exact integer projection; no floats. This is the "disk overlaps
 * wall" test used at deployment time.
 */
function segmentDiskContact(
  a: { readonly x: unknown; readonly y: unknown },
  b: { readonly x: unknown; readonly y: unknown },
  c: { readonly x: unknown; readonly y: unknown },
  r: number,
): boolean {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const cx = c.x as number;
  const cy = c.y as number;
  const dx = bx - ax;
  const dy = by - ay;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 === 0) {
    const px = cx - ax;
    const py = cy - ay;
    return px * px + py * py <= r * r;
  }
  // Project c onto the segment; parameter t in [0, segLen2].
  const tNum = (cx - ax) * dx + (cy - ay) * dy;
  const t = Math.max(0, Math.min(segLen2, tNum));
  // Closest point coordinates × segLen2 (avoid division).
  const px = ax * segLen2 + t * dx;
  const py = ay * segLen2 + t * dy;
  const qx = cx * segLen2;
  const qy = cy * segLen2;
  const ddx = px - qx;
  const ddy = py - qy;
  // Compare squared distances scaled by segLen2^2. Use BigInt to avoid
  // overflow at large fx magnitudes.
  const lhs = BigInt(ddx) * BigInt(ddx) + BigInt(ddy) * BigInt(ddy);
  const rhs = BigInt(r) * BigInt(r) * BigInt(segLen2) * BigInt(segLen2);
  return lhs <= rhs;
}

