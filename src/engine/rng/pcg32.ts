/**
 * PCG32 (Permuted Congruential Generator, 32-bit output) — O'Neill's minimal
 * variant. State and stream are each 64 bits; we keep both split across a
 * length-4 Uint32-friendly tuple for structural cloneability and the smallest
 * possible cross-runtime footprint.
 *
 * The BigInt arithmetic below is deterministic: BigInt operations in ES2020+
 * are exact integer arithmetic by specification, not floating point, so
 * cross-engine equality is guaranteed.
 */

/** PCG32's canonical multiplier. */
const PCG_MULT: bigint = 6_364_136_223_846_793_005n;

const MASK_64: bigint = 0xffff_ffff_ffff_ffffn;
const MASK_32: bigint = 0xffff_ffffn;

/**
 * Immutable RNG value. The four numbers are:
 *   [0] stateHi — high 32 bits of the 64-bit LCG state.
 *   [1] stateLo — low 32 bits of the 64-bit LCG state.
 *   [2] incHi   — high 32 bits of the 64-bit stream increment.
 *   [3] incLo   — low 32 bits of the 64-bit stream increment. Always odd.
 *
 * `Rng` values are plain, structurally cloneable, and safe to send through
 * postMessage or hash via the canonical serializer.
 */
export interface Rng {
  readonly state: readonly [number, number, number, number];
}

function join64(hi: number, lo: number): bigint {
  return ((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)) & MASK_64;
}

function splitU32(value: bigint): readonly [number, number] {
  const hi = Number((value >> 32n) & MASK_32) >>> 0;
  const lo = Number(value & MASK_32) >>> 0;
  return [hi, lo];
}

/**
 * Rotate a 32-bit value right by `count` bits (count in 0..31).
 */
function rotr32(value: number, count: number): number {
  const c = count & 31;
  const v = value >>> 0;
  if (c === 0) return v;
  return ((v >>> c) | (v << (32 - c))) >>> 0;
}

/**
 * Draw a 32-bit unsigned integer from the RNG and return the successor state
 * alongside it. The classic PCG32 output uses the pre-advance state so that
 * the output permutation can execute in parallel with the LCG advance in
 * hardware; we match the standard reference implementation exactly.
 */
export function nextInt(rng: Rng): readonly [number, Rng] {
  const oldState = join64(rng.state[0], rng.state[1]);
  const inc = join64(rng.state[2], rng.state[3]) | 1n;
  const xor = ((oldState >> 18n) ^ oldState) & MASK_64;
  const xorshifted = Number((xor >> 27n) & MASK_32) >>> 0;
  const rot = Number((oldState >> 59n) & 0x1fn);
  const output = rotr32(xorshifted, rot);
  const nextState = (oldState * PCG_MULT + inc) & MASK_64;
  const [nextHi, nextLo] = splitU32(nextState);
  return [
    output,
    { state: [nextHi, nextLo, rng.state[2], rng.state[3]] },
  ];
}

/**
 * Draw an integer uniformly from [minimum, maximumExclusive). Uses
 * rejection sampling to avoid modulo bias, per Lemire — any uint32 in
 * [0, 2^32 - (2^32 mod range)) maps evenly to the target range, so we
 * reject and redraw otherwise. Deterministic across engines because BigInt
 * modulo is exact.
 */
export function nextRange(
  rng: Rng,
  minimum: number,
  maximumExclusive: number,
): readonly [number, Rng] {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximumExclusive)) {
    throw new RangeError(
      `nextRange: bounds must be integers; got [${minimum}, ${maximumExclusive}).`,
    );
  }
  const range = maximumExclusive - minimum;
  if (range <= 0) {
    throw new RangeError(
      `nextRange: expected minimum < maximumExclusive; got [${minimum}, ${maximumExclusive}).`,
    );
  }
  if (range > 0x1_0000_0000) {
    throw new RangeError(`nextRange: range ${range} exceeds 2^32.`);
  }
  const modR = Number(0x1_0000_0000n % BigInt(range));
  const rejectAt = 0x1_0000_0000 - modR;
  let current = rng;
  // PCG32 acceptance is uniform, so retries are expected under 2 on average.
  // The cap guards against pathological configurations rather than being a
  // practical bound.
  for (let attempt = 0; attempt < 512; attempt = attempt + 1) {
    const [raw, next] = nextInt(current);
    current = next;
    if (raw < rejectAt) {
      return [minimum + (raw % range), current];
    }
  }
  throw new Error(`nextRange: rejection sampling did not converge after 512 attempts (range ${range}).`);
}

/**
 * Pick a uniform element from a non-empty array.
 */
export function pick<T>(rng: Rng, items: readonly T[]): readonly [T, Rng] {
  if (items.length === 0) {
    throw new RangeError("pick: cannot draw from an empty array.");
  }
  const [index, next] = nextRange(rng, 0, items.length);
  const value = items[index] as T;
  return [value, next];
}

/**
 * Deterministic Fisher-Yates shuffle. Returns a fresh array; the input is
 * left untouched. On an empty or single-element array this is a copy.
 */
export function shuffle<T>(
  rng: Rng,
  items: readonly T[],
): readonly [readonly T[], Rng] {
  const out: T[] = items.slice();
  let current = rng;
  for (let i = out.length - 1; i > 0; i = i - 1) {
    const [j, next] = nextRange(current, 0, i + 1);
    current = next;
    const temp = out[i] as T;
    const jVal = out[j] as T;
    out[i] = jVal;
    out[j] = temp;
  }
  return [out, current];
}
