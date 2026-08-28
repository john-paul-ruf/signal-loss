import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { runAllBattery } from "./support/all";
import { canonicalJson } from "./support/report-json";

const catalog = (() => {
  const r = loadReleaseCatalog();
  if (!r.ok) throw new Error("release catalog failed to load");
  return r.value;
})();

describe("all battery aggregator", () => {
  it("returns one child entry per sub-battery, ordered deterministically", { timeout: 120000 }, () => {
    const report = runAllBattery({
      catalog,
      sourceRevision: "abc123",
      seedCount: 2,
      baseSeed: "all-check",
    });
    expect(report.battery).toBe("all");
    expect(report.sourceRevision).toBe("abc123");
    expect(report.catalogHash).toBe(catalog.hashes.catalog);
    expect(report.tunablesHash).toBe(catalog.hashes.tunables);
    expect(report.children.length).toBe(4);
    expect(report.children.map((c) => c.battery)).toEqual([
      "determinism",
      "playability",
      "behavior",
      "costing",
    ]);
    for (const c of report.children) {
      expect(c.digest).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("byte-identical AllReport across two independent runs", { timeout: 120000 }, () => {
    const a = runAllBattery({ catalog, sourceRevision: "rev-a", seedCount: 2, baseSeed: "all-repeat" });
    const b = runAllBattery({ catalog, sourceRevision: "rev-a", seedCount: 2, baseSeed: "all-repeat" });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("passed reflects child battery status", { timeout: 120000 }, () => {
    const report = runAllBattery({ catalog, sourceRevision: "abc", seedCount: 1, baseSeed: "status" });
    expect(report.passed).toBe(report.children.every((c) => c.passed));
  });
});
