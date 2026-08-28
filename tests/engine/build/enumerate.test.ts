import { describe, expect, it } from "vitest";
import type { Catalog } from "../../../src/engine/catalog/index";
import { loadCatalog } from "../../../src/engine/catalog/index";
import {
  chassisFamilyReach,
  constructCost,
  enumerateConstructs,
  enumerateConstructsForChassis,
  enumerateConstructsUnderCost,
  validateConstruct,
  type Construct,
} from "../../../src/engine/build/index";
import { validMinimalBundle } from "../../fixtures/catalog/valid-minimal";

function catalog(): Catalog {
  const r = loadCatalog(validMinimalBundle);
  if (!r.ok) throw new Error("fixture load failed");
  return r.value;
}

/** Materialize an iterator into an array (for enumeration tests). */
function collect<T>(gen: Generator<T, void, void>, limit = 10_000): T[] {
  const out: T[] = [];
  let i = 0;
  for (const v of gen) {
    out.push(v);
    if (++i >= limit) break;
  }
  return out;
}

describe("build/enumerate / per-chassis enumeration", () => {
  const cat = catalog();

  it("yields the empty-mounts construct first for stable code order", () => {
    const it = enumerateConstructsForChassis(cat, 10 as never);
    const first = it.next();
    expect(first.done).toBe(false);
    expect(first.value?.mounts).toEqual([]);
  });

  it("visits chassis 11 (SURGE) with the expected combinatorial breadth", () => {
    // SURGE has 2 hardpoints: [primary, utility].
    // primary accepts daemon-lash (21) and spike-driver (22) → 3 options
    //   incl. empty (null, 21, 22)
    // utility accepts spoofer-mesh (23) → 2 options (null, 23)
    // Total = 3 * 2 = 6 constructs.
    const all = collect(enumerateConstructsForChassis(cat, 11 as never));
    expect(all.length).toBe(6);
    // Every enumerated construct is well-formed under the same validator.
    for (const c of all) {
      expect(validateConstruct(c, cat)).toEqual([]);
    }
  });

  it("is deterministic across two invocations (stable code order)", () => {
    const a = collect(enumerateConstructsForChassis(cat, 11 as never));
    const b = collect(enumerateConstructsForChassis(cat, 11 as never));
    expect(b).toEqual(a);
  });

  it("returns nothing for an unknown chassis code", () => {
    expect(collect(enumerateConstructsForChassis(cat, 999 as never))).toEqual([]);
  });

  it("threads the commander code onto every yielded construct", () => {
    const all = collect(
      enumerateConstructsForChassis(cat, 11 as never, {
        commanderCode: 2 as never,
      }),
    );
    for (const c of all) {
      expect(c.commanderCode).toBe(2 as never);
    }
  });
});

describe("build/enumerate / catalog-wide enumeration", () => {
  const cat = catalog();

  it("visits each chassis in ascending code order", () => {
    const all = collect(enumerateConstructs(cat));
    const codesSeen: number[] = [];
    let prev = -1;
    for (const c of all) {
      const code = c.chassisCode as unknown as number;
      if (code !== prev) codesSeen.push(code);
      prev = code;
    }
    expect(codesSeen).toEqual([...codesSeen].slice().sort((a, b) => a - b));
  });

  it("cost bound skips over-budget constructs entirely", () => {
    const cap = 15;
    const under = collect(enumerateConstructsUnderCost(cat, cap));
    for (const c of under) {
      expect(constructCost(c, cat)).toBeLessThanOrEqual(cap);
    }
    // Sanity: at cost 15 the empty HARDLINE (12) is included, but SURGE (14)
    // with any daemon-lash (6) is not (14 + 6 = 20).
    const hasEmptyHardline = under.some(
      (c: Construct) =>
        (c.chassisCode as unknown as number) === 10 && c.mounts.length === 0,
    );
    expect(hasEmptyHardline).toBe(true);
  });
});

describe("build/enumerate / chassisFamilyReach", () => {
  const cat = catalog();

  it("reports the family set a chassis's hardpoint layout can seat", () => {
    // HARDLINE: [primary, primary, defensive]
    // primary accepts daemon-lash (daemon), spike-driver (spike)
    // defensive accepts ice-wall (ice)
    // → {daemon, spike, ice}
    const families = chassisFamilyReach(cat, 10 as never);
    expect(families.has("daemon")).toBe(true);
    expect(families.has("spike")).toBe(true);
    expect(families.has("ice")).toBe(true);
    expect(families.has("wipe")).toBe(false);
    expect(families.has("spoofer")).toBe(false);
  });

  it("returns the empty set for an unknown chassis code", () => {
    expect(chassisFamilyReach(cat, 999 as never).size).toBe(0);
  });
});
