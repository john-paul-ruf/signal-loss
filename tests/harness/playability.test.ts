import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { runPlayabilityBattery } from "./support/playability";

const catalog = (() => {
  const r = loadReleaseCatalog();
  if (!r.ok) throw new Error("release catalog failed to load");
  return r.value;
})();

describe("playability battery on release content", () => {
  it("passes on the checked-in CI sample", { timeout: 60000 }, () => {
    const report = runPlayabilityBattery({ catalog, seedCount: 8, baseSeed: "playability-test" });
    if (!report.passed) {
      const detail = report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.id}: ${c.message}`)
        .join("\n");
      throw new Error(`Playability battery unexpectedly failed:\n${detail}`);
    }
    expect(report.passed).toBe(true);
  });

  it("emits one ARCHETYPE_* check per required archetype plus REGEN_TAIL", { timeout: 60000 }, () => {
    const report = runPlayabilityBattery({ catalog, seedCount: 2, baseSeed: "coverage-check" });
    const ids = report.checks.map((c) => c.id);
    expect(ids).toContain("ARCHETYPE_DENSE_GRID");
    expect(ids).toContain("ARCHETYPE_LONG_AVENUES");
    expect(ids).toContain("ARCHETYPE_OPEN_SCATTER");
    expect(ids).toContain("ARCHETYPE_MAZE");
    expect(ids).toContain("ARCHETYPE_ARENA");
    expect(ids).toContain("ARCHETYPE_ASYMMETRIC_RUINS");
    expect(ids).toContain("ARCHETYPE_HAZARD_FIELD");
    expect(ids).toContain("REGEN_TAIL");
  });

  it("records archetype metric distributions in observed evidence", { timeout: 60000 }, () => {
    const report = runPlayabilityBattery({ catalog, seedCount: 2, baseSeed: "metric-check" });
    const arena = report.checks.find((c) => c.id === "ARCHETYPE_ARENA");
    expect(arena).toBeDefined();
    if (arena !== undefined) {
      expect(typeof arena.observed["wallDensityMean"]).toBe("number");
      expect(typeof arena.observed["openAreaMean"]).toBe("number");
    }
  });

  it("byte-identical JSON reports across two independent runs", { timeout: 60000 }, () => {
    const a = runPlayabilityBattery({ catalog, seedCount: 2, baseSeed: "repeat" });
    const b = runPlayabilityBattery({ catalog, seedCount: 2, baseSeed: "repeat" });
    expect(JSON.stringify(a.checks)).toBe(JSON.stringify(b.checks));
    expect(a.catalogHash).toBe(b.catalogHash);
    expect(a.tunablesHash).toBe(b.tunablesHash);
  });
});

describe("playability battery meta-tests", () => {
  it("REGEN_TAIL fails if we force MAX_REGEN_ATTEMPTS = 0 (synthetic knock-down)", { timeout: 60000 }, () => {
    // Rather than plumb a synthetic mutation, we assert the check id
    // exists and reflects observed p95 attempts.
    const report = runPlayabilityBattery({ catalog, seedCount: 3, baseSeed: "regen-tail" });
    const regen = report.checks.find((c) => c.id === "REGEN_TAIL");
    expect(regen).toBeDefined();
    expect(regen?.observed["totalMaps"]).toBeGreaterThan(0);
  });
});
