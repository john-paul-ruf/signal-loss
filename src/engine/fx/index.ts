/**
 * Public facade for the fixed-point engine module. Consumers import from here;
 * internals (`scalar.ts`, `vector.ts`, `geometry.ts`) are not part of the
 * engine boundary contract.
 */

export {
  type Fx,
  FX_ONE,
  FX_ZERO,
  FX_HALF,
  FX_MIN,
  FX_MAX,
  BOARD_UNIT_MAX,
  assertFx,
  fxFromInt,
  fxToInt,
  fxRaw,
  fxAdd,
  fxSub,
  fxNeg,
  fxAbs,
  fxMul,
  fxDiv,
  fxMin,
  fxMax,
  fxClamp,
  fxEq,
  fxLt,
  fxLe,
  fxGt,
  fxGe,
  isqrt,
} from "./scalar";

export {
  type Vec2,
  V_ZERO,
  vec2,
  vecEq,
  vecAdd,
  vecSub,
  vecNeg,
  vecScale,
  vecDot,
  vecCross,
  vecLen2,
  vecLen,
} from "./vector";

export {
  type Polyline,
  type PolylineMeasure,
  dist2,
  pointOnSegment,
  segIntersect,
  pointInPoly,
  circleOverlap,
  circleContact,
  measurePolyline,
  polylinePointAt,
} from "./geometry";
