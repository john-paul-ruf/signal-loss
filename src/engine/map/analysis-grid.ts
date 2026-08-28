import type { Fx, Vec2 } from "../fx/index";
import type { WallSegment } from "./types";

/**
 * Coarse analysis grid — the raster the playability gate reasons over.
 *
 * DECLARATIVE INVARIANT: this grid has NO rule authority. Movement,
 * line-of-sight, damage, and every player-facing mechanic operate on
 * continuous fx geometry (arch §3.6, D-1). The grid is an analysis
 * instrument only, and its resolution is a tunable.
 *
 * A cell is marked "blocked" iff any wall's AABB overlaps the cell —
 * a conservative over-approximation: walls near a cell (< cellSize
 * away) count as cover, which is exactly what FR-11's cover checks
 * want.
 */

/** One cell state: 0 = passable, 1 = blocked/cover. */
export type CellFlag = 0 | 1;

export interface AnalysisGrid {
  readonly cellSize: Fx;
  readonly origin: Vec2;
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
}

/** Compute the AABB of `bounds` and use it to size the grid. */
export function buildAnalysisGrid(
  bounds: readonly Vec2[],
  walls: readonly WallSegment[],
  cellSize: Fx,
): AnalysisGrid {
  const cs = cellSize as number;
  if (!Number.isInteger(cs) || cs <= 0) {
    throw new RangeError(`buildAnalysisGrid: cellSize must be a positive integer; got ${cs}.`);
  }
  const bb = polygonAABB(bounds);
  const origin: Vec2 = bb.min;
  const cols = Math.max(1, Math.ceil((bb.max.x as number - (bb.min.x as number)) / cs));
  const rows = Math.max(1, Math.ceil((bb.max.y as number - (bb.min.y as number)) / cs));
  const blocked = new Uint8Array(cols * rows);
  const minX = bb.min.x as number;
  const minY = bb.min.y as number;
  // Sort walls by id so rasterization order is stable regardless of the
  // caller's array order.
  const sorted = walls.slice().sort((a, b) => a.id - b.id);
  for (let i = 0; i < sorted.length; i = i + 1) {
    const w = sorted[i];
    if (w === undefined) continue;
    const ax = w.a.x as number;
    const ay = w.a.y as number;
    const bx = w.b.x as number;
    const by = w.b.y as number;
    const wMinX = ax <= bx ? ax : bx;
    const wMaxX = ax >= bx ? ax : bx;
    const wMinY = ay <= by ? ay : by;
    const wMaxY = ay >= by ? ay : by;
    const c0 = clamp(Math.floor((wMinX - minX) / cs), 0, cols - 1);
    const c1 = clamp(Math.floor((wMaxX - minX) / cs), 0, cols - 1);
    const r0 = clamp(Math.floor((wMinY - minY) / cs), 0, rows - 1);
    const r1 = clamp(Math.floor((wMaxY - minY) / cs), 0, rows - 1);
    for (let r = r0; r <= r1; r = r + 1) {
      for (let c = c0; c <= c1; c = c + 1) {
        blocked[r * cols + c] = 1;
      }
    }
  }
  return { cellSize, origin, cols, rows, blocked };
}

/**
 * A connected component of passable cells. `cells` is the list of cell
 * indices in ascending order. `area` is the count of cells (multiply by
 * cellSize² for fx² area).
 */
export interface Region {
  readonly id: number;
  readonly cells: readonly number[];
  readonly area: number;
}

/**
 * Label all connected components of passable cells with 4-connectivity.
 * Regions are returned in decreasing order of `area`, then ascending
 * first-cell index — a deterministic total order.
 */
export function labelRegions(grid: AnalysisGrid): readonly Region[] {
  const total = grid.cols * grid.rows;
  const labels = new Int32Array(total);
  for (let i = 0; i < total; i = i + 1) labels[i] = -1;
  const regions: Region[] = [];
  const queue: number[] = [];
  let nextId = 0;
  for (let start = 0; start < total; start = start + 1) {
    if (grid.blocked[start] === 1) continue;
    if (labels[start] !== -1) continue;
    // BFS.
    const cells: number[] = [];
    queue.length = 0;
    queue.push(start);
    labels[start] = nextId;
    while (queue.length > 0) {
      const idx = queue.shift() as number;
      cells.push(idx);
      const col = idx % grid.cols;
      const row = Math.trunc(idx / grid.cols);
      if (col > 0) {
        const n = idx - 1;
        if (grid.blocked[n] === 0 && labels[n] === -1) {
          labels[n] = nextId;
          queue.push(n);
        }
      }
      if (col + 1 < grid.cols) {
        const n = idx + 1;
        if (grid.blocked[n] === 0 && labels[n] === -1) {
          labels[n] = nextId;
          queue.push(n);
        }
      }
      if (row > 0) {
        const n = idx - grid.cols;
        if (grid.blocked[n] === 0 && labels[n] === -1) {
          labels[n] = nextId;
          queue.push(n);
        }
      }
      if (row + 1 < grid.rows) {
        const n = idx + grid.cols;
        if (grid.blocked[n] === 0 && labels[n] === -1) {
          labels[n] = nextId;
          queue.push(n);
        }
      }
    }
    cells.sort((a, b) => a - b);
    regions.push({ id: nextId, cells, area: cells.length });
    nextId = nextId + 1;
  }
  regions.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aFirst = a.cells[0] ?? 0;
    const bFirst = b.cells[0] ?? 0;
    return aFirst - bFirst;
  });
  return regions;
}

/** Cell index containing `p`, or null when `p` is outside the grid. */
export function cellIndexFor(grid: AnalysisGrid, p: Vec2): number | null {
  const cs = grid.cellSize as number;
  const col = Math.floor(((p.x as number) - (grid.origin.x as number)) / cs);
  const row = Math.floor(((p.y as number) - (grid.origin.y as number)) / cs);
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
  return row * grid.cols + col;
}

/**
 * The largest connected component of passable cells (by area).
 * Returns null when the grid has no passable cell.
 */
export function largestRegion(regions: readonly Region[]): Region | null {
  if (regions.length === 0) return null;
  return regions[0] ?? null;
}

/**
 * Count passable cells reachable from `startIndex` under the current
 * grid; used to measure disconnect fractions after temporarily
 * blocking a candidate chokepoint cell.
 *
 * `blockedOverride` is an OR mask applied to `grid.blocked` — the
 * caller uses it to mark the chokepoint under test.
 */
export function reachableCount(
  grid: AnalysisGrid,
  startIndex: number,
  blockedOverride: Uint8Array,
): number {
  if (startIndex < 0 || startIndex >= grid.blocked.length) return 0;
  if (grid.blocked[startIndex] === 1 || blockedOverride[startIndex] === 1) return 0;
  const visited = new Uint8Array(grid.blocked.length);
  const queue: number[] = [startIndex];
  visited[startIndex] = 1;
  let count = 0;
  while (queue.length > 0) {
    const idx = queue.shift() as number;
    count = count + 1;
    const col = idx % grid.cols;
    const row = Math.trunc(idx / grid.cols);
    const neighbors: number[] = [];
    if (col > 0) neighbors.push(idx - 1);
    if (col + 1 < grid.cols) neighbors.push(idx + 1);
    if (row > 0) neighbors.push(idx - grid.cols);
    if (row + 1 < grid.rows) neighbors.push(idx + grid.cols);
    for (let k = 0; k < neighbors.length; k = k + 1) {
      const n = neighbors[k] as number;
      if (visited[n] === 1) continue;
      if (grid.blocked[n] === 1 || blockedOverride[n] === 1) continue;
      visited[n] = 1;
      queue.push(n);
    }
  }
  return count;
}

/** Total passable cell count. */
export function passableCount(grid: AnalysisGrid): number {
  let count = 0;
  for (let i = 0; i < grid.blocked.length; i = i + 1) {
    if (grid.blocked[i] === 0) count = count + 1;
  }
  return count;
}

/**
 * Return the widths of the passable strip through `idx` measured in
 * cell counts: `horizontal` counts open cells to the left and right
 * of `idx` (inclusive) up to the next wall; `vertical` counts
 * up-and-down similarly. Used to identify narrow chokepoints —
 * `min(horizontal, vertical)` is a cell's passage width.
 */
export function passageWidthAt(
  grid: AnalysisGrid,
  idx: number,
): { readonly horizontal: number; readonly vertical: number } {
  if (grid.blocked[idx] === 1) return { horizontal: 0, vertical: 0 };
  const col = idx % grid.cols;
  const row = Math.trunc(idx / grid.cols);
  let h = 1;
  for (let c = col - 1; c >= 0; c = c - 1) {
    if (grid.blocked[row * grid.cols + c] === 1) break;
    h = h + 1;
  }
  for (let c = col + 1; c < grid.cols; c = c + 1) {
    if (grid.blocked[row * grid.cols + c] === 1) break;
    h = h + 1;
  }
  let v = 1;
  for (let r = row - 1; r >= 0; r = r - 1) {
    if (grid.blocked[r * grid.cols + col] === 1) break;
    v = v + 1;
  }
  for (let r = row + 1; r < grid.rows; r = r + 1) {
    if (grid.blocked[r * grid.cols + col] === 1) break;
    v = v + 1;
  }
  return { horizontal: h, vertical: v };
}

/** Default analysis-grid cell size — half a construct footprint. */
export function defaultCellSize(constructFootprint: Fx): Fx {
  const cs = Math.trunc((constructFootprint as number) / 2);
  return (cs > 0 ? cs : (constructFootprint as number)) as Fx;
}

function polygonAABB(polygon: readonly Vec2[]): { readonly min: Vec2; readonly max: Vec2 } {
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
  };
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Exported for the gate to compute quadrant covers. */
export function quadrantForCell(
  grid: AnalysisGrid,
  idx: number,
): 0 | 1 | 2 | 3 {
  const col = idx % grid.cols;
  const row = Math.trunc(idx / grid.cols);
  const midCol = Math.trunc(grid.cols / 2);
  const midRow = Math.trunc(grid.rows / 2);
  const right = col >= midCol;
  const top = row >= midRow;
  if (!right && !top) return 0;
  if (right && !top) return 1;
  if (right && top) return 2;
  return 3;
}

