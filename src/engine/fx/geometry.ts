import {
  type Fx,
  FX_ZERO,
  fxAdd,
  fxSub,
  fxMax,
  fxMin,
  isqrt,
} from "./scalar";
import { type Vec2, vec2, vecEq } from "./vector";

/**
 * Integer geometry primitives — sign-of-cross-product rules only. Boundary
 * semantics are declared explicitly on every export so consumers can rely on
 * a stated convention rather than debug rounding.
 *
 * All predicates treat segments and polygons as CLOSED sets: endpoints and
 * boundaries count as inside/intersect. Two segments that share only an
 * endpoint intersect. Two collinear segments that overlap on ≥ 1 point
 * intersect. A point on a polygon edge is inside.
 */

/** Signed twice-area of triangle abc; sign gives the orientation of the turn. */
function orient(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = (b.x as number) - (a.x as number);
  const aby = (b.y as number) - (a.y as number);
  const acx = (c.x as number) - (a.x as number);
  const acy = (c.y as number) - (a.y as number);
  return abx * acy - aby * acx;
}

function sign(x: number): -1 | 0 | 1 {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * Point-to-point squared distance in fx² units. Exact integer arithmetic.
 */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = (a.x as number) - (b.x as number);
  const dy = (a.y as number) - (b.y as number);
  return dx * dx + dy * dy;
}

/**
 * True iff `p` lies on the closed segment `ab` (endpoints included).
 * Collinearity is exact (integer cross product == 0); the bounding-box test
 * confines to the segment span.
 */
export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  if (orient(a, b, p) !== 0) return false;
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const px = p.x as number;
  const py = p.y as number;
  const xLo = ax <= bx ? ax : bx;
  const xHi = ax >= bx ? ax : bx;
  const yLo = ay <= by ? ay : by;
  const yHi = ay >= by ? ay : by;
  return px >= xLo && px <= xHi && py >= yLo && py <= yHi;
}

/**
 * True iff closed segment `AB` and closed segment `CD` share at least one
 * point. Handles the three cases in one predicate:
 *   1. Proper crossing (interiors intersect) — signs on both segments differ.
 *   2. Endpoint-on-other-segment — collinear endpoint on the other segment.
 *   3. Collinear overlap — the boundary-check clause covers any pair whose
 *      bounding boxes touch on a common projection axis.
 * A zero-length segment (a == b) is a point; it intersects iff the point lies
 * on the other segment.
 */
export function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  // Zero-length segment fast path.
  if (vecEq(a, b)) return pointOnSegment(a, c, d);
  if (vecEq(c, d)) return pointOnSegment(c, a, b);
  const s1 = sign(orient(a, b, c));
  const s2 = sign(orient(a, b, d));
  const s3 = sign(orient(c, d, a));
  const s4 = sign(orient(c, d, b));
  if (s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0 && s1 !== s2 && s3 !== s4) {
    return true;
  }
  if (s1 === 0 && pointOnSegment(c, a, b)) return true;
  if (s2 === 0 && pointOnSegment(d, a, b)) return true;
  if (s3 === 0 && pointOnSegment(a, c, d)) return true;
  if (s4 === 0 && pointOnSegment(b, c, d)) return true;
  return false;
}

/**
 * True iff `p` is inside the CLOSED polygon (edges and vertices count as
 * inside). Polygon vertices are in order (CW or CCW); at least three vertices
 * required — a fewer-vertex polygon is treated as empty.
 *
 * Boundary is checked exactly by `pointOnSegment`. The interior is checked by
 * horizontal-ray odd-crossing count. Vertex-on-ray ties are resolved by the
 * standard "half-open" edge rule: an edge counts iff exactly one endpoint is
 * strictly above the ray (a.y > p.y XOR b.y > p.y). That yields odd crossings
 * exactly once per edge even at horizontal ray-vertex incidence.
 */
export function pointInPoly(p: Vec2, polygon: readonly Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  // Boundary
  for (let i = 0; i < n; i = i + 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    if (pointOnSegment(p, a, b)) return true;
  }
  // Interior — half-open horizontal ray toward +x.
  let inside = false;
  const px = p.x as number;
  const py = p.y as number;
  for (let i = 0, j = n - 1; i < n; j = i, i = i + 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const ax = a.x as number;
    const ay = a.y as number;
    const bx = b.x as number;
    const by = b.y as number;
    // Half-open rule: count edges where exactly one endpoint is strictly above py.
    const aAbove = ay > py;
    const bAbove = by > py;
    if (aAbove !== bAbove) {
      // Compare x-of-intersection with px without division.
      //   x_int = ax + (py - ay) * (bx - ax) / (by - ay)
      // Rearrange: sign(px - x_int) * sign(by - ay) = sign((px - ax) * (by - ay) - (py - ay) * (bx - ax))
      const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
      const denomSign = by - ay > 0 ? 1 : -1;
      // Ray strictly to the right when (px - x_int) > 0, i.e. cross * denomSign > 0.
      if (cross * denomSign > 0) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * True iff two closed disks overlap, INCLUDING boundary contact.
 * `dist2 ≤ (r1 + r2)²`. Radii are fx values ≥ 0.
 */
export function circleOverlap(c1: Vec2, r1: Fx, c2: Vec2, r2: Fx): boolean {
  const sum = (r1 as number) + (r2 as number);
  if (sum < 0) return false;
  return dist2(c1, c2) <= sum * sum;
}

/**
 * True iff two closed disks contact but do not interpenetrate:
 * `dist2 == (r1 + r2)²`. Exact integer equality.
 */
export function circleContact(c1: Vec2, r1: Fx, c2: Vec2, r2: Fx): boolean {
  const sum = (r1 as number) + (r2 as number);
  if (sum < 0) return false;
  return dist2(c1, c2) === sum * sum;
}

/** A polyline is an ordered list of vertices connected by straight segments. */
export interface Polyline {
  readonly vertices: readonly Vec2[];
}

/**
 * Precomputed lengths for a polyline. `cumulativeLengths[i]` is the arc length
 * from vertex 0 to vertex i. `segmentLengths[i]` is the length of the i-th
 * segment (from vertex i to vertex i+1). `totalLength = cumulativeLengths[n-1]`.
 */
export interface PolylineMeasure {
  readonly segmentLengths: readonly Fx[];
  readonly cumulativeLengths: readonly Fx[];
  readonly totalLength: Fx;
}

/**
 * Compute the per-segment and cumulative fx lengths of a polyline. Empty and
 * single-vertex polylines have totalLength = 0. Zero-length segments
 * contribute 0 (they never generate a divide-by-zero in `polylinePointAt`).
 */
export function measurePolyline(poly: Polyline): PolylineMeasure {
  const { vertices } = poly;
  const n = vertices.length;
  if (n === 0) {
    return { segmentLengths: [], cumulativeLengths: [], totalLength: FX_ZERO };
  }
  const segmentLengths: Fx[] = [];
  const cumulativeLengths: Fx[] = [FX_ZERO];
  let acc: Fx = FX_ZERO;
  for (let i = 0; i + 1 < n; i = i + 1) {
    const a = vertices[i];
    const b = vertices[i + 1];
    if (a === undefined || b === undefined) continue;
    const dx = (b.x as number) - (a.x as number);
    const dy = (b.y as number) - (a.y as number);
    const len = isqrt(dx * dx + dy * dy) as Fx;
    segmentLengths.push(len);
    acc = fxAdd(acc, len);
    cumulativeLengths.push(acc);
  }
  return { segmentLengths, cumulativeLengths, totalLength: acc };
}

/**
 * Return the vertex on the polyline at arc-length `s`, clamped to
 * [0, totalLength]. Interpolation is integer-safe: since the caller-provided
 * `s` and the precomputed segment length are both fx integers, the position
 * along a segment is computed by `Math.trunc((componentDelta * remaining) /
 * segmentLength)` so the result is exact modulo one fx step (the only lossy
 * step, and it lives entirely inside a well-scoped truncation).
 *
 * On an empty polyline this returns the origin; on a single-vertex polyline
 * this returns that vertex.
 */
export function polylinePointAt(
  poly: Polyline,
  measure: PolylineMeasure,
  s: Fx,
): Vec2 {
  const { vertices } = poly;
  const n = vertices.length;
  if (n === 0) {
    return vec2(FX_ZERO, FX_ZERO);
  }
  const first = vertices[0];
  if (first === undefined) return vec2(FX_ZERO, FX_ZERO);
  if (n === 1) return first;
  const clamped = fxMax(FX_ZERO, fxMin(s, measure.totalLength));
  if ((clamped as number) === 0) return first;
  if ((clamped as number) === (measure.totalLength as number)) {
    const last = vertices[n - 1];
    if (last === undefined) return first;
    return last;
  }
  // Find containing segment via linear scan (n is small — polylines are
  // player-authored paths, not procedural strings).
  const { segmentLengths, cumulativeLengths } = measure;
  let index = 0;
  for (let i = 0; i < segmentLengths.length; i = i + 1) {
    const upper = cumulativeLengths[i + 1];
    if (upper === undefined) break;
    if ((clamped as number) <= (upper as number)) {
      index = i;
      break;
    }
  }
  const a = vertices[index];
  const b = vertices[index + 1];
  const segLen = segmentLengths[index];
  const cumBefore = cumulativeLengths[index];
  if (a === undefined || b === undefined || segLen === undefined || cumBefore === undefined) {
    return first;
  }
  if ((segLen as number) === 0) return a;
  const remaining = fxSub(clamped, cumBefore) as number;
  const dx = (b.x as number) - (a.x as number);
  const dy = (b.y as number) - (a.y as number);
  const seg = segLen as number;
  const ix = ((a.x as number) + Math.trunc((dx * remaining) / seg)) as Fx;
  const iy = ((a.y as number) + Math.trunc((dy * remaining) / seg)) as Fx;
  return { x: ix, y: iy };
}
