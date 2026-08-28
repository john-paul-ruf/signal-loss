import { describe, expect, it } from "vitest";
import type { Catalog } from "../../../src/engine/catalog/index";
import { loadCatalog } from "../../../src/engine/catalog/index";
import {
  applyCommanderType,
  constructCost,
  rosterCost,
  validateCatalogPrebuilts,
  validateConstruct,
  validateRoster,
  type Construct,
  type Roster,
  type Violation,
} from "../../../src/engine/build/index";
import { validMinimalBundle } from "../../fixtures/catalog/valid-minimal";

function loadedCatalog(): Catalog {
  const result = loadCatalog(validMinimalBundle);
  if (!result.ok) {
    throw new Error(
      `fixture failed load: ${JSON.stringify(result.error.slice(0, 3))}`,
    );
  }
  return result.value;
}

function findViolation(
  violations: readonly Violation[],
  kind: string,
): Violation | undefined {
  return violations.find((v) => v.kind === kind);
}

describe("build/validate / validateConstruct", () => {
  const catalog = loadedCatalog();

  it("accepts a well-formed construct with no mounts", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [],
    };
    const errors = validateConstruct(construct, catalog);
    expect(errors).toEqual([]);
  });

  it("accepts a construct with a legal mount", () => {
    // hardline chassis has hardpoints: [primary, primary, defensive]
    // spike-driver (code 22) requires primary — legal on hardpoint 0.
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [{ hardpointIndex: 0, mountCode: 22 as never }],
    };
    expect(validateConstruct(construct, catalog)).toEqual([]);
  });

  it("rejects a port-type mismatch with the expected rule id and message shape", () => {
    // hardline hardpoint 0 = primary; wipe-charge (code 24) requires auxiliary.
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [{ hardpointIndex: 0, mountCode: 24 as never }],
    };
    const errors = validateConstruct(construct, catalog);
    const v = findViolation(errors, "PORT_TYPE_MISMATCH");
    expect(v).toBeDefined();
    expect(v?.rule).toBe("FR-2");
    expect(v?.path).toBe("mounts[0].mountCode");
    expect(v?.message).toContain("primary");
    expect(v?.message).toContain("auxiliary");
  });

  it("rejects a duplicate hardpoint reference", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [
        { hardpointIndex: 0, mountCode: 22 as never },
        { hardpointIndex: 0, mountCode: 21 as never },
      ],
    };
    const errors = validateConstruct(construct, catalog);
    expect(findViolation(errors, "HARDPOINT_DUPLICATE")).toBeDefined();
  });

  it("rejects out-of-order hardpoint indices", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [
        { hardpointIndex: 2, mountCode: 20 as never },
        { hardpointIndex: 0, mountCode: 22 as never },
      ],
    };
    const errors = validateConstruct(construct, catalog);
    expect(findViolation(errors, "HARDPOINT_ORDER")).toBeDefined();
  });

  it("rejects a hardpoint index outside the chassis's range", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [{ hardpointIndex: 99, mountCode: 22 as never }],
    };
    const errors = validateConstruct(construct, catalog);
    const v = findViolation(errors, "HARDPOINT_INDEX_OUT_OF_RANGE");
    expect(v).toBeDefined();
    expect(v?.rule).toBe("FR-2");
  });

  it("rejects an unknown chassis (FR-1)", () => {
    const construct: Construct = {
      chassisCode: 999 as never,
      commanderCode: null,
      mounts: [],
    };
    const errors = validateConstruct(construct, catalog);
    expect(findViolation(errors, "UNKNOWN_CHASSIS")).toBeDefined();
    expect(errors[0]?.rule).toBe("FR-1");
  });

  it("rejects an unknown commander code (FR-3)", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 99 as never,
      mounts: [],
    };
    const errors = validateConstruct(construct, catalog);
    const v = findViolation(errors, "UNKNOWN_COMMANDER");
    expect(v).toBeDefined();
    expect(v?.rule).toBe("FR-3");
  });

  it("rejects an unknown mount code (FR-2)", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [{ hardpointIndex: 0, mountCode: 999 as never }],
    };
    const errors = validateConstruct(construct, catalog);
    expect(findViolation(errors, "UNKNOWN_MOUNT")).toBeDefined();
  });
});

describe("build/validate / validateRoster", () => {
  const catalog = loadedCatalog();

  const commanded = (): Construct => ({
    chassisCode: 10 as never,
    commanderCode: 1 as never,
    mounts: [],
  });
  const untagged = (): Construct => ({
    chassisCode: 11 as never,
    commanderCode: null,
    mounts: [],
  });

  it("accepts a one-construct legal roster inside its budget", () => {
    const roster: Roster = { constructs: [commanded()] };
    expect(validateRoster(roster, catalog, 25 as never)).toEqual([]);
  });

  it("rejects an empty roster (FR-4)", () => {
    const errors = validateRoster({ constructs: [] }, catalog, 100 as never);
    expect(errors.some((v) => v.kind === "EMPTY_ROSTER")).toBe(true);
    expect(errors.some((v) => v.kind === "NO_COMMANDER")).toBe(true);
  });

  it("rejects a roster with no commander (FR-3)", () => {
    const roster: Roster = { constructs: [untagged()] };
    const errors = validateRoster(roster, catalog, 100 as never);
    const v = findViolation(errors, "NO_COMMANDER");
    expect(v).toBeDefined();
    expect(v?.rule).toBe("FR-3");
  });

  it("rejects a roster with two commanders (FR-3)", () => {
    const roster: Roster = { constructs: [commanded(), commanded()] };
    const errors = validateRoster(roster, catalog, 100 as never);
    const v = findViolation(errors, "MULTIPLE_COMMANDERS");
    expect(v).toBeDefined();
    expect(v?.rule).toBe("FR-3");
  });

  it("rejects a budget outside the canonical set (FR-4)", () => {
    const roster: Roster = { constructs: [commanded()] };
    const errors = validateRoster(roster, catalog, 30 as never);
    expect(findViolation(errors, "BUDGET_INVALID")).toBeDefined();
  });

  it("accepts an under-spent roster", () => {
    // commanded() costs 17 (hardline=12 + cipher=5); budget 200 is way above.
    const roster: Roster = { constructs: [commanded()] };
    expect(validateRoster(roster, catalog, 200 as never)).toEqual([]);
  });

  it("rejects an over-budget roster (FR-4)", () => {
    // commanded() costs 12 + 5 = 17 per, times ceiling. Force over.
    const many: Construct[] = [];
    for (let i = 0; i < 3; i = i + 1) many.push(commanded());
    const roster: Roster = { constructs: many };
    // roster cost = 3 * 17 = 51 > 25
    const errors = validateRoster(roster, catalog, 25 as never);
    const v = findViolation(errors, "OVER_BUDGET");
    expect(v).toBeDefined();
    expect(v?.rule).toBe("FR-4");
    // Also expect MULTIPLE_COMMANDERS since all three are commanded.
    expect(findViolation(errors, "MULTIPLE_COMMANDERS")).toBeDefined();
  });

  it("rejects a roster larger than MAX_SQUAD (FR-4)", () => {
    // MAX_SQUAD = 10 in the fixture.
    const many: Construct[] = [commanded()];
    for (let i = 0; i < 10; i = i + 1) many.push(untagged());
    const roster: Roster = { constructs: many };
    const errors = validateRoster(roster, catalog, 200 as never);
    expect(findViolation(errors, "OVER_SQUAD_CAP")).toBeDefined();
  });

  it("propagates per-construct violation paths through the roster wrapper", () => {
    const bad: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [{ hardpointIndex: 0, mountCode: 24 as never }], // port mismatch
    };
    const roster: Roster = { constructs: [bad] };
    const errors = validateRoster(roster, catalog, 25 as never);
    const v = findViolation(errors, "PORT_TYPE_MISMATCH");
    expect(v?.path).toBe("constructs[0].mounts[0].mountCode");
  });
});

describe("build/cost", () => {
  const catalog = loadedCatalog();

  it("constructCost = chassis + commander + mounts", () => {
    // hardline (12) + cipher (5) + spike-driver (5) = 22
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [{ hardpointIndex: 0, mountCode: 22 as never }],
    };
    expect(constructCost(construct, catalog)).toBe(22);
  });

  it("rosterCost sums construct costs", () => {
    const a: Construct = { chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] };
    const b: Construct = { chassisCode: 11 as never, commanderCode: null, mounts: [] };
    // 12 + 5 + 14 = 31
    expect(rosterCost({ constructs: [a, b] }, catalog)).toBe(31);
  });

  it("skips unknown catalog references (validate reports those)", () => {
    const construct: Construct = {
      chassisCode: 999 as never,
      commanderCode: null,
      mounts: [],
    };
    expect(constructCost(construct, catalog)).toBe(0);
  });
});

describe("build/applyCommanderType — deltas visible before commit (FR-3)", () => {
  const catalog = loadedCatalog();

  it("appends extraDialStates copies of the final state", () => {
    const chassis = catalog.indexes.chassisByCode.get(10 as never)!;
    const bulwark = catalog.indexes.commanderTypeByCode.get(3 as never)!;
    const effective = applyCommanderType(chassis, bulwark);
    // Bulwark adds 2 extra dial states. Original had 4.
    expect(effective.dial.length).toBe(chassis.dial.length + 2);
  });

  it("adds damageDelta to every dial state", () => {
    const chassis = catalog.indexes.chassisByCode.get(11 as never)!; // SURGE
    const overclock = catalog.indexes.commanderTypeByCode.get(4 as never)!; // damageDelta = 1
    const effective = applyCommanderType(chassis, overclock);
    for (let i = 0; i < chassis.dial.length; i = i + 1) {
      const original = chassis.dial[i]!.damage;
      expect(effective.dial[i]!.damage).toBe(original + 1);
    }
  });

  it("adds movementDelta to every dial state", () => {
    const chassis = catalog.indexes.chassisByCode.get(11 as never)!;
    const overclock = catalog.indexes.commanderTypeByCode.get(4 as never)!;
    const effective = applyCommanderType(chassis, overclock);
    for (let i = 0; i < chassis.dial.length; i = i + 1) {
      const original = chassis.dial[i]!.movementAllowance as number;
      const modded = effective.dial[i]!.movementAllowance as number;
      expect(modded).toBe(original + (overclock.modifications.movementDelta as number));
    }
  });

  it("adds rangeDelta to baseRange and clamps into [min, max]", () => {
    const chassis = catalog.indexes.chassisByCode.get(10 as never)!;
    const cipher = catalog.indexes.commanderTypeByCode.get(1 as never)!;
    const effective = applyCommanderType(chassis, cipher);
    expect(effective.baseRange as number).toBe(
      (chassis.baseRange as number) + (cipher.modifications.rangeDelta as number),
    );
    // Clamp is respected — synthesise a huge delta and verify it does not
    // exceed the chassis's max.
    const huge = { ...cipher, modifications: { ...cipher.modifications, rangeDelta: 9999999 as never } };
    const clamped = applyCommanderType(chassis, huge as never);
    expect(clamped.baseRange as number).toBe(chassis.rangeClamp.max as number);
  });

  it("preserves hardpoints and footprint", () => {
    const chassis = catalog.indexes.chassisByCode.get(10 as never)!;
    const cipher = catalog.indexes.commanderTypeByCode.get(1 as never)!;
    const effective = applyCommanderType(chassis, cipher);
    expect(effective.hardpoints).toEqual(chassis.hardpoints);
    expect(effective.footprint).toBe(chassis.footprint);
  });
});

describe("build / reference pool prerequisites (FR-17)", () => {
  const catalog = loadedCatalog();

  it("commander types cover the required commander_base range", () => {
    // FR-17 reference table needs at least commander_base = 1 for a
    // reference type. The fixture ships 1/1/1/2 across CIPHER/SYSOP/BULWARK/
    // OVERCLOCK, matching design.md §9b's reference values.
    const bases = catalog.commanderTypes.map((c) => c.commanderBase);
    expect(bases).toEqual(expect.arrayContaining([1]));
    expect(Math.max(...bases)).toBeGreaterThanOrEqual(2);
  });

  it("commander R ladders begin at 3 and never exceed 12", () => {
    for (const c of catalog.commanderTypes) {
      expect(c.rLadder[0]).toBe(3);
      for (const r of c.rLadder) {
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("build / prebuilt validation", () => {
  const catalog = loadedCatalog();

  it("accepts the fixture's illustrative prebuilt through the same code path", () => {
    expect(validateCatalogPrebuilts(catalog)).toEqual([]);
  });
});
