import type { Fx, Vec2 } from "../fx/index";
import type { ArchetypeId } from "../catalog/index";

/**
 * Continuous-space map types (D-1, arch §3.6). Every value is a plain,
 * readonly, structurally-cloneable record so a GameMap round-trips through
 * postMessage, the canonical hasher, and JSON without ceremony. No classes,
 * no Maps keyed by objects, no functions.
 *
 * Rule geometry lives here. Every rule-affecting distance is fx and every
 * ID is a stable integer. The playability gate later rasterises to an
 * analysis grid, but the grid has no authority — this file is the
 * authoritative shape of a map.
 */

/**
 * One line segment of terrain. IDs are 0-indexed and stable for the life of
 * a map; the spatial index and every gate check sorts by `id` to make wall
 * input order irrelevant to results.
 */
export interface WallSegment {
  readonly id: number;
  readonly a: Vec2;
  readonly b: Vec2;
}

/**
 * A deployment region for one squad (FR-12). The polygon is a simple,
 * counter-clockwise, closed set inside `GameMap.bounds`. `anchor` is the
 * geometric centroid used by spawn-fairness measurements — a stable point,
 * derived, not authored.
 *
 * `squadIndex` is a small integer in [0, 4]. The five regions are stored in
 * increasing squadIndex order so consumers never sort them.
 */
export interface SpawnRegion {
  readonly squadIndex: 0 | 1 | 2 | 3 | 4;
  readonly polygon: readonly Vec2[];
  readonly anchor: Vec2;
}

/**
 * One contraction of the trace (FR-20). `round` is the round on which this
 * contraction takes effect; `safeRegion` is the region that stays safe
 * from this contraction forward until the next entry supersedes it;
 * `damage` is the trace-damage number applied that round to constructs
 * outside `safeRegion`.
 *
 * The full schedule is public from round 1 (FR-24). Terrain is not
 * modified — the trace overlays walls, per AD-1.
 *
 * A schedule's entries are strictly increasing by round and strictly
 * monotone-shrinking by safeRegion inclusion.
 */
export interface TraceStep {
  readonly round: number;
  readonly safeRegion: readonly Vec2[];
  readonly damage: number;
}

/**
 * A generated map. All fields are frozen at construction:
 *   • `seed` is the seed that produced this map (base seed, not a
 *     regeneration derivative).
 *   • `acceptedAttempt` is the 1-indexed regeneration attempt that passed
 *     the gate. `1` means the first attempt was accepted.
 *   • `archetypeId` is the resolved archetype (never "any").
 *   • `bounds` is a convex polygon in fx defining the play area.
 *   • `walls` are internal terrain segments; the outer boundary is `bounds`,
 *     not a repetition here.
 *   • `spawns` is a fixed-arity tuple of five regions, ordered by
 *     `squadIndex` 0..4.
 *   • `traceSchedule` is the ordered sequence of contractions from round 1
 *     forward; may be empty if the archetype declines to contract.
 */
export interface GameMap {
  readonly seed: string;
  readonly acceptedAttempt: number;
  readonly archetypeId: ArchetypeId;
  readonly bounds: readonly Vec2[];
  readonly walls: readonly WallSegment[];
  readonly spawns: SpawnQuintet;
  readonly traceSchedule: readonly TraceStep[];
}

/** Fixed-arity spawn tuple — five squads (FR-4). */
export type SpawnQuintet = readonly [
  SpawnRegion,
  SpawnRegion,
  SpawnRegion,
  SpawnRegion,
  SpawnRegion,
];

/**
 * The three archetype-distinguishing metrics (FR-10).
 *   • `wallDensity`: fraction of the total wall length allowance actually
 *     produced. Unitless in [0, 1].
 *   • `meanSightlineLength`: expected length in fx of a random unobstructed
 *     straight-line sight, sampled by the map module's deterministic probe.
 *   • `openAreaFraction`: analysis-grid cells with no wall within one cell
 *     divided by total in-bounds cells. Unitless in [0, 1].
 */
export interface ArchetypeMetrics {
  readonly wallDensity: number;
  readonly meanSightlineLength: Fx;
  readonly openAreaFraction: number;
}

/**
 * Structured evidence from one FR-11 check. `observed` and `threshold`
 * carry per-check named values so an aggregation harness can surface the
 * distribution of failures across a large seed sample.
 */
export type GateCheckId =
  | "CONNECTIVITY"
  | "POCKETS"
  | "COVER_DISTRIBUTION"
  | "SPAWN_FAIRNESS"
  | "CHOKEPOINTS"
  | "TRACE_SURVIVABILITY"
  | "ARCHETYPE_RANGE";

export interface GateCheck {
  readonly id: GateCheckId;
  readonly passed: boolean;
  readonly observed: Readonly<Record<string, number | string>>;
  readonly threshold: Readonly<Record<string, number | string>>;
  readonly message: string;
}

/** Overall gate result. `checks` is in a fixed order defined by `GATE_CHECK_ORDER`. */
export interface GateReport {
  readonly passed: boolean;
  readonly checks: readonly GateCheck[];
}

/**
 * Canonical evaluation order for gate checks. Sorting reports by this
 * order makes cross-run diffs mechanically comparable.
 */
export const GATE_CHECK_ORDER: readonly GateCheckId[] = [
  "CONNECTIVITY",
  "POCKETS",
  "COVER_DISTRIBUTION",
  "SPAWN_FAIRNESS",
  "CHOKEPOINTS",
  "TRACE_SURVIVABILITY",
  "ARCHETYPE_RANGE",
];

/**
 * A regenerate-and-retry failure. `attempts` is the ordered list of every
 * rejected report the loop produced before giving up.
 */
export interface MapGenerationDefect {
  readonly kind: "MAX_REGEN_EXCEEDED";
  readonly baseSeed: string;
  readonly archetypeId: ArchetypeId;
  readonly attempts: readonly {
    readonly attempt: number;
    readonly derivedSeed: string;
    readonly report: GateReport;
  }[];
}

/**
 * Successful generation. `rejectedReports` are the ordered reports from
 * every attempt before `map.acceptedAttempt` (empty when the first attempt
 * passed) — the harness aggregates them into per-archetype pass-rate
 * histograms without a second pass.
 */
export interface MapResult {
  readonly map: GameMap;
  readonly rejectedReports: readonly {
    readonly attempt: number;
    readonly derivedSeed: string;
    readonly report: GateReport;
  }[];
}

/**
 * Return true iff every point of `inner` lies inside `outer`. Used to
 * validate that a trace schedule is monotone-shrinking — the check is a
 * requirement of FR-20 ("shrinks monotonically") and it is cheap enough
 * to run at map-construction time.
 *
 * Both polygons must be closed, in `Vec2` fx integer coordinates.
 */
export function polygonContains(
  outer: readonly Vec2[],
  inner: readonly Vec2[],
): boolean {
  if (outer.length < 3 || inner.length < 3) return false;
  // Every vertex of `inner` must lie inside (or on) `outer`. This is a
  // conservative sufficient condition when both polygons are convex, which
  // the map module guarantees for bounds and trace safe regions.
  for (let i = 0; i < inner.length; i = i + 1) {
    const v = inner[i];
    if (v === undefined) return false;
    if (!pointInsideClosedPolygon(v, outer)) return false;
  }
  return true;
}

/**
 * Point-in-polygon for CLOSED polygons — mirrors the fx/geometry version
 * but is kept here to avoid every consumer of `polygonContains` pulling
 * geometry into their import graph.
 */
function pointInsideClosedPolygon(
  p: Vec2,
  polygon: readonly Vec2[],
): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  const px = p.x as number;
  const py = p.y as number;
  // Boundary
  for (let i = 0; i < n; i = i + 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    if (onSegmentClosed(px, py, a, b)) return true;
  }
  // Ray-cast interior
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
      if (cross * denomSign > 0) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function onSegmentClosed(px: number, py: number, a: Vec2, b: Vec2): boolean {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (cross !== 0) return false;
  const xLo = ax <= bx ? ax : bx;
  const xHi = ax >= bx ? ax : bx;
  const yLo = ay <= by ? ay : by;
  const yHi = ay >= by ? ay : by;
  return px >= xLo && px <= xHi && py >= yLo && py <= yHi;
}

/**
 * Validate a trace schedule: strictly increasing rounds, monotone-nested
 * safe regions, each region inside `bounds`. Returns null on success or an
 * error string identifying the first violation. Callers throw or return a
 * typed error as appropriate for their layer.
 */
export function validateTraceSchedule(
  bounds: readonly Vec2[],
  schedule: readonly TraceStep[],
): string | null {
  for (let i = 0; i < schedule.length; i = i + 1) {
    const step = schedule[i];
    if (step === undefined) continue;
    if (step.safeRegion.length < 3) {
      return `trace[${i}]: safe region needs ≥ 3 vertices`;
    }
    if (i === 0) {
      if (!polygonContains(bounds, step.safeRegion)) {
        return `trace[0]: not inside bounds`;
      }
    } else {
      const prev = schedule[i - 1];
      if (prev === undefined) continue;
      if (step.round <= prev.round) {
        return `trace[${i}]: round ${step.round} not > previous ${prev.round}`;
      }
      if (!polygonContains(prev.safeRegion, step.safeRegion)) {
        return `trace[${i}]: safe region not nested in previous`;
      }
    }
  }
  return null;
}

/**
 * Assert that five spawn regions are pairwise non-overlapping (interior
 * disjoint). Two regions "overlap" iff any vertex of one lies strictly
 * inside the other. This is a conservative predicate for the axis-aligned
 * or convex spawn polygons the generators produce.
 */
export function spawnRegionsDisjoint(regions: SpawnQuintet): boolean {
  for (let i = 0; i < regions.length; i = i + 1) {
    for (let j = i + 1; j < regions.length; j = j + 1) {
      const ri = regions[i];
      const rj = regions[j];
      if (ri === undefined || rj === undefined) continue;
      if (anyVertexStrictlyInside(ri.polygon, rj.polygon)) return false;
      if (anyVertexStrictlyInside(rj.polygon, ri.polygon)) return false;
    }
  }
  return true;
}

function anyVertexStrictlyInside(
  inner: readonly Vec2[],
  outer: readonly Vec2[],
): boolean {
  if (outer.length < 3) return false;
  for (let i = 0; i < inner.length; i = i + 1) {
    const v = inner[i];
    if (v === undefined) continue;
    if (strictlyInside(v, outer)) return true;
  }
  return false;
}

function strictlyInside(p: Vec2, polygon: readonly Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  const px = p.x as number;
  const py = p.y as number;
  // Boundary counts as OUTSIDE for the "strictly" test.
  for (let i = 0; i < n; i = i + 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    if (onSegmentClosed(px, py, a, b)) return false;
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
      if (cross * denomSign > 0) {
        inside = !inside;
      }
    }
  }
  return inside;
}
