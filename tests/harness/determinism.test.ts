import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { runDeterminismBattery, type MatchRunner } from "./support/determinism";
import { runMatch, type MatchRunResult, type RunMatchOptions } from "./support/runner";
import { releaseAiWeights } from "./support/ai-weights";
import type { Budget } from "../../src/engine/index";

const catalog = (() => {
  const r = loadReleaseCatalog();
  if (!r.ok) throw new Error("release catalog failed to load");
  return r.value;
})();

const SEEDS: readonly string[] = ["release#0", "release#1", "release#2"];
const BUDGET: Budget = 50 as Budget;

describe("determinism battery — real runner", () => {
  it("passes on the checked-in release sample", () => {
    const report = runDeterminismBattery({
      catalog,
      seeds: SEEDS,
      budget: BUDGET,
      aiTier: 2,
      weights: releaseAiWeights,
      baseSeedLabel: "release",
    });
    if (!report.passed) {
      const detail = report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.id}: ${c.message}`)
        .join("\n");
      throw new Error(`Determinism battery unexpectedly failed:\n${detail}`);
    }
    expect(report.battery).toBe("determinism");
    expect(report.catalogHash).toBe(catalog.hashes.catalog);
    expect(report.tunablesHash).toBe(catalog.hashes.tunables);
    // Every check exists and passes.
    const checkIds = report.checks.map((c) => c.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(checkIds).toContain("REPLAY_IDENTITY");
    expect(checkIds).toContain("FOLD_IDENTITY");
    expect(checkIds).toContain("PERMUTATION_INVARIANCE");
    expect(checkIds).toContain("CROSS_RUNTIME_MATCH");
  });

  it("defers cross-runtime check when no runtimes supplied", () => {
    const report = runDeterminismBattery({
      catalog,
      seeds: SEEDS.slice(0, 1),
      budget: BUDGET,
      aiTier: 1,
      weights: releaseAiWeights,
    });
    const cross = report.checks.find((c) => c.id === "CROSS_RUNTIME_MATCH");
    expect(cross).toBeDefined();
    expect(cross?.passed).toBe(true);
    expect(String(cross?.observed["checked"] ?? "")).toBe("false");
  });

  it("verifies cross-runtime hashes when supplied and passes on identical", () => {
    // Build a reference run to obtain the real terminal hashes.
    const reference = SEEDS.map((seed) =>
      runMatch({ seed, budget: BUDGET, aiTier: 2, catalog, weights: releaseAiWeights }).terminalHash,
    );
    const report = runDeterminismBattery({
      catalog,
      seeds: SEEDS,
      budget: BUDGET,
      aiTier: 2,
      weights: releaseAiWeights,
      crossRuntimeHashes: { chromium: reference, firefox: reference },
    });
    const cross = report.checks.find((c) => c.id === "CROSS_RUNTIME_MATCH");
    expect(cross?.passed).toBe(true);
    expect(String(cross?.observed["divergences"] ?? "")).toBe("0");
  });

  it("flags cross-runtime divergence when a runtime disagrees", () => {
    const reference = SEEDS.map((seed) =>
      runMatch({ seed, budget: BUDGET, aiTier: 2, catalog, weights: releaseAiWeights }).terminalHash,
    );
    const tampered = reference.slice();
    tampered[0] = "0000000000000000";
    const report = runDeterminismBattery({
      catalog,
      seeds: SEEDS,
      budget: BUDGET,
      aiTier: 2,
      weights: releaseAiWeights,
      crossRuntimeHashes: { webkit: tampered },
    });
    expect(report.passed).toBe(false);
    const cross = report.checks.find((c) => c.id === "CROSS_RUNTIME_MATCH");
    expect(cross?.passed).toBe(false);
    expect(cross?.failingSeeds).toContain(`webkit:${SEEDS[0] ?? ""}`);
  });
});

describe("determinism battery — divergent fake engine adapter", () => {
  it("REPLAY_IDENTITY fails when the injected runner returns different terminal hashes on two invocations for the same seed", () => {
    let call = 0;
    const dummyResult = (): MatchRunResult => {
      call = call + 1;
      const bad = call % 2 === 0;
      return {
        state: {} as MatchRunResult["state"],
        terminalHash: bad ? "ffffffffffffffff" : "aaaaaaaaaaaaaaaa",
        perRoundHashes: [],
        perRoundEvents: [],
        log: {} as MatchRunResult["log"],
        map: {} as MatchRunResult["map"],
        termination: "COMPLETE",
        winner: null,
      };
    };
    const fake: MatchRunner = (_opts: RunMatchOptions) => dummyResult();
    const report = runDeterminismBattery({
      catalog,
      seeds: ["divergent"],
      budget: BUDGET,
      aiTier: 2,
      weights: releaseAiWeights,
      matchRunner: fake,
    });
    expect(report.passed).toBe(false);
    const replay = report.checks.find((c) => c.id === "REPLAY_IDENTITY");
    expect(replay?.passed).toBe(false);
    expect(replay?.failingSeeds).toContain("divergent");
  });

  it("survives runner exceptions and records them under runnerErrors", () => {
    const fake: MatchRunner = () => {
      throw new Error("simulated runner failure");
    };
    const report = runDeterminismBattery({
      catalog,
      seeds: ["boom"],
      budget: BUDGET,
      aiTier: 2,
      weights: releaseAiWeights,
      matchRunner: fake,
    });
    expect(report.passed).toBe(false);
    const errors = report.evidence["runnerErrors"];
    expect(Array.isArray(errors)).toBe(true);
    expect((errors as string[])[0]).toContain("simulated runner failure");
  });
});
