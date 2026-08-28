import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { releaseAiWeights } from "./support/ai-weights";
import { runMatch } from "./support/runner";
import { foldMatchLog, hashState } from "../../src/engine/index";

const catalog = (() => {
  const result = loadReleaseCatalog();
  if (!result.ok) throw new Error("release catalog failed to load");
  return result.value;
})();

describe("headless match runner", () => {
  it("runs one match end-to-end and produces a MatchLog whose fold reproduces the terminal hash", () => {
    const result = runMatch({
      seed: "runner-smoke",
      budget: 50,
      aiTier: 2,
      catalog,
      weights: releaseAiWeights,
    });
    expect(result.terminalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.perRoundHashes.length).toBeGreaterThan(0);
    for (const h of result.perRoundHashes) expect(h).toMatch(/^[0-9a-f]{16}$/);

    // Fold identity — MatchLog folds to the same terminal hash.
    const folded = foldMatchLog(result.log, catalog, result.map);
    expect(folded.ok).toBe(true);
    if (folded.ok) {
      expect(hashState(folded.value.state)).toBe(result.terminalHash);
    }
  });

  it("produces identical terminal hashes across two independent runs with equal inputs", () => {
    const a = runMatch({ seed: "det-1", budget: 25, aiTier: 1, catalog, weights: releaseAiWeights });
    const b = runMatch({ seed: "det-1", budget: 25, aiTier: 1, catalog, weights: releaseAiWeights });
    expect(a.terminalHash).toBe(b.terminalHash);
    expect(a.perRoundHashes).toEqual(b.perRoundHashes);
  });

  it("terminates within max rounds and records winner exactly when phase is COMPLETE", () => {
    const result = runMatch({ seed: "runner-cap", budget: 75, aiTier: 3, catalog, weights: releaseAiWeights });
    expect(["COMPLETE", "ROUND_CAP", "NO_LEGAL_DECISION"]).toContain(result.termination);
    if (result.termination === "COMPLETE") {
      expect(result.winner).not.toBe(null);
    }
  });
});
