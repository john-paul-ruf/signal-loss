import { type Rng } from "./pcg32";

/**
 * FNV-1a 64-bit hash. Deterministic across engines (BigInt arithmetic) and
 * order-sensitive so that seed and label strings distinguish reliably. UTF-8
 * encoding of the input is done inline so `TextEncoder` availability is not
 * a cross-runtime concern (Node ≥ 22 and every supported browser ship it).
 */
const FNV_OFFSET_64: bigint = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME_64: bigint = 0x0000_0100_0000_01b3n;
const MASK_64: bigint = 0xffff_ffff_ffff_ffffn;
const MASK_32: bigint = 0xffff_ffffn;

interface Hash64 {
  readonly hi: number;
  readonly lo: number;
}

const utf8 = new TextEncoder();

/**
 * FNV-1a 64-bit over the UTF-8 encoding of `input`.
 */
export function fnv1a64(input: string): Hash64 {
  const bytes = utf8.encode(input);
  let hash = FNV_OFFSET_64;
  for (let i = 0; i < bytes.length; i = i + 1) {
    const byte = bytes[i] as number;
    hash = (hash ^ BigInt(byte)) & MASK_64;
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  const hi = Number((hash >> 32n) & MASK_32) >>> 0;
  const lo = Number(hash & MASK_32) >>> 0;
  return { hi, lo };
}

/**
 * Seed an Rng from a human-visible string. Uses two disjoint FNV-1a-64
 * digests — one for the LCG state, one for the stream increment — so any
 * two distinct seeds map to independent state/inc pairs. Unicode-safe: two
 * seeds that render identically but differ in bytes hash differently.
 *
 * The stream increment's low bit is forced on (PCG32 requires an odd inc).
 */
export function rngFromSeed(seed: string): Rng {
  const stateHash = fnv1a64(`${seed}\x00state`);
  const incHash = fnv1a64(`${seed}\x00inc`);
  return {
    state: [
      stateHash.hi,
      stateHash.lo,
      incHash.hi,
      (incHash.lo | 1) >>> 0,
    ],
  };
}

/**
 * Derive an independent RNG stream from a root RNG and a stable string label.
 * The returned stream depends ONLY on the root's initial state and the label:
 * it does not observe how many draws (if any) have been taken from the root
 * or from any other stream. This is the property that lets us add a
 * `nextInt()` call in map generation without moving `stream(root, "ai.squad3")`
 * — the two streams are structurally independent.
 *
 * Independence is achieved by XOR-mixing the label hash into the root's
 * state and increment. The label hash is deterministic and the XOR is total,
 * so two distinct labels always produce two distinct streams.
 */
export function stream(root: Rng, label: string): Rng {
  const labelHash = fnv1a64(label);
  const streamHi = (root.state[0] ^ labelHash.hi) >>> 0;
  const streamLo = (root.state[1] ^ labelHash.lo) >>> 0;
  const incHi = (root.state[2] ^ labelHash.lo) >>> 0;
  const incLo = ((root.state[3] ^ labelHash.hi) | 1) >>> 0;
  return { state: [streamHi, streamLo, incHi, incLo] };
}
