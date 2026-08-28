import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import {
  enumerateBuildSpace,
  runCostingBattery,
  wilsonSampleSize,
  releasePrebuiltForBudget,
} from "./support/costing";
import type { MatchRunResult } from "./support/runner";
import type { Budget } from "../../src/engine/index";

const catalog = (() => {
  const r = loadReleaseCatalog();
  if (!r.ok) throw new Error("release catalog failed to load");
  return r.value;
})();

describe("enumeration", () => {
  it("counts constructs under each budget deterministically", { timeout: 60000 }, () => {
    const r1 = enumerateBuildSpace(catalog, [25 as Budget, 50 as Budget], 5000);
    const r2 = enumerateBuildSpace(catalog, [25 as Budget, 50 as Budget], 5000);
    expect(r1.partialCounts.map((p) => `${p.budget}:${p.count}`)).toEqual(
      r2.partialCounts.map((p) => `${p.budget}:${p.count}`),
    );
    expect(r1.tractableCeiling).toBeGreaterThan(0);
  });

  it("records timedOut when the timeout is very tight", { timeout: 10000 }, () => {
    const result = enumerateBuildSpace(catalog, [200 as Budget], 0);
    const entry = result.partialCounts[0];
    expect(entry).toBeDefined();
    // A 0-ms timeout is a strict deadline; expect either 0 count with
    // timedOut=true, or a truncated positive count with timedOut=true.
    expect(entry?.timedOut ?? false).toBe(true);
  });
});

describe("Wilson sample size", () => {
  it("returns tighter samples for tighter epsilons", () => {
    const nLoose = wilsonSampleSize(0.1);
    const nTight = wilsonSampleSize(0.03);
    expect(nTight).toBeGreaterThan(nLoose);
  });

  it("rejects out-of-range epsilon", () => {
    expect(() => wilsonSampleSize(0)).toThrow();
    expect(() => wilsonSampleSize(1)).toThrow();
    expect(() => wilsonSampleSize(-0.1)).toThrow();
  });
});

describe("release prebuilt helpers", () => {
  it("returns null when the requested budget has no prebuilt", () => {
    // 999 is not in BUDGETS; the release catalog can't hold a
    // prebuilt at that budget.
    const bogus = releasePrebuiltForBudget(catalog, 999 as unknown as Budget);
    expect(bogus).toBeNull();
  });

  it("finds every canonical budget prebuilt", () => {
    for (const b of [25, 50, 75, 100, 125, 150, 175, 200] as Budget[]) {
      const r = releasePrebuiltForBudget(catalog, b);
      expect(r).not.toBeNull();
      if (r !== null) expect(r.constructs.length).toBeGreaterThan(0);
    }
  });
});

describe("costing battery on release content", () => {
  it("emits every named check", { timeout: 180000 }, () => {
    const report = runCostingBattery({
      catalog,
      seedCount: 2,
      baseSeed: "costing-check",
      budgets: [25, 50] as Budget[],
    });
    const ids = report.checks.map((c) => c.id);
    expect(ids).toContain("ENUMERATION_TRACTABILITY");
    expect(ids).toContain("DOMINANCE_CEILING");
    expect(ids).toContain("MATCH_LENGTH");
    expect(ids).toContain("SNOWBALL_RATE");
  });

  it("passes DOMINANCE_CEILING on the CI sample", { timeout: 180000 }, () => {
    const report = runCostingBattery({
      catalog,
      seedCount: 2,
      baseSeed: "costing-dominance",
      budgets: [25 as Budget],
    });
    const dominance = report.checks.find((c) => c.id === "DOMINANCE_CEILING");
    expect(dominance?.passed).toBe(true);
  });

  it("flags DOMINANCE_CEILING when injected runner plants a squad-0 sweep", { timeout: 60000 }, () => {
    const fakeState = {
      config: { seed: "", budget: 25, aiTier: 1, catalogHash: "", tunablesHash: "" },
      constructs: [],
      eliminationOrder: [],
      knownPositions: [],
      map: {},
      phase: "COMPLETE",
      round: 4,
      squads: [
        { id: 0, commanderDead: false, commanderDeathRound: null, poolTotal: 0, poolSpent: 0, eliminatedRound: null, totalDamageDealt: 100, totalDamageTaken: 0, totalPoolGranted: 0, totalPoolSpent: 0, totalPoolWasted: 0, totalCalledShots: 0, totalPostures: 0 },
        { id: 1, commanderDead: false, commanderDeathRound: null, poolTotal: 0, poolSpent: 0, eliminatedRound: 4, totalDamageDealt: 0, totalDamageTaken: 100, totalPoolGranted: 0, totalPoolSpent: 0, totalPoolWasted: 0, totalCalledShots: 0, totalPostures: 0 },
        { id: 2, commanderDead: false, commanderDeathRound: null, poolTotal: 0, poolSpent: 0, eliminatedRound: 4, totalDamageDealt: 0, totalDamageTaken: 100, totalPoolGranted: 0, totalPoolSpent: 0, totalPoolWasted: 0, totalCalledShots: 0, totalPostures: 0 },
        { id: 3, commanderDead: false, commanderDeathRound: null, poolTotal: 0, poolSpent: 0, eliminatedRound: 4, totalDamageDealt: 0, totalDamageTaken: 100, totalPoolGranted: 0, totalPoolSpent: 0, totalPoolWasted: 0, totalCalledShots: 0, totalPostures: 0 },
        { id: 4, commanderDead: false, commanderDeathRound: null, poolTotal: 0, poolSpent: 0, eliminatedRound: 4, totalDamageDealt: 0, totalDamageTaken: 100, totalPoolGranted: 0, totalPoolSpent: 0, totalPoolWasted: 0, totalCalledShots: 0, totalPostures: 0 },
      ],
      winner: 0,
    };
    const fake = (): MatchRunResult => ({
      state: fakeState as unknown as MatchRunResult["state"],
      terminalHash: "0",
      perRoundHashes: ["0", "0", "0", "0"],
      perRoundEvents: [],
      log: {} as MatchRunResult["log"],
      map: {} as MatchRunResult["map"],
      termination: "COMPLETE",
      winner: 0 as unknown as MatchRunResult["winner"],
    });
    const report = runCostingBattery({
      catalog,
      seedCount: 12,
      baseSeed: "planted",
      budgets: [25 as Budget],
      matchRunner: fake,
    });
    expect(report.passed).toBe(false);
    const d = report.checks.find((c) => c.id === "DOMINANCE_CEILING");
    expect(d?.passed).toBe(false);
  });
});
