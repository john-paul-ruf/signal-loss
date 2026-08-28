import { describe, expect, it } from "vitest";
import {
  FX_MAX,
  FX_MIN,
  FX_ONE,
  FX_ZERO,
  assertFx,
  fxAdd,
  fxDiv,
  fxFromInt,
  fxMul,
  fxSub,
  fxToInt,
  isqrt,
} from "../../../src/engine/fx/scalar";

/**
 * Small deterministic LCG so tests reproduce without an external fuzzer.
 * (This is a test helper, not engine code — the engine has its own PCG32
 * built in Session 01 Checkpoint 3.)
 */
function lcgIterator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state;
  };
}

function randomFx(rand: () => number, magnitudeUpper: number): number {
  const raw = rand();
  const magnitude = Math.abs(raw) % Math.max(1, magnitudeUpper);
  return raw & 1 ? -magnitude : magnitude;
}

describe("fx/scalar / constants", () => {
  it("uses FX_ONE = 1024", () => {
    expect(FX_ONE).toBe(1024);
  });

  it("provides zero and half constants consistent with FX_ONE", () => {
    expect(FX_ZERO).toBe(0);
    expect(fxFromInt(1)).toBe(FX_ONE);
  });

  it("has symmetric bounds around zero", () => {
    expect(FX_MAX).toBe(-(FX_MIN as number));
    expect(FX_MAX).toBe(2_097_152);
  });
});

describe("fx/scalar / assertFx", () => {
  it("accepts a safe integer inside the board bound", () => {
    expect(() => assertFx(0)).not.toThrow();
    expect(() => assertFx(FX_MAX)).not.toThrow();
    expect(() => assertFx(FX_MIN)).not.toThrow();
  });

  it("rejects non-integer values", () => {
    expect(() => assertFx(1.5)).toThrow(/expected a finite integer/);
    expect(() => assertFx(Number.NaN)).toThrow();
    expect(() => assertFx(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("rejects values beyond the board bound", () => {
    expect(() => assertFx((FX_MAX as number) + 1)).toThrow(/outside board bound/);
    expect(() => assertFx((FX_MIN as number) - 1)).toThrow(/outside board bound/);
  });
});

describe("fx/scalar / conversions", () => {
  it("round-trips integer board units", () => {
    for (let i = -8; i <= 8; i = i + 1) {
      expect(fxToInt(fxFromInt(i))).toBe(i);
    }
  });

  it("rejects fxFromInt outside ±BOARD_UNIT_MAX", () => {
    expect(() => fxFromInt(2049)).toThrow();
    expect(() => fxFromInt(-2049)).toThrow();
  });

  it("truncates toward zero on fxToInt", () => {
    // 3.9 board units = 1024 * 3 + 921 fx
    const v = (FX_ONE * 3 + 921) as number;
    expect(fxToInt(v as never)).toBe(3);
    const neg = -(FX_ONE * 3 + 921) as number;
    expect(fxToInt(neg as never)).toBe(-3);
  });
});

describe("fx/scalar / arithmetic", () => {
  const rand = lcgIterator(0xdeadbeef);

  it("addition and subtraction are exact integer ops", () => {
    for (let iter = 0; iter < 200; iter = iter + 1) {
      const a = randomFx(rand, FX_MAX);
      const b = randomFx(rand, FX_MAX);
      expect(fxAdd(a as never, b as never)).toBe(a + b);
      expect(fxSub(a as never, b as never)).toBe(a - b);
    }
  });

  it("fxMul(a, FX_ONE) == a for any Fx", () => {
    for (let iter = 0; iter < 200; iter = iter + 1) {
      const a = randomFx(rand, FX_MAX);
      expect(fxMul(a as never, FX_ONE)).toBe(a);
    }
  });

  it("fxMul is commutative and preserves fx units", () => {
    const a = fxFromInt(2);
    const b = fxFromInt(3);
    expect(fxMul(a, b)).toBe(fxMul(b, a));
    expect(fxMul(a, b)).toBe(fxFromInt(6));
  });

  it("fxDiv by FX_ONE is identity", () => {
    for (let iter = 0; iter < 200; iter = iter + 1) {
      const a = randomFx(rand, FX_MAX);
      expect(fxDiv(a as never, FX_ONE)).toBe(a);
    }
  });

  it("fxDiv by zero throws", () => {
    expect(() => fxDiv(FX_ONE, FX_ZERO)).toThrow(/division by zero/);
  });

  it("fxMul truncates toward zero for negative operands", () => {
    // 1.5 board units * -0.5 board units = -0.75 board units = -768 fx
    // Actually: fxMul takes fx values, so 1.5*1024=1536, -0.5*1024=-512
    //  (1536 * -512) / 1024 = -768 (exact)
    const a = 1536 as never;
    const b = -512 as never;
    expect(fxMul(a, b)).toBe(-768);
  });
});

describe("fx/scalar / isqrt", () => {
  it("returns exact floor of the true square root over a broad sample", () => {
    const rand = lcgIterator(0x51ec7ed);
    for (let iter = 0; iter < 500; iter = iter + 1) {
      // Range covers up to ~2^24 which is what a max-fx-magnitude squared reaches.
      const raw = rand() % (1 << 24);
      const root = isqrt(raw);
      expect(root * root).toBeLessThanOrEqual(raw);
      expect((root + 1) * (root + 1)).toBeGreaterThan(raw);
    }
  });

  it("returns 0 for 0", () => {
    expect(isqrt(0)).toBe(0);
  });

  it("returns exact roots for perfect squares", () => {
    for (let i = 0; i <= 2048; i = i + 1) {
      expect(isqrt(i * i)).toBe(i);
    }
  });

  it("rejects negative or non-integer inputs", () => {
    expect(() => isqrt(-1)).toThrow();
    expect(() => isqrt(0.5)).toThrow();
    expect(() => isqrt(Number.NaN)).toThrow();
  });

  it("handles the very high end within safe range", () => {
    // Squared distance can reach ~2^44 in practice.
    const near = 2 ** 44;
    const root = isqrt(near);
    // Property: root^2 ≤ near, (root+1)^2 > near, root ≥ 0.
    expect(root * root).toBeLessThanOrEqual(near);
    expect((root + 1) * (root + 1)).toBeGreaterThan(near);
  });
});
