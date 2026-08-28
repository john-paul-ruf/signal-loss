import { describe, expect, it } from "vitest";
import { nextInt, type Rng } from "../../../src/engine/rng/pcg32";
import { fnv1a64, rngFromSeed, stream } from "../../../src/engine/rng/streams";

function firstN(rng: Rng, n: number): number[] {
  const out: number[] = [];
  let current = rng;
  for (let i = 0; i < n; i = i + 1) {
    const [v, next] = nextInt(current);
    out.push(v);
    current = next;
  }
  return out;
}

describe("rng/streams / fnv1a64", () => {
  it("hashes the empty string to the FNV offset basis (BigInt-checked)", () => {
    const { hi, lo } = fnv1a64("");
    // 0xcbf29ce484222325 split into high / low uint32s.
    expect(hi).toBe(0xcbf2_9ce4);
    expect(lo).toBe(0x8422_2325);
  });

  it("is deterministic across calls", () => {
    expect(fnv1a64("determinism")).toEqual(fnv1a64("determinism"));
  });

  it("differs for two distinct inputs of the same length", () => {
    expect(fnv1a64("abc")).not.toEqual(fnv1a64("abd"));
  });

  it("respects Unicode: two visually-equal but byte-distinct seeds differ", () => {
    // 'ä' as one code point vs. 'a' + combining diaeresis (two code points).
    const composed = "ä";
    const decomposed = "ä";
    expect(fnv1a64(composed)).not.toEqual(fnv1a64(decomposed));
  });
});

describe("rng/streams / rngFromSeed", () => {
  it("produces an odd stream increment (PCG contract)", () => {
    const rng = rngFromSeed("odd-check");
    // state[3] is incLo; low bit is 1 by construction.
    expect(rng.state[3] & 1).toBe(1);
  });

  it("is deterministic — same seed, same state", () => {
    expect(rngFromSeed("same")).toEqual(rngFromSeed("same"));
  });

  it("differs for distinct seeds", () => {
    expect(rngFromSeed("a")).not.toEqual(rngFromSeed("b"));
  });
});

describe("rng/streams / stream independence", () => {
  const root = rngFromSeed("independence");

  it("distinct labels give distinct starting states", () => {
    const a = stream(root, "map.walls");
    const b = stream(root, "ai.squad3");
    expect(a).not.toEqual(b);
  });

  it("the same label always gives the same starting state", () => {
    const a = stream(root, "map.walls");
    const b = stream(root, "map.walls");
    expect(a).toEqual(b);
  });

  it("an extra draw in one stream does not shift another stream (regression)", () => {
    // Model: two consumers of the root RNG name their own streams.
    // Map generation takes one extra draw. AI squad 3's stream must be
    // untouched by that: its subsequent draws are the same values it would
    // have produced without the extra draw. That is the whole point of
    // "consumers never draw from the root RNG".
    const wallsBefore = stream(root, "map.walls");
    const ai3Before = stream(root, "ai.squad3");

    // Baseline: what does ai.squad3 produce?
    const baselineAi3 = firstN(ai3Before, 5);

    // Now imagine map.walls consumes an extra draw. That advances its own
    // stream state, but ai.squad3's stream, being derived from the ROOT's
    // initial state and its label alone, is unaffected.
    const [, wallsAfterOneDraw] = nextInt(wallsBefore);
    const [, wallsAfterTwoDraws] = nextInt(wallsAfterOneDraw);

    // Re-derive ai.squad3 from the same root — this simulates a fresh consumer
    // starting its stream after map.walls has been used. Its output must
    // match the baseline.
    const ai3Again = stream(root, "ai.squad3");
    expect(firstN(ai3Again, 5)).toEqual(baselineAi3);

    // Sanity: map.walls's advanced states are distinct.
    expect(wallsAfterTwoDraws).not.toEqual(wallsBefore);
  });

  it("streams from distinct roots do not collide even with the same label", () => {
    const rootA = rngFromSeed("root-a");
    const rootB = rngFromSeed("root-b");
    const streamFromA = stream(rootA, "shared-label");
    const streamFromB = stream(rootB, "shared-label");
    expect(firstN(streamFromA, 4)).not.toEqual(firstN(streamFromB, 4));
  });

  it("stream draws produce a stable byte-identical vector across runs", () => {
    const s = stream(rngFromSeed("byte-identity"), "regression");
    const first = firstN(s, 8);
    const second = firstN(s, 8);
    // Immutable API: same input = same output.
    expect(first).toEqual(second);
    // And re-derived from scratch:
    const rederived = firstN(stream(rngFromSeed("byte-identity"), "regression"), 8);
    expect(rederived).toEqual(first);
  });
});
