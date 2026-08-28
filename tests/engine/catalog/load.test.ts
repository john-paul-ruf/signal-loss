import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../../src/engine/catalog/index";
import {
  cloneValidBundle,
  validMinimalBundle,
} from "../../fixtures/catalog/valid-minimal";

/**
 * `loadCatalog` end-to-end tests. The base fixture is designed to pass all
 * checks; each negative test clones the base and mutates one field so
 * failures pinpoint the specific rule.
 */

function loadOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok; got ${JSON.stringify(result.error)}`);
  return result.value;
}

function loadErr(result: { ok: true; value: unknown } | { ok: false; error: readonly { path: string; kind: string; message: string }[] }) {
  if (result.ok) throw new Error("expected error; got success");
  return result.error;
}

describe("catalog/load / happy path", () => {
  it("loads the valid minimal bundle without errors", () => {
    const result = loadCatalog(validMinimalBundle);
    expect(result.ok).toBe(true);
    const catalog = loadOk(result);
    expect(catalog.chassis.length).toBe(3);
    expect(catalog.mounts.length).toBe(5);
    expect(catalog.commanderTypes.length).toBe(4);
    expect(catalog.mapArchetypes.length).toBe(7);
  });

  it("builds O(1) indexes for every category", () => {
    const catalog = loadOk(loadCatalog(validMinimalBundle));
    expect(catalog.indexes.chassisByCode.size).toBe(3);
    expect(catalog.indexes.mountById.size).toBe(5);
    expect(catalog.indexes.commanderTypeByCode.size).toBe(4);
    expect(catalog.indexes.archetypeById.size).toBe(7);
    // Spot-check: index lookups return the actual entry.
    const hardline = catalog.indexes.chassisById.get("hardline" as never);
    expect(hardline?.name).toBe("HARDLINE");
  });

  it("emits canonical catalog and tunables hashes", () => {
    const catalog = loadOk(loadCatalog(validMinimalBundle));
    expect(catalog.hashes.catalog).toMatch(/^[0-9a-f]{16}$/);
    expect(catalog.hashes.tunables).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("catalog/load / all-or-nothing failure", () => {
  it("returns error object with the exact path of each violation", () => {
    const raw = cloneValidBundle() as unknown as { chassis: { name: string }[] };
    raw.chassis[0]!.name = ""; // empty name is illegal
    const errors = loadErr(loadCatalog(raw as never));
    const flagged = errors.find((e) => e.path === "chassis[0].name");
    expect(flagged).toBeDefined();
    expect(flagged?.kind).toBe("RANGE");
  });

  it("collects multiple errors before returning (does not fail fast)", () => {
    const raw = cloneValidBundle() as unknown as {
      chassis: { name: string; cost: number }[];
      mounts: { name: string }[];
    };
    raw.chassis[0]!.name = "";
    raw.chassis[1]!.cost = -1;
    raw.mounts[0]!.name = "";
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.length).toBeGreaterThanOrEqual(3);
    const paths = errors.map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "chassis[0].name",
        "chassis[1].cost",
        "mounts[0].name",
      ]),
    );
  });
});

describe("catalog/load / uniqueness", () => {
  it("rejects duplicate chassis codes", () => {
    const raw = cloneValidBundle() as unknown as { chassis: { code: number }[] };
    raw.chassis[1]!.code = raw.chassis[0]!.code;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "DUPLICATE" && /code/.test(e.message))).toBe(true);
  });

  it("rejects duplicate mount ids", () => {
    const raw = cloneValidBundle() as unknown as { mounts: { id: string }[] };
    raw.mounts[1]!.id = raw.mounts[0]!.id;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "DUPLICATE" && /mount id/.test(e.message))).toBe(true);
  });

  it("rejects duplicate archetype codes", () => {
    const raw = cloneValidBundle() as unknown as { mapArchetypes: { code: number }[] };
    raw.mapArchetypes[1]!.code = raw.mapArchetypes[0]!.code;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "DUPLICATE" && /archetype code/.test(e.message))).toBe(true);
  });
});

describe("catalog/load / references", () => {
  it("rejects a mount whose requiredHardpointType is unknown", () => {
    const raw = cloneValidBundle() as unknown as { mounts: { requiredHardpointType: string }[] };
    raw.mounts[0]!.requiredHardpointType = "ghost-type";
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "REFERENCE")).toBe(true);
  });

  it("rejects a prebuilt referencing an unknown chassis", () => {
    const raw = cloneValidBundle() as unknown as { prebuilts: { constructs: { chassisCode: number }[] }[] };
    raw.prebuilts[0]!.constructs[0]!.chassisCode = 999;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "REFERENCE" && /chassis/.test(e.message))).toBe(true);
  });

  it("rejects a prebuilt referencing an unknown mount code", () => {
    const raw = cloneValidBundle() as unknown as { prebuilts: { constructs: { mounts: { mountCode: number }[] }[] }[] };
    raw.prebuilts[0]!.constructs[0]!.mounts[0]!.mountCode = 999;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "REFERENCE" && /mount code/.test(e.message))).toBe(true);
  });
});

describe("catalog/load / dial rules", () => {
  it("rejects an empty dial", () => {
    const raw = cloneValidBundle() as unknown as { chassis: { dial: unknown[] }[] };
    raw.chassis[0]!.dial = [];
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "RANGE" && /at least one state/.test(e.message))).toBe(true);
  });

  it("rejects a dial whose declared 'degrade' curve does not degrade", () => {
    const raw = cloneValidBundle() as unknown as {
      chassis: { curveFamily: string; dial: { damage: number }[] }[];
    };
    // First chassis is degrade; make the last state damage EXCEED first.
    raw.chassis[0]!.dial[raw.chassis[0]!.dial.length - 1]!.damage = 999;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "CURVE")).toBe(true);
  });

  it("rejects a dial whose declared 'spike' curve does not spike", () => {
    const raw = cloneValidBundle() as unknown as {
      chassis: { curveFamily: string; dial: { damage: number }[] }[];
    };
    // Second chassis is spike; make the last state damage BELOW first.
    raw.chassis[1]!.dial[raw.chassis[1]!.dial.length - 1]!.damage = 0;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "CURVE")).toBe(true);
  });

  it("rejects out-of-order dial state indexes", () => {
    const raw = cloneValidBundle() as unknown as { chassis: { dial: { index: number }[] }[] };
    raw.chassis[0]!.dial[1]!.index = 3;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "ORDER")).toBe(true);
  });
});

describe("catalog/load / archetype completeness", () => {
  it("requires all seven archetypes", () => {
    const raw = cloneValidBundle() as unknown as { mapArchetypes: unknown[] };
    raw.mapArchetypes.pop();
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "COMPLETENESS" && /archetype/.test(e.message))).toBe(true);
  });
});

describe("catalog/load / curve family completeness", () => {
  it("requires at least one chassis per curve family", () => {
    const raw = cloneValidBundle() as unknown as { chassis: { curveFamily: string; dial: { damage: number; movementAllowance: number }[] }[] };
    // Remove the inversion chassis's inversion property by changing its family
    // to "degrade" with a valid degrading dial to avoid other errors.
    const c = raw.chassis[2]!;
    c.curveFamily = "degrade";
    c.dial[0]!.damage = 10;
    c.dial[c.dial.length - 1]!.damage = 1;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "COMPLETENESS" && /inversion/.test(e.message))).toBe(true);
  });
});

describe("catalog/load / FR-2 universal-family loadout", () => {
  it("rejects a chassis whose hardpoint layout admits one of every mount family", () => {
    const raw = cloneValidBundle() as unknown as {
      chassis: {
        hardpoints: { typeId: string }[];
        curveFamily?: string;
        dial: { damage: number }[];
      }[];
    };
    // Give the first chassis five hardpoints, one of each type, so a mount of
    // every family can be seated simultaneously (ice→defensive, daemon→primary,
    // spike→primary, spoofer→utility, wipe→auxiliary).
    raw.chassis[0]!.hardpoints = [
      { typeId: "primary" },
      { typeId: "primary" },
      { typeId: "auxiliary" },
      { typeId: "defensive" },
      { typeId: "utility" },
    ];
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "MOUNT_FAMILY_UNIVERSAL")).toBe(true);
  });
});

describe("catalog/load / tunables completeness", () => {
  it("reports missing tunable keys", () => {
    const raw = cloneValidBundle() as unknown as { tunables: Record<string, unknown> };
    delete raw.tunables["MAX_SQUAD"];
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "COMPLETENESS" && /MAX_SQUAD/.test(e.message))).toBe(true);
  });

  it("reports out-of-range tunable values", () => {
    const raw = cloneValidBundle() as unknown as { tunables: Record<string, unknown> };
    raw.tunables["MAX_OPEN_AREA"] = 1.5;
    const errors = loadErr(loadCatalog(raw as never));
    expect(errors.some((e) => e.kind === "RANGE" && /MAX_OPEN_AREA/.test(e.path))).toBe(true);
  });
});
