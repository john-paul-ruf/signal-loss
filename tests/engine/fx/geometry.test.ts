import { describe, expect, it } from "vitest";
import { FX_ONE, FX_ZERO, fxFromInt } from "../../../src/engine/fx/scalar";
import { vec2, type Vec2 } from "../../../src/engine/fx/vector";
import {
  circleContact,
  circleOverlap,
  dist2,
  measurePolyline,
  pointInPoly,
  pointOnSegment,
  polylinePointAt,
  segIntersect,
} from "../../../src/engine/fx/geometry";

function v(unitX: number, unitY: number): Vec2 {
  return vec2(fxFromInt(unitX), fxFromInt(unitY));
}

describe("fx/geometry / dist2", () => {
  it("is symmetric and zero at coincidence", () => {
    const a = v(3, 4);
    const b = v(-1, 2);
    expect(dist2(a, b)).toBe(dist2(b, a));
    expect(dist2(a, a)).toBe(0);
  });

  it("is translation invariant", () => {
    const a = v(3, 4);
    const b = v(-1, 2);
    const t = v(7, -5);
    expect(dist2(a, b)).toBe(
      dist2({ x: (a.x as number + (t.x as number)) as never, y: (a.y as number + (t.y as number)) as never },
        { x: (b.x as number + (t.x as number)) as never, y: (b.y as number + (t.y as number)) as never }),
    );
  });
});

describe("fx/geometry / pointOnSegment", () => {
  const a = v(0, 0);
  const b = v(4, 0);

  it("accepts endpoints (closed convention)", () => {
    expect(pointOnSegment(a, a, b)).toBe(true);
    expect(pointOnSegment(b, a, b)).toBe(true);
  });

  it("accepts a midpoint", () => {
    expect(pointOnSegment(v(2, 0), a, b)).toBe(true);
  });

  it("rejects off-line and off-span points", () => {
    expect(pointOnSegment(v(2, 1), a, b)).toBe(false);
    expect(pointOnSegment(v(5, 0), a, b)).toBe(false);
    expect(pointOnSegment(v(-1, 0), a, b)).toBe(false);
  });

  it("handles a zero-length degenerate segment as a point", () => {
    expect(pointOnSegment(a, a, a)).toBe(true);
    expect(pointOnSegment(v(1, 0), a, a)).toBe(false);
  });
});

describe("fx/geometry / segIntersect", () => {
  it("detects proper crossings", () => {
    expect(segIntersect(v(0, 0), v(4, 4), v(0, 4), v(4, 0))).toBe(true);
  });

  it("detects endpoint touches (closed convention)", () => {
    expect(segIntersect(v(0, 0), v(2, 0), v(2, 0), v(2, 2))).toBe(true);
  });

  it("detects collinear overlaps", () => {
    expect(segIntersect(v(0, 0), v(4, 0), v(2, 0), v(6, 0))).toBe(true);
  });

  it("rejects collinear but non-overlapping segments", () => {
    expect(segIntersect(v(0, 0), v(2, 0), v(3, 0), v(5, 0))).toBe(false);
  });

  it("rejects parallel non-collinear segments", () => {
    expect(segIntersect(v(0, 0), v(4, 0), v(0, 1), v(4, 1))).toBe(false);
  });

  it("handles a zero-length segment via point-on-segment", () => {
    expect(segIntersect(v(2, 0), v(2, 0), v(0, 0), v(4, 0))).toBe(true);
    expect(segIntersect(v(2, 1), v(2, 1), v(0, 0), v(4, 0))).toBe(false);
  });

  it("regression: tangent touching at a T-intersection", () => {
    // segment 1 ends exactly on segment 2's midpoint
    expect(segIntersect(v(2, 0), v(2, 2), v(0, 2), v(4, 2))).toBe(true);
  });
});

describe("fx/geometry / pointInPoly", () => {
  const square = [v(0, 0), v(4, 0), v(4, 4), v(0, 4)];

  it("accepts an interior point", () => {
    expect(pointInPoly(v(2, 2), square)).toBe(true);
  });

  it("accepts a boundary point (edge)", () => {
    expect(pointInPoly(v(2, 0), square)).toBe(true);
  });

  it("accepts a vertex", () => {
    expect(pointInPoly(v(0, 0), square)).toBe(true);
    expect(pointInPoly(v(4, 4), square)).toBe(true);
  });

  it("rejects an exterior point", () => {
    expect(pointInPoly(v(5, 5), square)).toBe(false);
    expect(pointInPoly(v(-1, 2), square)).toBe(false);
  });

  it("rejects when the polygon is degenerate", () => {
    expect(pointInPoly(v(0, 0), [])).toBe(false);
    expect(pointInPoly(v(0, 0), [v(0, 0), v(1, 0)])).toBe(false);
  });

  it("handles a concave polygon (L shape)", () => {
    const lshape = [
      v(0, 0),
      v(4, 0),
      v(4, 2),
      v(2, 2),
      v(2, 4),
      v(0, 4),
    ];
    expect(pointInPoly(v(1, 1), lshape)).toBe(true);
    expect(pointInPoly(v(3, 3), lshape)).toBe(false);
    // Concavity boundary
    expect(pointInPoly(v(2, 3), lshape)).toBe(true);
  });

  it("resolves the horizontal-ray vertex-tie via the half-open rule", () => {
    // Ray from (2, 2) toward +x crosses the top vertex of a triangle exactly
    // at its apex; the half-open rule must still yield an odd count for
    // interior points and an even count for exterior ones.
    const triangle = [v(0, 0), v(6, 0), v(3, 4)];
    expect(pointInPoly(v(3, 2), triangle)).toBe(true);
    expect(pointInPoly(v(3, 5), triangle)).toBe(false);
  });
});

describe("fx/geometry / circle overlap and contact", () => {
  it("overlap on distinct concentric disks", () => {
    const c = v(0, 0);
    expect(circleOverlap(c, fxFromInt(2), c, fxFromInt(1))).toBe(true);
  });

  it("boundary contact counts as overlap", () => {
    const a = v(0, 0);
    const b = v(4, 0);
    // dist = 4 board = 4*FX_ONE; r1+r2 = 2+2 board = 4*FX_ONE
    expect(circleOverlap(a, fxFromInt(2), b, fxFromInt(2))).toBe(true);
    expect(circleContact(a, fxFromInt(2), b, fxFromInt(2))).toBe(true);
  });

  it("separation greater than r1+r2 does not overlap", () => {
    const a = v(0, 0);
    const b = v(5, 0);
    expect(circleOverlap(a, fxFromInt(2), b, fxFromInt(2))).toBe(false);
    expect(circleContact(a, fxFromInt(2), b, fxFromInt(2))).toBe(false);
  });

  it("interior contact (dist < r1+r2) is overlap but not contact", () => {
    const a = v(0, 0);
    const b = v(3, 0);
    expect(circleOverlap(a, fxFromInt(2), b, fxFromInt(2))).toBe(true);
    expect(circleContact(a, fxFromInt(2), b, fxFromInt(2))).toBe(false);
  });

  it("rejects negative radius sums", () => {
    const a = v(0, 0);
    const b = v(1, 0);
    // r values are Fx integers; construct a pathological negative for the guard.
    const negOne = -FX_ONE as never;
    expect(circleOverlap(a, negOne, b, negOne)).toBe(false);
    expect(circleContact(a, negOne, b, negOne)).toBe(false);
  });
});

describe("fx/geometry / polyline arc-length", () => {
  it("measures an L-shaped path exactly (integer legs)", () => {
    const poly = { vertices: [v(0, 0), v(3, 0), v(3, 4)] };
    const m = measurePolyline(poly);
    expect(m.segmentLengths.map((f) => f as number)).toEqual([3 * FX_ONE, 4 * FX_ONE]);
    expect(m.totalLength as number).toBe(7 * FX_ONE);
    expect(m.cumulativeLengths.map((f) => f as number)).toEqual([
      0,
      3 * FX_ONE,
      7 * FX_ONE,
    ]);
  });

  it("returns the first vertex at s=0 and the last at s=totalLength", () => {
    const poly = { vertices: [v(0, 0), v(3, 0), v(3, 4)] };
    const m = measurePolyline(poly);
    const start = polylinePointAt(poly, m, FX_ZERO);
    const end = polylinePointAt(poly, m, m.totalLength);
    expect(start).toEqual(v(0, 0));
    expect(end).toEqual(v(3, 4));
  });

  it("returns a point on the first segment at s < first cumulative", () => {
    const poly = { vertices: [v(0, 0), v(4, 0)] };
    const m = measurePolyline(poly);
    // s = 2 board units
    const mid = polylinePointAt(poly, m, (2 * FX_ONE) as never);
    expect(mid).toEqual(v(2, 0));
  });

  it("clamps s below 0 to the first vertex and above totalLength to the last", () => {
    const poly = { vertices: [v(0, 0), v(4, 0)] };
    const m = measurePolyline(poly);
    expect(polylinePointAt(poly, m, (-100) as never)).toEqual(v(0, 0));
    expect(polylinePointAt(poly, m, ((m.totalLength as number) + 100) as never)).toEqual(
      v(4, 0),
    );
  });

  it("regression: zero-length segments do not divide by zero", () => {
    const poly = { vertices: [v(0, 0), v(0, 0), v(4, 0)] };
    const m = measurePolyline(poly);
    expect(m.totalLength as number).toBe(4 * FX_ONE);
    const p = polylinePointAt(poly, m, (2 * FX_ONE) as never);
    expect(p).toEqual(v(2, 0));
  });

  it("empty and single-vertex polylines are well-defined", () => {
    const empty = { vertices: [] };
    const eM = measurePolyline(empty);
    expect(eM.totalLength as number).toBe(0);
    expect(polylinePointAt(empty, eM, FX_ZERO)).toEqual(v(0, 0));

    const single = { vertices: [v(5, 5)] };
    const sM = measurePolyline(single);
    expect(sM.totalLength as number).toBe(0);
    expect(polylinePointAt(single, sM, FX_ZERO)).toEqual(v(5, 5));
  });

  it("is monotonic in s along its arc", () => {
    const poly = { vertices: [v(0, 0), v(6, 0), v(6, 8)] };
    const m = measurePolyline(poly);
    const previous = polylinePointAt(poly, m, FX_ZERO);
    // Sample 10 arc-length steps and require x, then y to be monotonically
    // non-decreasing.
    let prevX = previous.x as number;
    let prevY = previous.y as number;
    for (let i = 1; i <= 10; i = i + 1) {
      const s = Math.trunc(((m.totalLength as number) * i) / 10) as never;
      const p = polylinePointAt(poly, m, s);
      // Along leg 1, y stays 0 and x grows. Along leg 2, x stays 6 and y grows.
      expect(p.x as number).toBeGreaterThanOrEqual(prevX);
      if ((p.x as number) === prevX) {
        expect(p.y as number).toBeGreaterThanOrEqual(prevY);
      }
      prevX = p.x as number;
      prevY = p.y as number;
    }
  });
});
