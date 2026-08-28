/**
 * Pure helpers for movement-plot editing.
 *
 * All engine legality decisions defer to `legalMovePlot`. These helpers
 * shape the pointer stream into a candidate waypoint list.
 */

import type { Fx, Vec2 } from "../../../engine";
import { measurePolyline } from "../../../engine";

/**
 * Add a waypoint to a path. Ignores consecutive duplicates so a stray
 * repeat click doesn't inflate the vertex count.
 */
export function appendWaypoint(path: readonly Vec2[], p: Vec2): readonly Vec2[] {
  const last = path[path.length - 1];
  if (last !== undefined && (last.x as number) === (p.x as number) && (last.y as number) === (p.y as number)) {
    return path;
  }
  return [...path, p];
}

/**
 * Remove the last waypoint (Backspace).
 */
export function dropLastWaypoint(path: readonly Vec2[]): readonly Vec2[] {
  if (path.length === 0) return path;
  return path.slice(0, path.length - 1);
}

/**
 * Freehand-simplification: Ramer–Douglas–Peucker with a tunable
 * epsilon in fx units. Used to compress a dragged mouse trail into a
 * polyline of a few waypoints.
 */
export function simplifyPath(path: readonly Vec2[], epsilonFx: number): readonly Vec2[] {
  if (path.length <= 2) return path;
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  rdp(path, 0, path.length - 1, epsilonFx * epsilonFx, keep);
  const out: Vec2[] = [];
  for (let i = 0; i < path.length; i = i + 1) {
    if (keep[i] === 1) {
      const p = path[i];
      if (p !== undefined) out.push(p);
    }
  }
  return out;
}

function rdp(
  path: readonly Vec2[],
  first: number,
  last: number,
  eps2: number,
  keep: Uint8Array,
): void {
  if (last <= first + 1) return;
  const a = path[first];
  const b = path[last];
  if (a === undefined || b === undefined) return;
  let maxD2 = -1;
  let maxIdx = -1;
  for (let i = first + 1; i < last; i = i + 1) {
    const p = path[i];
    if (p === undefined) continue;
    const d2 = sqDistanceToSegment(p, a, b);
    if (d2 > maxD2) {
      maxD2 = d2;
      maxIdx = i;
    }
  }
  if (maxD2 > eps2 && maxIdx > 0) {
    keep[maxIdx] = 1;
    rdp(path, first, maxIdx, eps2, keep);
    rdp(path, maxIdx, last, eps2, keep);
  }
}

function sqDistanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const px = p.x as number;
  const py = p.y as number;
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

/**
 * Compute the polyline's fx length by delegating to the engine's
 * `measurePolyline` (the same function `legalMovePlot` uses to check
 * the allowance).
 */
export function pathLengthFx(path: readonly Vec2[]): number {
  if (path.length < 2) return 0;
  const m = measurePolyline({ vertices: path });
  return m.totalLength as number;
}

/**
 * Trim the path so its total length does not exceed the allowance. The
 * final vertex is repositioned by linear interpolation along the last
 * segment. Returns an unchanged path if it's already within the
 * allowance or the allowance is >= the polyline's length.
 */
export function clampPathToAllowance(
  path: readonly Vec2[],
  allowanceFx: number,
): readonly Vec2[] {
  if (path.length < 2 || allowanceFx <= 0) return path;
  const first = path[0];
  if (first === undefined) return path;
  let remaining = allowanceFx;
  const out: Vec2[] = [first];
  for (let i = 1; i < path.length; i = i + 1) {
    const a = out[out.length - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    const dx = (b.x as number) - (a.x as number);
    const dy = (b.y as number) - (a.y as number);
    const seg = Math.sqrt(dx * dx + dy * dy);
    if (seg <= remaining) {
      out.push(b);
      remaining = remaining - seg;
      continue;
    }
    // Interpolate the clamp point.
    if (seg <= 0) break;
    const t = remaining / seg;
    const cx = Math.round((a.x as number) + t * dx);
    const cy = Math.round((a.y as number) + t * dy);
    out.push({ x: cx as Fx, y: cy as Fx });
    break;
  }
  return out;
}
