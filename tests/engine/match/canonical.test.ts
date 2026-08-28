import { describe, expect, it } from "vitest";
import {
  canonicalize,
  canonicalStateString,
  fnv1a64Hex,
  hashState,
} from "../../../src/engine/match/index";
import { makeDeployedSoloMatch } from "../../fixtures/matches/simple-match";

describe("match/canonical / canonicalize", () => {
  it("emits object keys in lexicographic order", () => {
    expect(canonicalize({ b: 1, a: 2, c: 3 })).toBe(`{"a":2,"b":1,"c":3}`);
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe(`[3,1,2]`);
  });

  it("rejects non-integer numbers", () => {
    expect(() => canonicalize(3.14)).toThrow(/non-integer/);
  });

  it("rejects Infinity and NaN", () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/);
    expect(() => canonicalize(NaN)).toThrow(/non-finite/);
  });

  it("rejects Map and Set", () => {
    expect(() => canonicalize(new Map())).toThrow(/Map\/Set/);
    expect(() => canonicalize(new Set())).toThrow(/Map\/Set/);
  });

  it("rejects functions and symbols and bigints", () => {
    expect(() => canonicalize(() => 0)).toThrow(/function/);
    expect(() => canonicalize(Symbol("x"))).toThrow(/symbol/);
    expect(() => canonicalize(1n)).toThrow(/bigint/);
  });
});

describe("match/canonical / hashState", () => {
  it("is stable across two structuredClones of the same state", () => {
    const state = makeDeployedSoloMatch();
    const cloneA = structuredClone(state);
    const cloneB = structuredClone(state);
    expect(hashState(cloneA)).toBe(hashState(cloneB));
    expect(hashState(cloneA)).toBe(hashState(state));
  });

  it("changes when a squad's pool changes", () => {
    const state = makeDeployedSoloMatch();
    const mutated = {
      ...state,
      squads: state.squads.map((s, i) => (i === 0 ? { ...s, poolTotal: 5 } : s)) as unknown as typeof state.squads,
    };
    expect(hashState(state)).not.toBe(hashState(mutated));
  });

  it("changes when phase changes", () => {
    const state = makeDeployedSoloMatch();
    const mutated = { ...state, phase: "ATTACK_PLOT" as const };
    expect(hashState(state)).not.toBe(hashState(mutated));
  });

  it("produces a 16-char lowercase hex digest", () => {
    const state = makeDeployedSoloMatch();
    const h = hashState(state);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("match/canonical / fnv1a64Hex", () => {
  it("matches a known digest", () => {
    // Canonical FNV-1a-64 test vector.
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
  });

  it("differs for any two distinct inputs", () => {
    expect(fnv1a64Hex("a")).not.toBe(fnv1a64Hex("b"));
  });
});

describe("match/canonical / canonicalStateString", () => {
  it("is deterministic across identical inputs", () => {
    const state = makeDeployedSoloMatch();
    expect(canonicalStateString(state)).toBe(canonicalStateString(structuredClone(state)));
  });
});
