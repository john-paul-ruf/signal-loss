import {
  type Fx,
  type Vec2,
  FX_ONE,
  fxFromInt,
  isqrt,
} from "../fx/index";
import type { WallSegment, ArchetypeMetrics, GameMap } from "./types";
import { buildWallIndex, hasLineOfSight } from "./spatial-index";

/**
 * Deterministic metrics for a generated map (FR-10: "distinguishable
 * by measurement, not only by eye").
 *
 * All three metrics are pure functions of the map — no RNG, no clock,
 * no sample randomization. `wallDensity` is a length-per-area ratio;
 * `meanSightlineLength` is the average unobstructed ray length across
 * a fixed sample grid × 8 cardinal directions; `openAreaFraction` is
 * the fraction of coarse-grid cells not touched by a wall (one-cell
 * neighborhood inclusive).
 *
 * The sample grid resolution and the measurement cell size are inputs
 * so Session 06 can retune without touching this module.
 */

export interface MeasureOptions {
  /** Cell size of the internal wall spatial index, fx. */
  readonly indexCellSize: Fx;
  /** Cell size of the openAreaFraction sampling grid, fx. */
  readonly openCellSize: Fx;
  /** Number of sight-sample points per axis. */
  readonly sightSamplesPerAxis: number;
  /** Maximum ray length for a sightline probe, fx. */
  readonly sightMaxRange: Fx;
}

/**
 * Compute the three archetype metrics. Accepts either the full `GameMap`
 * or a bare walls/bounds pair — generators call the bare form during
 * an in-progress attempt before the full record is assembled.
 */
export function measureArchetype(
  walls: readonly WallSegment[],
  bounds: readonly Vec2[],
  options: MeasureOptions,
): ArchetypeMetrics {
  const bounds4 = polygonAABB(bounds);
  return {
    wallDensity: computeWallDensity(walls, bounds4),
    meanSightlineLength: computeMeanSightline(walls, bounds4, options),
    openAreaFraction: computeOpenAreaFraction(walls, bounds4, options.openCellSize),
  };
}

/** Convenience: measure a full GameMap. */
export function measureGameMap(map: GameMap, options: MeasureOptions): ArchetypeMetrics {
  return measureArchetype(map.walls, map.bounds, options);
}

interface Bounds4 {
  readonly min: Vec2;
  readonly max: Vec2;
  readonly widthFx: number;
  readonly heightFx: number;
}

function polygonAABB(polygon: readonly Vec2[]): Bounds4 {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < polygon.length; i = i + 1) {
    const v = polygon[i];
    if (v === undefined) continue;
    const x = v.x as number;
    const y = v.y as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    min: { x: minX as Fx, y: minY as Fx },
    max: { x: maxX as Fx, y: maxY as Fx },
    widthFx: maxX - minX,
    heightFx: maxY - minY,
  };
}

/**
 * Wall density = total wall length (board units) / bounds area (board²).
 * Unitless in the interval [0, ∞); typical maps land in [0.05, 0.6].
 */
function computeWallDensity(walls: readonly WallSegment[], bounds: Bounds4): number {
  if (walls.length === 0) return 0;
  const areaUnits2 = (bounds.widthFx / FX_ONE) * (bounds.heightFx / FX_ONE);
  if (areaUnits2 <= 0) return 0;
  let totalLenFx = 0;
  for (let i = 0; i < walls.length; i = i + 1) {
    const w = walls[i];
    if (w === undefined) continue;
    const dx = (w.b.x as number) - (w.a.x as number);
    const dy = (w.b.y as number) - (w.a.y as number);
    totalLenFx = totalLenFx + isqrt(dx * dx + dy * dy);
  }
  const totalLenUnits = totalLenFx / FX_ONE;
  return totalLenUnits / areaUnits2;
}

/**
 * Mean sightline length across an N×N sample grid × 4 cardinal
 * directions. Each ray extends up to `sightMaxRange`; the wall index
 * short-circuits candidate discovery so the total probe cost is small.
 *
 * Cardinal-only is deliberate: with dx, dy ∈ {−1, 0, 1} and no
 * diagonal, a step of `distFx` fx units moves exactly `distFx` fx
 * units in Euclidean distance. Diagonals would require Euclidean
 * normalisation and drift under integer truncation — the metric is
 * still informative without them.
 */
function computeMeanSightline(
  walls: readonly WallSegment[],
  bounds: Bounds4,
  options: MeasureOptions,
): Fx {
  const n = Math.max(2, options.sightSamplesPerAxis);
  const maxRangeFx = options.sightMaxRange as number;
  const index = buildWallIndex(walls, bounds, options.indexCellSize);
  const stepX = bounds.widthFx / (n + 1);
  const stepY = bounds.heightFx / (n + 1);
  const dirs: readonly (readonly [number, number])[] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  let total = 0;
  let count = 0;
  const minXFx = bounds.min.x as number;
  const minYFx = bounds.min.y as number;
  for (let i = 1; i <= n; i = i + 1) {
    for (let j = 1; j <= n; j = j + 1) {
      const px = Math.trunc(minXFx + i * stepX);
      const py = Math.trunc(minYFx + j * stepY);
      const origin: Vec2 = { x: px as Fx, y: py as Fx };
      for (let d = 0; d < dirs.length; d = d + 1) {
        const dir = dirs[d];
        if (dir === undefined) continue;
        const len = probeCardinalLength(index, origin, dir[0], dir[1], maxRangeFx);
        total = total + len;
        count = count + 1;
      }
    }
  }
  if (count === 0) return 0 as Fx;
  return Math.trunc(total / count) as Fx;
}

/**
 * Greatest length up to `maxRangeFx` for which the ray from `origin`
 * in a cardinal direction `(dx, dy) ∈ {(±1,0),(0,±1)}` has clear
 * line of sight. Returns the length in fx via doubling + binary search
 * over the wall spatial index.
 */
function probeCardinalLength(
  index: ReturnType<typeof buildWallIndex>,
  origin: Vec2,
  dx: number,
  dy: number,
  maxRangeFx: number,
): number {
  let lo = 0;
  let hi = 1;
  while (hi <= maxRangeFx) {
    if (rayBlockedCardinal(index, origin, dx, dy, hi)) break;
    lo = hi;
    hi = hi * 2;
  }
  if (hi > maxRangeFx) hi = maxRangeFx;
  if (lo >= hi) return lo;
  while (hi - lo > 1) {
    const mid = lo + Math.trunc((hi - lo) / 2);
    if (rayBlockedCardinal(index, origin, dx, dy, mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}

function rayBlockedCardinal(
  index: ReturnType<typeof buildWallIndex>,
  origin: Vec2,
  dx: number,
  dy: number,
  distFx: number,
): boolean {
  const ex = ((origin.x as number) + dx * distFx) as Fx;
  const ey = ((origin.y as number) + dy * distFx) as Fx;
  const end: Vec2 = { x: ex, y: ey };
  return !hasLineOfSight(index, origin, end);
}

/**
 * Open-area fraction: rasterise walls onto a coarse grid, mark cells
 * touched by a wall or immediately adjacent to one as "cover", count
 * the remainder as "open". Returns cells_open / cells_total.
 */
function computeOpenAreaFraction(
  walls: readonly WallSegment[],
  bounds: Bounds4,
  cellSize: Fx,
): number {
  const cs = cellSize as number;
  const cols = Math.max(1, Math.ceil(bounds.widthFx / cs));
  const rows = Math.max(1, Math.ceil(bounds.heightFx / cs));
  const total = cols * rows;
  const marked = new Uint8Array(total);
  const minX = bounds.min.x as number;
  const minY = bounds.min.y as number;
  for (let i = 0; i < walls.length; i = i + 1) {
    const w = walls[i];
    if (w === undefined) continue;
    const c0 = clamp(Math.floor(((w.a.x as number) - minX) / cs), 0, cols - 1);
    const c1 = clamp(Math.floor(((w.b.x as number) - minX) / cs), 0, cols - 1);
    const r0 = clamp(Math.floor(((w.a.y as number) - minY) / cs), 0, rows - 1);
    const r1 = clamp(Math.floor(((w.b.y as number) - minY) / cs), 0, rows - 1);
    const cLo = c0 <= c1 ? c0 : c1;
    const cHi = c0 >= c1 ? c0 : c1;
    const rLo = r0 <= r1 ? r0 : r1;
    const rHi = r0 >= r1 ? r0 : r1;
    for (let r = rLo; r <= rHi; r = r + 1) {
      for (let c = cLo; c <= cHi; c = c + 1) {
        marked[r * cols + c] = 1;
        // Adjacency mark — cover fills the neighborhood, not just the cell.
        if (c > 0) marked[r * cols + (c - 1)] = 1;
        if (c + 1 < cols) marked[r * cols + (c + 1)] = 1;
        if (r > 0) marked[(r - 1) * cols + c] = 1;
        if (r + 1 < rows) marked[(r + 1) * cols + c] = 1;
      }
    }
  }
  let open = 0;
  for (let i = 0; i < total; i = i + 1) {
    if (marked[i] === 0) open = open + 1;
  }
  return open / total;
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/**
 * Default measurement options — usable in tests without tuning. Session
 * 06 supplies its own when validating release archetypes.
 */
export const DEFAULT_MEASURE_OPTIONS: MeasureOptions = {
  indexCellSize: fxFromInt(4),
  openCellSize: fxFromInt(2),
  sightSamplesPerAxis: 8,
  sightMaxRange: fxFromInt(64),
};
