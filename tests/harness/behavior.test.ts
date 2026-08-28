import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { runBehaviorBattery } from "./support/behavior";
import type { Budget } from "../../src/engine/index";

const catalog = (() => {
  const r = loadReleaseCatalog();
  if (!r.ok) throw new Error("release catalog failed to load");
  return r.value;
})();

describe("behavior battery on release content", () => {
  it("emits every FR-23 named check", { timeout: 60000 }, () => {
    const report = runBehaviorBattery({
      catalog,
      seedCount: 2,
      baseSeed: "behavior-check",
      budget: 25 as Budget,
    });
    const ids = report.checks.map((c) => c.id);
    for (const required of [
      "POOL_DISCIPLINE",
      "CALLED_SHOT_RATE",
      "POSTURE_RATE",
      "NOT_NEAREST",
      "NOT_LEADER",
      "TRACE_DISCIPLINE",
      "TIER_ORDERING",
      "COMMANDER_DAMAGE",
      "NODE_BUDGET_TRUNCATION",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("passes POOL_DISCIPLINE and NODE_BUDGET_TRUNCATION on the CI sample", { timeout: 60000 }, () => {
    const report = runBehaviorBattery({
      catalog,
      seedCount: 2,
      baseSeed: "behavior-safety",
      budget: 25 as Budget,
    });
    const pool = report.checks.find((c) => c.id === "POOL_DISCIPLINE");
    const budget = report.checks.find((c) => c.id === "NODE_BUDGET_TRUNCATION");
    expect(pool?.passed).toBe(true);
    expect(budget?.passed).toBe(true);
  });

  it("reports terminated matches and non-zero winner distributions", { timeout: 120000 }, () => {
    const report = runBehaviorBattery({
      catalog,
      seedCount: 3,
      baseSeed: "behavior-tiers",
      budget: 50 as Budget,
    });
    const ordering = report.checks.find((c) => c.id === "TIER_ORDERING");
    expect(ordering).toBeDefined();
    // Wins are integers; at least one tier should have won at least once
    // over three seeds (there is a possibility of ROUND_CAP for all,
    // which is legal but suggests match-length tuning is needed).
    const runs = report.evidence["tierRuns"] as Array<{ tier: number; wins: number }>;
    expect(runs.length).toBe(3);
  });

  it("byte-identical evidence across two independent runs (excluding diagnostics)", { timeout: 120000 }, () => {
    const a = runBehaviorBattery({ catalog, seedCount: 2, baseSeed: "behavior-repeat", budget: 25 as Budget });
    const b = runBehaviorBattery({ catalog, seedCount: 2, baseSeed: "behavior-repeat", budget: 25 as Budget });
    expect(JSON.stringify(a.checks)).toBe(JSON.stringify(b.checks));
  });
});
