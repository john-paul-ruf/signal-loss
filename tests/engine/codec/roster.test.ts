import { describe, expect, it } from "vitest";
import { BUDGETS, loadCatalog } from "../../../src/engine/catalog/index";
import type { Budget, Catalog } from "../../../src/engine/catalog/index";
import { decode, encodeRoster } from "../../../src/engine/codec/index";
import type { Construct, Roster } from "../../../src/engine/build/index";
import { SL1_PREFIX } from "../../../src/engine/codec/encode";
import { validMinimalBundle } from "../../fixtures/catalog/valid-minimal";

function loadedCatalog(): Catalog {
  const result = loadCatalog(validMinimalBundle);
  if (!result.ok) throw new Error("fixture failed load");
  return result.value;
}

/** Small deterministic in-test LCG so property tests never depend on a fuzzer. */
class Lcg {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }
  next(): number {
    // Numerical Recipes constants; period 2^32.
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return this.next() % maxExclusive;
  }
  pick<T>(items: readonly T[]): T {
    const chosen = items[this.int(items.length)];
    if (chosen === undefined) throw new Error("pick from empty");
    return chosen;
  }
}

/**
 * Build a construct whose commander (if any) and mount set fit the given
 * budget. Emits mounts sorted ascending by hardpointIndex — the canonical
 * form validateConstruct expects.
 */
function makeCheapConstruct(
  catalog: Catalog,
  budget: number,
  lcg: Lcg,
  commanderCode: number | null,
): { construct: Construct; cost: number } | null {
  const chassisList = catalog.chassis;
  const shuffled = chassisList.slice().sort((a, b) => a.code - b.code);
  for (const chassis of shuffled) {
    const commanderCost =
      commanderCode === null
        ? 0
        : catalog.indexes.commanderTypeByCode.get(commanderCode as never)?.cost ?? 0;
    if (chassis.cost + commanderCost > budget) continue;
    // Optionally add a single mount if it fits and the first hardpoint has a
    // compatible mount available.
    const mounts: { hardpointIndex: number; mountCode: number }[] = [];
    for (let hi = 0; hi < chassis.hardpoints.length; hi = hi + 1) {
      const hp = chassis.hardpoints[hi];
      if (hp === undefined) continue;
      const candidateMounts = catalog.mounts.filter(
        (m) => m.requiredHardpointType === hp.typeId,
      );
      if (candidateMounts.length === 0) continue;
      // Deterministic pick modulated by lcg for variety.
      const pick = candidateMounts[lcg.int(candidateMounts.length)];
      if (pick === undefined) continue;
      const runningCost =
        chassis.cost +
        commanderCost +
        mounts.reduce(
          (acc, m) => acc + (catalog.indexes.mountByCode.get(m.mountCode as never)?.cost ?? 0),
          0,
        );
      if (runningCost + pick.cost > budget) break;
      mounts.push({ hardpointIndex: hi, mountCode: pick.code as number });
    }
    const cost =
      chassis.cost +
      commanderCost +
      mounts.reduce(
        (acc, m) => acc + (catalog.indexes.mountByCode.get(m.mountCode as never)?.cost ?? 0),
        0,
      );
    return {
      construct: {
        chassisCode: chassis.code,
        commanderCode: commanderCode === null ? null : (commanderCode as never),
        mounts: mounts.map((m) => ({
          hardpointIndex: m.hardpointIndex,
          mountCode: m.mountCode as never,
        })),
      },
      cost,
    };
  }
  return null;
}

/**
 * Build a legal roster of the given budget. Returns null if none fits (never
 * expected with the fixture, but kept for property-test safety).
 */
function makeLegalRoster(
  catalog: Catalog,
  budget: Budget,
  lcg: Lcg,
): { roster: Roster; budget: Budget } | null {
  const commanders = catalog.commanderTypes;
  const commanderCode = (commanders[lcg.int(commanders.length)]?.code ?? 1) as number;
  const commanderConstruct = makeCheapConstruct(catalog, budget, lcg, commanderCode);
  if (commanderConstruct === null) return null;
  const targetSize = 1 + lcg.int(Math.min(catalog.tunables.MAX_SQUAD, 4));
  const constructs: Construct[] = [commanderConstruct.construct];
  let running = commanderConstruct.cost;
  for (let i = 1; i < targetSize; i = i + 1) {
    const remaining = (budget as number) - running;
    if (remaining <= 0) break;
    const extra = makeCheapConstruct(catalog, remaining, lcg, null);
    if (extra === null) break;
    constructs.push(extra.construct);
    running += extra.cost;
  }
  return { roster: { constructs }, budget };
}

/**
 * Semantic equivalence for round-trip property tests. The wire format
 * deliberately drops names and local ids (FR-7, NFR-8); everything else —
 * chassis code, commander tag, mount composition, mount order, budget —
 * must survive verbatim.
 */
function rostersEqual(a: Roster, b: Roster): boolean {
  if (a.constructs.length !== b.constructs.length) return false;
  for (let i = 0; i < a.constructs.length; i = i + 1) {
    const ai = a.constructs[i];
    const bi = b.constructs[i];
    if (ai === undefined || bi === undefined) return false;
    if (ai.chassisCode !== bi.chassisCode) return false;
    if (ai.commanderCode !== bi.commanderCode) return false;
    if (ai.mounts.length !== bi.mounts.length) return false;
    for (let m = 0; m < ai.mounts.length; m = m + 1) {
      const am = ai.mounts[m];
      const bm = bi.mounts[m];
      if (am === undefined || bm === undefined) return false;
      if (am.hardpointIndex !== bm.hardpointIndex) return false;
      if (am.mountCode !== bm.mountCode) return false;
    }
  }
  return true;
}

describe("codec/decode / roster round-trip", () => {
  const catalog = loadedCatalog();

  it("carries every legal budget through encode → decode", () => {
    for (const budget of BUDGETS) {
      const lcg = new Lcg((budget as number) * 7919 + 1);
      const generated = makeLegalRoster(catalog, budget, lcg);
      expect(generated).not.toBeNull();
      if (generated === null) continue;
      const encoded = encodeRoster(generated.roster, generated.budget, catalog);
      expect(encoded.startsWith(SL1_PREFIX)).toBe(true);
      const decoded = decode(encoded, catalog);
      expect(decoded.ok).toBe(true);
      if (decoded.ok && decoded.value.kind === "roster") {
        expect(decoded.value.budget).toBe(generated.budget);
        expect(rostersEqual(decoded.value.roster, generated.roster)).toBe(true);
      } else {
        expect.fail(`expected roster decode for budget ${budget}`);
      }
    }
  });

  it("survives a property battery of 50 random legal rosters", () => {
    for (let seed = 1; seed <= 50; seed = seed + 1) {
      const lcg = new Lcg(seed);
      const budget = BUDGETS[lcg.int(BUDGETS.length)]!;
      const generated = makeLegalRoster(catalog, budget, lcg);
      if (generated === null) continue;
      const encoded = encodeRoster(generated.roster, generated.budget, catalog);
      const decoded = decode(encoded, catalog);
      expect(decoded.ok).toBe(true);
      if (decoded.ok && decoded.value.kind === "roster") {
        expect(decoded.value.budget).toBe(generated.budget);
        expect(rostersEqual(decoded.value.roster, generated.roster)).toBe(true);
      }
    }
  });
});

describe("codec/decode / roster ILLEGAL classification (FR-7)", () => {
  const catalog = loadedCatalog();

  function encodeAndDecode(
    roster: Roster,
    budget: Budget,
  ): ReturnType<typeof decode> {
    const encoded = encodeRoster(roster, budget, catalog);
    return decode(encoded, catalog);
  }

  it("rejects a roster with zero commanders", () => {
    const roster: Roster = {
      constructs: [
        {
          chassisCode: 10 as never,
          commanderCode: null,
          mounts: [],
        },
      ],
    };
    const result = encodeAndDecode(roster, 25 as Budget);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "ILLEGAL") {
      const ruleTags = result.error.violations.map((v) => v.kind);
      expect(ruleTags).toContain("NO_COMMANDER");
    } else {
      expect.fail("expected ILLEGAL / NO_COMMANDER");
    }
  });

  it("rejects a roster with multiple commanders", () => {
    const roster: Roster = {
      constructs: [
        { chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] },
        { chassisCode: 10 as never, commanderCode: 2 as never, mounts: [] },
      ],
    };
    const result = encodeAndDecode(roster, 100 as Budget);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "ILLEGAL") {
      expect(result.error.violations.some((v) => v.kind === "MULTIPLE_COMMANDERS")).toBe(true);
    } else {
      expect.fail("expected ILLEGAL / MULTIPLE_COMMANDERS");
    }
  });

  it("rejects an over-budget roster with OVER_BUDGET", () => {
    // At budget 25, chassis 12 (cost 16) + commander 4 (cost 10) = 26 > 25.
    const roster: Roster = {
      constructs: [
        { chassisCode: 12 as never, commanderCode: 4 as never, mounts: [] },
      ],
    };
    const result = encodeAndDecode(roster, 25 as Budget);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "ILLEGAL") {
      expect(result.error.violations.some((v) => v.kind === "OVER_BUDGET")).toBe(true);
    } else {
      expect.fail("expected ILLEGAL / OVER_BUDGET");
    }
  });

  it("rejects a port/mount type mismatch with PORT_TYPE_MISMATCH", () => {
    // chassis 10 hardpoint[2] is "defensive"; mount 22 (spike-driver) requires "primary".
    const roster: Roster = {
      constructs: [
        {
          chassisCode: 10 as never,
          commanderCode: 1 as never,
          mounts: [{ hardpointIndex: 2, mountCode: 22 as never }],
        },
      ],
    };
    const result = encodeAndDecode(roster, 50 as Budget);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "ILLEGAL") {
      expect(result.error.violations.some((v) => v.kind === "PORT_TYPE_MISMATCH")).toBe(true);
    } else {
      expect.fail("expected ILLEGAL / PORT_TYPE_MISMATCH");
    }
  });
});

describe("codec/decode / roster UNKNOWN_ENTRY classification", () => {
  const catalog = loadedCatalog();

  it("names an unknown mount code before any legality classification", () => {
    // Stub catalog carrying a synthetic mount code so the encoder accepts it.
    const stub: Catalog = {
      ...catalog,
      indexes: {
        ...catalog.indexes,
        mountByCode: new Map(catalog.indexes.mountByCode).set(
          777 as never,
          catalog.mounts[0]!,
        ),
      },
    };
    const roster: Roster = {
      constructs: [
        {
          chassisCode: 10 as never,
          commanderCode: 1 as never,
          mounts: [{ hardpointIndex: 0, mountCode: 777 as never }],
        },
      ],
    };
    const encoded = encodeRoster(roster, 100 as Budget, stub);
    const result = decode(encoded, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "UNKNOWN_ENTRY") {
      expect(result.error.code).toBe(777);
      expect(result.error.entry).toBe("mount");
    } else {
      expect.fail("expected UNKNOWN_ENTRY for mount 777");
    }
  });

  it("names an unknown chassis code before any legality classification", () => {
    const stub: Catalog = {
      ...catalog,
      indexes: {
        ...catalog.indexes,
        chassisByCode: new Map(catalog.indexes.chassisByCode).set(
          555 as never,
          catalog.chassis[0]!,
        ),
      },
    };
    const roster: Roster = {
      constructs: [
        {
          chassisCode: 555 as never,
          commanderCode: 1 as never,
          mounts: [],
        },
      ],
    };
    const encoded = encodeRoster(roster, 100 as Budget, stub);
    const result = decode(encoded, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "UNKNOWN_ENTRY") {
      expect(result.error.entry).toBe("chassis");
      expect(result.error.code).toBe(555);
    } else {
      expect.fail("expected UNKNOWN_ENTRY for chassis 555");
    }
  });
});

describe("codec/encode / defensive bounds", () => {
  const catalog = loadedCatalog();

  it("refuses to encode an empty roster", () => {
    expect(() => encodeRoster({ constructs: [] }, 25 as Budget, catalog)).toThrow(RangeError);
  });

  it("refuses to encode a construct with an unknown chassis", () => {
    const roster: Roster = {
      constructs: [
        { chassisCode: 4000 as never, commanderCode: null, mounts: [] },
      ],
    };
    expect(() => encodeRoster(roster, 25 as Budget, catalog)).toThrow(RangeError);
  });

  it("preserves mount order across encode → decode", () => {
    const roster: Roster = {
      constructs: [
        {
          chassisCode: 10 as never,
          commanderCode: 1 as never,
          mounts: [
            { hardpointIndex: 0, mountCode: 22 as never },
            { hardpointIndex: 2, mountCode: 20 as never },
          ],
        },
      ],
    };
    const encoded = encodeRoster(roster, 50 as Budget, catalog);
    const decoded = decode(encoded, catalog);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.kind === "roster") {
      const roundTrip = decoded.value.roster.constructs[0]!.mounts;
      expect(roundTrip.map((m) => m.hardpointIndex)).toEqual([0, 2]);
      expect(roundTrip.map((m) => m.mountCode as unknown as number)).toEqual([22, 20]);
    }
  });
});
