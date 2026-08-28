/**
 * Fixed-point scalar arithmetic.
 *
 * Fx values are branded 32-bit-scale integers. `1` board unit corresponds to
 * `FX_ONE = 1024` fx units. The engine authoring/test boundary is capped at
 * BOARD_UNIT_MAX = 2048 board units, so any coordinate satisfies
 *   |v| ≤ 2048 · 1024 = 2_097_152 ≈ 2^21.
 *
 * That bound keeps every rule-affecting product inside JS safe integer range
 * (2^53). In particular:
 *   - fxMul intermediate: |a · b| ≤ 2^42, divided by FX_ONE.
 *   - fxDiv intermediate: |a · FX_ONE| ≤ 2^31.
 *   - Cross products in geometry: ≤ 2^44.
 *   - Squared distances: ≤ 2^43 + 2^43 = 2^44.
 * All well below 2^53.
 *
 * Rounding convention across the module is truncation toward zero (`Math.trunc`).
 * `Math.sqrt` is the ONE floating primitive we allow, seeding the exact
 * `isqrt` correction loop. Everything else is integer arithmetic.
 */

declare const fxBrand: unique symbol;

/**
 * Branded integer type; a plain `number` cannot be assigned where `Fx` is
 * required, and vice versa. All Fx values are safe integers.
 */
export type Fx = number & { readonly [fxBrand]: "Fx" };

/** One board unit expressed in fx. Chosen for §3.1 — 10 bits of subunit precision. */
export const FX_ONE: Fx = 1024 as Fx;

export const FX_ZERO: Fx = 0 as Fx;
export const FX_HALF: Fx = 512 as Fx;

/** Maximum coordinate magnitude allowed at the fx boundary. */
export const BOARD_UNIT_MAX = 2048;
export const FX_MAX: Fx = (BOARD_UNIT_MAX * FX_ONE) as Fx;
export const FX_MIN: Fx = (-BOARD_UNIT_MAX * FX_ONE) as Fx;

/**
 * Assert a raw number is safely representable as Fx (integer, inside the
 * board-unit bound). Meant for authoring/test boundaries — never inside a hot
 * loop, per §3.1.
 */
export function assertFx(value: number, label = "value"): asserts value is Fx {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`Fx ${label}: expected a finite integer; got ${value}.`);
  }
  if (value > FX_MAX || value < FX_MIN) {
    throw new RangeError(
      `Fx ${label}: ${value} outside board bound [±${FX_MAX}].`,
    );
  }
}

/**
 * Construct an Fx from an integer board unit count. `fxFromInt(1)` = FX_ONE.
 */
export function fxFromInt(unit: number): Fx {
  if (!Number.isInteger(unit) || Math.abs(unit) > BOARD_UNIT_MAX) {
    throw new RangeError(`fxFromInt: ${unit} outside ±${BOARD_UNIT_MAX} bound.`);
  }
  return (unit * FX_ONE) as Fx;
}

/**
 * Truncate an Fx to whole board units (toward zero).
 */
export function fxToInt(value: Fx): number {
  return Math.trunc((value as number) / FX_ONE);
}

/** Cast an unbranded integer (already inside the fx bound) to Fx. */
export function fxRaw(value: number): Fx {
  return value as Fx;
}

export function fxAdd(a: Fx, b: Fx): Fx {
  return ((a as number) + (b as number)) as Fx;
}

export function fxSub(a: Fx, b: Fx): Fx {
  return ((a as number) - (b as number)) as Fx;
}

export function fxNeg(a: Fx): Fx {
  return -(a as number) as Fx;
}

export function fxAbs(a: Fx): Fx {
  return Math.abs(a as number) as Fx;
}

/**
 * Fixed-point multiplication: (a · b) / FX_ONE, truncated toward zero.
 * With |a|, |b| ≤ FX_MAX, the product |a · b| ≤ 2^42 stays inside safe integer.
 */
export function fxMul(a: Fx, b: Fx): Fx {
  return Math.trunc(((a as number) * (b as number)) / FX_ONE) as Fx;
}

/**
 * Fixed-point division: (a · FX_ONE) / b, truncated toward zero. Throws on
 * a zero denominator so the caller cannot silently absorb an undefined result.
 */
export function fxDiv(a: Fx, b: Fx): Fx {
  if ((b as number) === 0) {
    throw new RangeError("fxDiv: division by zero.");
  }
  return Math.trunc(((a as number) * FX_ONE) / (b as number)) as Fx;
}

export function fxMin(a: Fx, b: Fx): Fx {
  return ((a as number) <= (b as number) ? a : b);
}

export function fxMax(a: Fx, b: Fx): Fx {
  return ((a as number) >= (b as number) ? a : b);
}

export function fxClamp(value: Fx, lo: Fx, hi: Fx): Fx {
  if ((lo as number) > (hi as number)) {
    throw new RangeError(`fxClamp: lo (${lo}) must not exceed hi (${hi}).`);
  }
  return fxMin(fxMax(value, lo), hi);
}

export function fxEq(a: Fx, b: Fx): boolean {
  return (a as number) === (b as number);
}

export function fxLt(a: Fx, b: Fx): boolean {
  return (a as number) < (b as number);
}

export function fxLe(a: Fx, b: Fx): boolean {
  return (a as number) <= (b as number);
}

export function fxGt(a: Fx, b: Fx): boolean {
  return (a as number) > (b as number);
}

export function fxGe(a: Fx, b: Fx): boolean {
  return (a as number) >= (b as number);
}

/**
 * Exact integer square root: floor(sqrt(n)) for n ≥ 0, computed via a
 * `Math.sqrt` seed and a bounded correction loop. `Math.sqrt` is IEEE-754
 * correctly-rounded, so the seed is off by at most one; the loop makes the
 * result exact independent of engine rounding.
 *
 * Domain: [0, 2^53). Values above that need double-precision, which is not our
 * regime — we call this only on squared fx distances ≤ 2^44.
 */
export function isqrt(n: number): number {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new RangeError(`isqrt: expected a non-negative integer; got ${n}.`);
  }
  if (n < 0) {
    throw new RangeError(`isqrt: expected a non-negative integer; got ${n}.`);
  }
  if (n === 0) return 0;
  // Seed from Math.sqrt; correct at most a few steps.
  let x = Math.floor(Math.sqrt(n));
  // Advance upward while (x+1)^2 ≤ n
  while ((x + 1) * (x + 1) <= n) {
    x = x + 1;
  }
  // Retreat while x^2 > n
  while (x * x > n) {
    x = x - 1;
  }
  return x;
}
