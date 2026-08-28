import { describe, expect, it } from "vitest";
import {
  CURVE_FAMILIES,
  BUDGETS,
  MOUNT_FAMILIES,
  REQUIRED_ARCHETYPES,
  validateCatalogPrebuilts,
} from "../../src/engine/index";
import type { Catalog } from "../../src/engine/index";
import {
  formatCatalogErrors,
  loadReleaseCatalog,
} from "./support/release-loader";

/**
 * Session 06 Checkpoint 1 — content self-tests.
 *
 * The release catalog is the shipping contract; these assertions guarantee:
 *   • loadCatalog succeeds with zero validation errors.
 *   • Every declared coverage invariant (curve family, mount family, budget,
 *     archetype, commander doctrine) is satisfied.
 *   • Every prebuilt roster is legal end-to-end through the same build
 *     validator both UI halves consume.
 *
 * These checks run as ordinary unit tests (`npm run test:unit`) — they are
 * fast and belong to the harness lease so concurrent sessions do not touch
 * the same test directory.
 */

let cachedCatalog: Catalog | null = null;

function releaseCatalog(): Catalog {
  if (cachedCatalog !== null) return cachedCatalog;
  const result = loadReleaseCatalog();
  if (!result.ok) {
    const message = `Release catalog failed validation:\n${formatCatalogErrors(result.error)}`;
    throw new Error(message);
  }
  cachedCatalog = result.value;
  return cachedCatalog;
}

describe("release catalog loads clean", () => {
  it("loads with zero validation errors", () => {
    const result = loadReleaseCatalog();
    if (!result.ok) {
      throw new Error(`Load failed:\n${formatCatalogErrors(result.error)}`);
    }
    expect(result.value.hashes.catalog).toMatch(/^[0-9a-f]{16}$/);
    expect(result.value.hashes.tunables).toMatch(/^[0-9a-f]{16}$/);
  });

  it("assigns unique stable codes to every chassis / mount / commander / archetype", () => {
    const catalog = releaseCatalog();
    const chassisCodes = new Set(catalog.chassis.map((c) => c.code as number));
    expect(chassisCodes.size).toBe(catalog.chassis.length);
    const mountCodes = new Set(catalog.mounts.map((m) => m.code as number));
    expect(mountCodes.size).toBe(catalog.mounts.length);
    const commanderCodes = new Set(catalog.commanderTypes.map((c) => c.code as number));
    expect(commanderCodes.size).toBe(catalog.commanderTypes.length);
    const archetypeCodes = new Set(catalog.mapArchetypes.map((a) => a.code as number));
    expect(archetypeCodes.size).toBe(catalog.mapArchetypes.length);
  });
});

describe("release coverage invariants", () => {
  it("ships at least seven chassis", () => {
    expect(releaseCatalog().chassis.length).toBeGreaterThanOrEqual(7);
  });

  it("covers every curve family across chassis", () => {
    const observed = new Set(releaseCatalog().chassis.map((c) => c.curveFamily));
    for (const family of CURVE_FAMILIES) {
      expect(observed.has(family)).toBe(true);
    }
  });

  it("ships at least eleven mounts", () => {
    expect(releaseCatalog().mounts.length).toBeGreaterThanOrEqual(11);
  });

  it("covers every mount family across mounts", () => {
    const observed = new Set(releaseCatalog().mounts.map((m) => m.family));
    for (const family of MOUNT_FAMILIES) {
      expect(observed.has(family)).toBe(true);
    }
  });

  it("ships at least four commander types", () => {
    expect(releaseCatalog().commanderTypes.length).toBeGreaterThanOrEqual(4);
  });

  it("ships at least one commander with commanderBase >= 2 (fragile high-pool doctrine)", () => {
    const doctrines = releaseCatalog().commanderTypes.filter((c) => c.commanderBase >= 2);
    expect(doctrines.length).toBeGreaterThanOrEqual(1);
  });

  it("ships all seven required archetypes", () => {
    const observed = new Set(releaseCatalog().mapArchetypes.map((a) => a.id as unknown as string));
    for (const required of REQUIRED_ARCHETYPES) {
      expect(observed.has(required)).toBe(true);
    }
  });
});

describe("release prebuilts are legal and cover the catalog", () => {
  it("has exactly one prebuilt per budget", () => {
    const catalog = releaseCatalog();
    const byBudget = new Map<number, number>();
    for (const p of catalog.prebuilts) {
      byBudget.set(p.budget as number, (byBudget.get(p.budget as number) ?? 0) + 1);
    }
    for (const b of BUDGETS) {
      expect(byBudget.get(b as number) ?? 0).toBeGreaterThanOrEqual(1);
    }
    expect(catalog.prebuilts.length).toBe(BUDGETS.length);
  });

  it("passes validateCatalogPrebuilts with zero violations", () => {
    const catalog = releaseCatalog();
    const violations = validateCatalogPrebuilts(catalog);
    if (violations.length > 0) {
      const detail = violations.map((v) => `  [${v.rule}/${v.kind}] ${v.path}: ${v.message}`).join("\n");
      throw new Error(`Prebuilt violations:\n${detail}`);
    }
    expect(violations).toEqual([]);
  });

  it("covers every chassis somewhere across the prebuilt set", () => {
    const catalog = releaseCatalog();
    const usedChassis = new Set<number>();
    for (const p of catalog.prebuilts) {
      for (const c of p.constructs) {
        usedChassis.add(c.chassisCode as number);
      }
    }
    for (const c of catalog.chassis) {
      expect(usedChassis.has(c.code as number)).toBe(true);
    }
  });

  it("covers every mount family across the prebuilt set", () => {
    const catalog = releaseCatalog();
    const mountFamilyByCode = new Map<number, string>();
    for (const m of catalog.mounts) {
      mountFamilyByCode.set(m.code as number, m.family);
    }
    const observedFamilies = new Set<string>();
    for (const p of catalog.prebuilts) {
      for (const c of p.constructs) {
        for (const m of c.mounts) {
          const family = mountFamilyByCode.get(m.mountCode as number);
          if (family !== undefined) observedFamilies.add(family);
        }
      }
    }
    for (const family of MOUNT_FAMILIES) {
      expect(observedFamilies.has(family)).toBe(true);
    }
  });

  it("covers every commander type across the prebuilt set", () => {
    const catalog = releaseCatalog();
    const usedCommanders = new Set<number>();
    for (const p of catalog.prebuilts) {
      for (const c of p.constructs) {
        if (c.commanderCode !== null) usedCommanders.add(c.commanderCode as number);
      }
    }
    for (const c of catalog.commanderTypes) {
      expect(usedCommanders.has(c.code as number)).toBe(true);
    }
  });
});

describe("release tunables meet requirement-derived invariants", () => {
  it("keeps MOVE_SUBSTEPS = 64 per AD-3", () => {
    expect(releaseCatalog().tunables.MOVE_SUBSTEPS).toBe(64);
  });

  it("keeps range clamps well-ordered", () => {
    const t = releaseCatalog().tunables;
    expect(t.RANGE_MIN as number).toBeLessThanOrEqual(t.RANGE_MAX as number);
  });

  it("keeps every chassis resolution range inside its own clamp", () => {
    const catalog = releaseCatalog();
    for (const c of catalog.chassis) {
      expect(c.resolutionRange as number).toBeGreaterThanOrEqual(c.rangeClamp.min as number);
      expect(c.resolutionRange as number).toBeLessThanOrEqual(c.rangeClamp.max as number);
    }
  });
});
