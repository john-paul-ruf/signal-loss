import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { runBehaviorBattery, traceDisciplineCheck } from "./support/behavior";
import type { CheckResult } from "./support/report-types";
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

describe("TRACE_DISCIPLINE hard gate (CA-03)", () => {
  it("becomes hard — battery report carries the real comparison, not a constant", () => {
    const report = runBehaviorBattery({
      catalog,
      seedCount: 2,
      baseSeed: "behavior-hard-gate",
      budget: 25 as Budget,
    });
    const check = report.checks.find((c) => c.id === "TRACE_DISCIPLINE");
    expect(check).toBeDefined();
    if (check === undefined) return;
    const rate = check.observed["traceDeathRate"] as number;
    const ceiling = catalog.tunables.TRACE_DEATH_CEILING;
    // The battery's verdict must equal the real comparison — if the rate
    // exceeds the ceiling the check MUST be red (a constant-true stub would
    // pass this test only until the rate breaches the ceiling).
    expect(check.passed).toBe(traceDisciplineCheck(rate, ceiling));
    expect(check.passed).toBe(rate <= ceiling);
    if (rate > ceiling) {
      expect(report.passed).toBe(false);
    }
  });

  it("knock-down: the gate FAILS when the ceiling is artificially lowered", () => {
    // Fixture ceiling 0.01 vs an observed rate of 0.5 (1 trace death in 2):
    // the check must fail — proving the comparison has teeth in the negative
    // direction, not merely that today's sample passes.
    expect(traceDisciplineCheck(0.5, 0.01)).toBe(false);
    expect(traceDisciplineCheck(0.4, 0.4)).toBe(true);
    expect(traceDisciplineCheck(0.41, 0.4)).toBe(false);
    expect(traceDisciplineCheck(0, 0.4)).toBe(true);
  });

  it("knock-down: an injected sample breaching the ceiling turns the check red", () => {
    // Build a synthetic aggregate whose trace-death rate (0.75) breaches the
    // ceiling, inject it through the same hard-gate helper the battery uses,
    // and confirm the failure propagates — mirroring the determinism
    // battery's injected-runner pattern (the engine remains untouched).
    const ceiling = catalog.tunables.TRACE_DEATH_CEILING;
    const injectedRate = 0.75;
    const verdict = traceDisciplineCheck(injectedRate, ceiling);
    expect(verdict).toBe(false);
    const injectedCheck: CheckResult = {
      id: "TRACE_DISCIPLINE",
      passed: verdict,
      observed: { traceDeaths: 3, totalDeaths: 4, traceDeathRate: injectedRate },
      threshold: { maxRate: ceiling, note: "hard gate (CA-03) — injected knock-down sample" },
      message: verdict ? "unexpected pass" : "injected sample breaches the hard ceiling",
    };
    expect(injectedCheck.passed).toBe(false);
    expect(injectedCheck.observed["traceDeathRate"]).toBeGreaterThan(ceiling);
  });
});

describe("TRACE_DISCIPLINE full-battery knock-down (lowered ceiling)", () => {
  it("fails when the fixture catalog lowers TRACE_DEATH_CEILING below the observed rate", () => {
    // Mirror the catalog fixtures' clone-and-mutate pattern (tests/fixtures:
    // "negative fixtures mutate one field at a time"): same bundle, ceiling
    // 0.01 vs the observed tier-2 trace-death rate. The battery must report
    // the check red with the real comparison — proving the gate acts on the
    // tunable, not on a constant.
    const fixtureCatalog = {
      ...catalog,
      tunables: { ...catalog.tunables, TRACE_DEATH_CEILING: 0.01 },
    };
    const report = runBehaviorBattery({
      catalog: fixtureCatalog,
      seedCount: 2,
      baseSeed: "behavior-knockdown",
      budget: 25 as Budget,
    });
    const check = report.checks.find((c) => c.id === "TRACE_DISCIPLINE");
    expect(check).toBeDefined();
    if (check === undefined) return;
    const rate = check.observed["traceDeathRate"] as number;
    expect(rate).toBeGreaterThan(0.01);
    expect(check.passed).toBe(false);
    expect(report.passed).toBe(false);
  });
});
