import type { Fx, Vec2 } from "../fx/index";
import { segIntersect } from "../fx/index";
import type { WallSegment } from "./types";

/**
 * Deterministic uniform-grid spatial index over wall segments. The grid
 * bins each wall into every cell its AABB touches; queries return the
 * union of hit-cell contents, always sorted by ascending wall id.
 *
 * The grid is purely an acceleration structure. Every query the engine
 * exposes (LOS in particular) is exact — the grid narrows candidates,
 * exact geometry decides. Results depend ONLY on the input walls' ids
 * and geometry, never on the order they were passed in (arch §3.6).
 *
 * Bin size is a construction parameter. Consumers pass a value derived
 * from tunables (typically a construct footprint). No default is chosen
 * here — the map module owns that decision at generation time.
 */

/** An axis-aligned bounding box in fx. `min ≤ max` component-wise. */
export interface AABB {
  readonly min: Vec2;
  readonly max: Vec2;
}

/**
 * A frozen wall spatial index. `bins[row * cols + col]` is the sorted list
 * of wall ids intersecting cell (col, row). `origin` is the world-space
 * lower-left of cell (0, 0). Cell size is `cellSize` in fx.
 *
 * The list of walls the index was built from is retained by id so the
 * exact geometry is one lookup away without threading arrays through the
 * query API.
 */
export interface WallIndex {
  readonly cellSize: Fx;
  readonly origin: Vec2;
  readonly cols: number;
  readonly rows: number;
  readonly bins: readonly (readonly number[])[];
  readonly wallsById: ReadonlyMap<number, WallSegment>;
}

/**
 * Build the index. `bounds` is the outer AABB of the play area; walls
 * outside it are still indexed (but binned to the boundary cells).
 *
 * Walls are sorted by id before binning so the enumeration order inside
 * each cell is deterministic even if the caller shuffled them. Duplicated
 * ids throw — the caller must supply a well-formed collection.
 */
export function buildWallIndex(
  walls: readonly WallSegment[],
  bounds: AABB,
  cellSize: Fx,
): WallIndex {
  const cs = cellSize as number;
  if (!Number.isInteger(cs) || cs <= 0) {
    throw new RangeError(`buildWallIndex: cellSize must be a positive integer; got ${cs}.`);
  }
  const minX = bounds.min.x as number;
  const minY = bounds.min.y as number;
  const maxX = bounds.max.x as number;
  const maxY = bounds.max.y as number;
  if (minX > maxX || minY > maxY) {
    throw new RangeError("buildWallIndex: bounds min must not exceed max.");
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cs));
  const rows = Math.max(1, Math.ceil((maxY - minY) / cs));
  const bins: number[][] = [];
  for (let i = 0; i < cols * rows; i = i + 1) {
    bins.push([]);
  }
  // Copy + sort by id so bin enumeration is caller-order-independent.
  const sorted = walls.slice().sort((a, b) => a.id - b.id);
  const wallsById = new Map<number, WallSegment>();
  for (let i = 0; i < sorted.length; i = i + 1) {
    const w = sorted[i];
    if (w === undefined) continue;
    if (wallsById.has(w.id)) {
      throw new RangeError(`buildWallIndex: duplicate wall id ${w.id}.`);
    }
    wallsById.set(w.id, w);
    const bb = wallAABB(w);
    const col0 = clamp(Math.floor(((bb.min.x as number) - minX) / cs), 0, cols - 1);
    const col1 = clamp(Math.floor(((bb.max.x as number) - minX) / cs), 0, cols - 1);
    const row0 = clamp(Math.floor(((bb.min.y as number) - minY) / cs), 0, rows - 1);
    const row1 = clamp(Math.floor(((bb.max.y as number) - minY) / cs), 0, rows - 1);
    for (let r = row0; r <= row1; r = r + 1) {
      for (let c = col0; c <= col1; c = c + 1) {
        const bin = bins[r * cols + c];
        if (bin !== undefined) bin.push(w.id);
      }
    }
  }
  // Bins are populated in id order (sorted iteration above), so no further
  // sort is required. Explicit assertion for the reader:
  for (let i = 0; i < bins.length; i = i + 1) {
    const bin = bins[i];
    if (bin === undefined) continue;
    for (let k = 1; k < bin.length; k = k + 1) {
      const prev = bin[k - 1] as number;
      const cur = bin[k] as number;
      if (prev >= cur) {
        throw new Error(`buildWallIndex: internal invariant broken at bin ${i}.`);
      }
    }
  }
  return {
    cellSize,
    origin: bounds.min,
    cols,
    rows,
    bins,
    wallsById,
  };
}

/**
 * Return the sorted-by-id list of wall segments whose AABB overlaps the
 * query AABB. Bin membership is the fast filter; every returned wall's
 * AABB is verified against `query` before inclusion.
 */
export function queryWalls(
  index: WallIndex,
  query: AABB,
): readonly WallSegment[] {
  const cs = index.cellSize as number;
  const minX = index.origin.x as number;
  const minY = index.origin.y as number;
  const qMinX = query.min.x as number;
  const qMinY = query.min.y as number;
  const qMaxX = query.max.x as number;
  const qMaxY = query.max.y as number;
  const col0 = clamp(Math.floor((qMinX - minX) / cs), 0, index.cols - 1);
  const col1 = clamp(Math.floor((qMaxX - minX) / cs), 0, index.cols - 1);
  const row0 = clamp(Math.floor((qMinY - minY) / cs), 0, index.rows - 1);
  const row1 = clamp(Math.floor((qMaxY - minY) / cs), 0, index.rows - 1);
  const seen = new Set<number>();
  const ids: number[] = [];
  for (let r = row0; r <= row1; r = r + 1) {
    for (let c = col0; c <= col1; c = c + 1) {
      const bin = index.bins[r * index.cols + c];
      if (bin === undefined) continue;
      for (let k = 0; k < bin.length; k = k + 1) {
        const id = bin[k] as number;
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
  }
  ids.sort((a, b) => a - b);
  const out: WallSegment[] = [];
  for (let i = 0; i < ids.length; i = i + 1) {
    const id = ids[i] as number;
    const w = index.wallsById.get(id);
    if (w === undefined) continue;
    if (aabbOverlap(wallAABB(w), query)) out.push(w);
  }
  return out;
}

/**
 * True iff any wall in `index` intersects the closed segment from `a` to
 * `b`. Uses the index to narrow candidates, then exact `segIntersect`
 * from fx/geometry. Ordering does not matter (predicate) but candidate
 * enumeration is deterministic anyway.
 */
export function segmentBlocked(
  index: WallIndex,
  a: Vec2,
  b: Vec2,
): boolean {
  const query = segmentAABB(a, b);
  const candidates = queryWalls(index, query);
  for (let i = 0; i < candidates.length; i = i + 1) {
    const w = candidates[i];
    if (w === undefined) continue;
    if (segIntersect(a, b, w.a, w.b)) return true;
  }
  return false;
}

/**
 * Convenience — the negation of `segmentBlocked`. "Has line of sight from
 * `a` to `b`" reads more naturally at call sites (spawn LOS checks in
 * particular).
 */
export function hasLineOfSight(
  index: WallIndex,
  a: Vec2,
  b: Vec2,
): boolean {
  return !segmentBlocked(index, a, b);
}

function wallAABB(w: WallSegment): AABB {
  return segmentAABB(w.a, w.b);
}

function segmentAABB(a: Vec2, b: Vec2): AABB {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const minX = ax <= bx ? ax : bx;
  const maxX = ax >= bx ? ax : bx;
  const minY = ay <= by ? ay : by;
  const maxY = ay >= by ? ay : by;
  return {
    min: { x: minX as Fx, y: minY as Fx },
    max: { x: maxX as Fx, y: maxY as Fx },
  };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    (a.min.x as number) <= (b.max.x as number) &&
    (a.max.x as number) >= (b.min.x as number) &&
    (a.min.y as number) <= (b.max.y as number) &&
    (a.max.y as number) >= (b.min.y as number)
  );
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}
