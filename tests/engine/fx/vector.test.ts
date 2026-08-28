import { describe, expect, it } from "vitest";
import { FX_ONE, fxFromInt, isqrt } from "../../../src/engine/fx/scalar";
import {
  V_ZERO,
  vec2,
  vecAdd,
  vecCross,
  vecDot,
  vecEq,
  vecLen,
  vecLen2,
  vecNeg,
  vecScale,
  vecSub,
} from "../../../src/engine/fx/vector";

function fx(unit: number) {
  return fxFromInt(unit);
}

function v(unitX: number, unitY: number) {
  return vec2(fx(unitX), fx(unitY));
}

describe("fx/vector / equality and construction", () => {
  it("V_ZERO is the origin", () => {
    expect(vecEq(V_ZERO, v(0, 0))).toBe(true);
  });

  it("vec2 rejects out-of-bound coordinates", () => {
    expect(() => vec2(FX_ONE, fx(2049))).toThrow();
  });
});

describe("fx/vector / add and sub", () => {
  it("obeys the commutative and inverse laws", () => {
    const a = v(3, -4);
    const b = v(-1, 7);
    expect(vecEq(vecAdd(a, b), vecAdd(b, a))).toBe(true);
    expect(vecEq(vecSub(a, a), V_ZERO)).toBe(true);
    expect(vecEq(vecAdd(a, vecNeg(a)), V_ZERO)).toBe(true);
  });
});

describe("fx/vector / scale, dot, cross", () => {
  it("vecScale by FX_ONE is identity", () => {
    const a = v(2, -3);
    expect(vecEq(vecScale(a, FX_ONE), a)).toBe(true);
  });

  it("vecScale by 2·FX_ONE doubles both components", () => {
    const a = v(3, 5);
    const doubled = vecScale(a, (FX_ONE * 2) as never);
    expect(vecEq(doubled, v(6, 10))).toBe(true);
  });

  it("dot is symmetric", () => {
    const a = v(2, 3);
    const b = v(-1, 4);
    expect(vecDot(a, b)).toBe(vecDot(b, a));
  });

  it("dot of perpendicular vectors is zero", () => {
    const a = v(3, 0);
    const b = v(0, 5);
    expect(vecDot(a, b)).toBe(0);
  });

  it("cross of parallel vectors is zero", () => {
    const a = v(2, 4);
    const b = v(1, 2);
    expect(vecCross(a, b)).toBe(0);
  });

  it("cross is antisymmetric", () => {
    const a = v(2, 3);
    const b = v(-1, 5);
    expect(vecCross(a, b)).toBe(-vecCross(b, a));
  });
});

describe("fx/vector / length", () => {
  it("|(3,4)| = 5 exactly", () => {
    const a = v(3, 4);
    // vecLen2 is in fx²; length is fx integer. Board units:
    //   |(3,4) board| = 5 board = 5 * FX_ONE fx.
    // Since components are integer board units, vecLen returns 5*FX_ONE exactly.
    expect(vecLen(a) as number).toBe(5 * FX_ONE);
    expect(vecLen2(a)).toBe((3 * FX_ONE) * (3 * FX_ONE) + (4 * FX_ONE) * (4 * FX_ONE));
  });

  it("vecLen matches isqrt(vecLen2)", () => {
    const a = v(6, 8);
    expect(vecLen(a) as number).toBe(isqrt(vecLen2(a)));
  });

  it("length of a zero vector is zero", () => {
    expect(vecLen(V_ZERO) as number).toBe(0);
    expect(vecLen2(V_ZERO)).toBe(0);
  });

  it("length is translation invariant", () => {
    const a = v(3, 4);
    const b = v(-1, 2);
    // |a| == |(a+b) - b|
    expect(vecLen(a) as number).toBe(vecLen(vecSub(vecAdd(a, b), b)) as number);
  });
});
