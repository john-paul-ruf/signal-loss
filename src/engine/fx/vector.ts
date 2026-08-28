import {
  type Fx,
  FX_ONE,
  FX_ZERO,
  assertFx,
  fxAdd,
  fxMul,
  fxSub,
  isqrt,
} from "./scalar";

/**
 * Two-dimensional fixed-point vector. Structurally cloneable — no methods, no
 * class identity, no functions on the value. Every operation is a free
 * function so vectors round-trip through postMessage and canonical hashing
 * without ceremony.
 */
export interface Vec2 {
  readonly x: Fx;
  readonly y: Fx;
}

/** Constructor with authoring-boundary bounds check. */
export function vec2(x: Fx, y: Fx): Vec2 {
  assertFx(x as number, "vec2.x");
  assertFx(y as number, "vec2.y");
  return { x, y };
}

/** Origin (0, 0). */
export const V_ZERO: Vec2 = { x: FX_ZERO, y: FX_ZERO };

export function vecEq(a: Vec2, b: Vec2): boolean {
  return (a.x as number) === (b.x as number) && (a.y as number) === (b.y as number);
}

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: fxAdd(a.x, b.x), y: fxAdd(a.y, b.y) };
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: fxSub(a.x, b.x), y: fxSub(a.y, b.y) };
}

export function vecNeg(a: Vec2): Vec2 {
  return { x: -(a.x as number) as Fx, y: -(a.y as number) as Fx };
}

/**
 * Scale by an fx scalar: (a · s) / FX_ONE, truncated toward zero per fxMul.
 * Useful when the scalar has fractional board-unit meaning.
 */
export function vecScale(a: Vec2, s: Fx): Vec2 {
  return { x: fxMul(a.x, s), y: fxMul(a.y, s) };
}

/**
 * Dot product in Fx (`(ax·bx + ay·by) / FX_ONE`). Values with |x|, |y| ≤ FX_MAX
 * keep the intermediate below 2^43 (safe).
 */
export function vecDot(a: Vec2, b: Vec2): Fx {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  return Math.trunc((ax * bx + ay * by) / FX_ONE) as Fx;
}

/**
 * Scalar cross product (z of the 3-D cross). Returns a plain integer, not Fx:
 * cross values are used almost exclusively as sign discriminants inside
 * geometry, and un-scaled precision is exact by construction.
 */
export function vecCross(a: Vec2, b: Vec2): number {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  return ax * by - ay * bx;
}

/**
 * Squared length in Fx^2 units, i.e. a plain integer count of fx-squared. This
 * is exact — no division, no truncation — and is preferred over `vecLen` in
 * comparisons and rule paths (§3.1).
 */
export function vecLen2(a: Vec2): number {
  const ax = a.x as number;
  const ay = a.y as number;
  return ax * ax + ay * ay;
}

/**
 * Exact fx length: isqrt(vecLen2(a)). Reserved for places where a true length
 * is required — polyline arc length vs movement allowance and the design.md
 * measuring rule.
 */
export function vecLen(a: Vec2): Fx {
  return isqrt(vecLen2(a)) as Fx;
}
