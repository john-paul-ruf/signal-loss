import { describe, expect, it } from "vitest";
import { loadReleaseCatalog } from "./support/release-loader";
import { releaseAiWeights } from "./support/ai-weights";
import { runMatch } from "./support/runner";
import {
  type EliminatedEvent,
  type MatchCompleteEvent,
  foldMatchLog,
  hashState,
} from "../../src/engine/index";

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

  it("terminates within max rounds and records a winner exactly when the completion reason produces one", () => {
    const result = runMatch({ seed: "runner-cap", budget: 75, aiTier: 3, catalog, weights: releaseAiWeights });
    expect(["COMPLETE", "ROUND_CAP", "NO_LEGAL_DECISION"]).toContain(result.termination);
    if (result.termination !== "COMPLETE") return;

    // COMPLETE does not imply a winner: end-round.ts leaves winner null on
    // HUMAN_ELIMINATED endings when multiple AI squads outlive the human.
    // The reason is carried only by the MATCH_COMPLETE event, so derive it
    // from the final round's canonical events.
    const complete = result.perRoundEvents
      .at(-1)
      ?.find((event): event is MatchCompleteEvent => event.kind === "MATCH_COMPLETE");
    expect(complete).toBeDefined();
    if (complete === undefined) return;

    if (complete.reason !== "HUMAN_ELIMINATED") {
      // LAST_STANDING / SIMULTANEOUS: the rank-1 squad (AD-4) is recorded.
      expect(result.winner).not.toBe(null);
      expect(result.winner).toBe(complete.winner);
      return;
    }
    if (result.winner !== null) {
      expect(result.winner).toBe(complete.winner);
      return;
    }
    // Winner-null HUMAN_ELIMINATED: the human squad's elimination entry —
    // its placement — must still be recorded in the log.
    expect(complete.winner).toBe(null);
    const humanEliminated = result.perRoundEvents
      .flat()
      .find((event): event is EliminatedEvent => event.kind === "ELIMINATED" && (event.squadId as number) === 0);
    expect(humanEliminated).toBeDefined();
    expect(humanEliminated?.round).toBe(complete.round);
    expect(humanEliminated?.placement).toBeGreaterThanOrEqual(2);
  });
});
