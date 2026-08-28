# M03 — Fixed-point math

> **Path:** `./src/engine/fx/`
> **Imports from:** —
> **Status:** planned for full v1

## Public API
- Fx branded integer and FX_ONE = 1024
- Integer vector and scalar arithmetic
- isqrt, squared distance, segment intersection, point-in-polygon, and circle overlap

## Internal Structure

| Area | Path |
|---|---|
| Scalar | `./src/engine/fx/scalar.ts` |
| Vector | `./src/engine/fx/vector.ts` |
| Geometry | `./src/engine/fx/geometry.ts` |
| Facade | `./src/engine/fx/index.ts` |

## Conventions and Invariants
- Keep all rule-affecting geometry within Number safe-integer bounds.
- Use integer cross products and squared distances; division rounds explicitly.
- Math.sqrt is allowed only inside corrected isqrt.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-01 -->

## M03 — Fixed-point math

Public API (`./src/engine/fx/index.ts`):

```ts
type Fx = number & { readonly [fxBrand]: "Fx" };
const FX_ONE: Fx;   // 1024
const FX_ZERO: Fx;
const FX_HALF: Fx;  // 512
const FX_MIN: Fx;   // -BOARD_UNIT_MAX * FX_ONE
const FX_MAX: Fx;   //  BOARD_UNIT_MAX * FX_ONE
const BOARD_UNIT_MAX: number; // 2048

function assertFx(v: number, label?: string): asserts v is Fx;
function fxFromInt(unit: number): Fx;
function fxToInt(v: Fx): number; // truncate toward zero
function fxRaw(v: number): Fx;

function fxAdd/Sub/Neg/Abs/Mul/Div/Min/Max/Clamp(...): Fx;
function fxEq/Lt/Le/Gt/Ge(a: Fx, b: Fx): boolean;

// Exact integer sqrt via Math.sqrt seed + correction loop.
function isqrt(n: number): number;

interface Vec2 { readonly x: Fx; readonly y: Fx; }
const V_ZERO: Vec2;
function vec2(x: Fx, y: Fx): Vec2;
function vecEq/Add/Sub/Neg/Scale(...): Vec2;
function vecDot(a: Vec2, b: Vec2): Fx;
function vecCross(a: Vec2, b: Vec2): number; // integer, not Fx
function vecLen2(a: Vec2): number;           // integer fx²
function vecLen(a: Vec2): Fx;

interface Polyline { readonly vertices: readonly Vec2[]; }
interface PolylineMeasure {
  readonly segmentLengths: readonly Fx[];
  readonly cumulativeLengths: readonly Fx[];
  readonly totalLength: Fx;
}
function dist2(a: Vec2, b: Vec2): number;
function pointOnSegment(p: Vec2, a: Vec2, b: Vec2): boolean;   // closed
function segIntersect(a, b, c, d: Vec2): boolean;              // closed
function pointInPoly(p: Vec2, polygon: readonly Vec2[]): boolean; // closed, half-open ray
function circleOverlap(c1, r1, c2, r2): boolean;               // ≤
function circleContact(c1, r1, c2, r2): boolean;               // ==
function measurePolyline(poly: Polyline): PolylineMeasure;
function polylinePointAt(poly: Polyline, m: PolylineMeasure, s: Fx): Vec2;
```

Conventions in effect:

- **Rounding**: all fx division truncates toward zero (`Math.trunc`).
- **Boundary semantics**: segments, polygons, and disks are CLOSED. Touching
  endpoints intersect. Points on a polygon edge are inside. Boundary
  contact of disks is overlap.
- **Point-in-polygon** uses a half-open horizontal ray + prior boundary
  test; polygon vertices exactly on the ray count once, not zero and not
  twice.
- **Polyline sampling** clamps `s` to `[0, totalLength]`. Zero-length
  segments do not divide by zero. Interpolation is
  `Math.trunc((componentDelta * remaining) / segmentLength)` — one
  well-scoped truncation per component.

Safe-integer bound: |v| ≤ 2^21 fx → squared distances ≤ 2^44, cross
products ≤ 2^44, both inside 2^53.

