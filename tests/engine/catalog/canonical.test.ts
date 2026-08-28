import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  canonicalize,
  fnv1a64Hex,
  loadCatalog,
} from "../../../src/engine/catalog/index";
import {
  cloneValidBundle,
  validMinimalBundle,
} from "../../fixtures/catalog/valid-minimal";

describe("catalog/canonical / canonicalize", () => {
  it("hashes to a stable 16-hex FNV-1a-64 digest", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
  });

  it("emits object keys in lexicographic order", () => {
    const forward = canonicalize({ a: 1, b: 2 });
    const reverse = canonicalize({ b: 2, a: 1 });
    expect(forward).toBe(reverse);
    expect(forward).toBe('{"a":1,"b":2}');
  });

  it("preserves array order (arrays carry meaning)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalize([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalize([3, 1, 2])).not.toBe(canonicalize([1, 2, 3]));
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize(Number.NaN)).toThrow();
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("handles nested structures recursively", () => {
    const nested = { z: [1, { c: "x", a: "y" }], a: 1 };
    const canonical = canonicalize(nested);
    expect(canonical).toBe('{"a":1,"z":[1,{"a":"y","c":"x"}]}');
  });
});

describe("catalog/canonical / hashes are order-independent", () => {
  it("catalog hash does not depend on JSON property insertion order", () => {
    const catalogA = loadCatalog(validMinimalBundle);
    expect(catalogA.ok).toBe(true);
    const hashA = catalogA.ok ? catalogA.value.hashes.catalog : "";

    // Re-serialize the bundle with a stable-but-different key order.
    const scrambled = cloneValidBundle();
    // Shuffle the top-level keys, then within each chassis. JSON.parse + custom
    // rebuild reorders the property insertion order deterministically.
    const scrambledOrdered = reorderKeys(scrambled) as typeof scrambled;
    const catalogB = loadCatalog(scrambledOrdered);
    expect(catalogB.ok).toBe(true);
    const hashB = catalogB.ok ? catalogB.value.hashes.catalog : "";

    expect(hashB).toBe(hashA);
  });

  it("catalog hash changes when a rule-affecting value changes", () => {
    const before = loadCatalog(validMinimalBundle);
    expect(before.ok).toBe(true);
    const beforeHash = before.ok ? before.value.hashes.catalog : "";

    const mutated = cloneValidBundle() as unknown as { chassis: { cost: number }[] };
    mutated.chassis[0]!.cost = 13;
    const after = loadCatalog(mutated as never);
    expect(after.ok).toBe(true);
    const afterHash = after.ok ? after.value.hashes.catalog : "";

    expect(afterHash).not.toBe(beforeHash);
  });

  it("tunables hash is independent of the surrounding catalog", () => {
    const catalogA = loadCatalog(validMinimalBundle);
    expect(catalogA.ok).toBe(true);
    const tunablesHashA = catalogA.ok ? catalogA.value.hashes.tunables : "";

    const mutated = cloneValidBundle() as unknown as { chassis: { cost: number }[] };
    mutated.chassis[0]!.cost = 13; // catalog changes but tunables do not
    const catalogB = loadCatalog(mutated as never);
    expect(catalogB.ok).toBe(true);
    const tunablesHashB = catalogB.ok ? catalogB.value.hashes.tunables : "";

    expect(tunablesHashB).toBe(tunablesHashA);
  });

  it("canonicalHash yields the same digest for two logically equal objects", () => {
    const a = canonicalHash({ x: [1, 2], y: "z" });
    const b = canonicalHash({ y: "z", x: [1, 2] });
    expect(a).toBe(b);
  });
});

/**
 * Recursively reorder object keys so property insertion becomes reverse
 * alphabetic — a canonical hash must ignore this rearrangement.
 */
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).slice().sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = reorderKeys(record[key]);
    }
    return out;
  }
  return value;
}
