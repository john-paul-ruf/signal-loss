import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultSummary } from "../../../src/app/components/result/ResultSummary";
import type { MatchResultSummary } from "../../../src/app/store/core";

const result: MatchResultSummary = {
  outcome: "defeat", roundsElapsed: 3, humanPlacement: 2, humanEliminationRound: 3,
  finalStateHash: "hash-1",
  ladder: [{ squadId: 1 as never, status: "SURVIVED_AT_END", placement: null, eliminationRound: null, displayOrderOnly: true }],
  constructs: [{ id: 7 as never, squadId: 0 as never, chassisCode: 10 as never, isCommander: true, damageDealt: 8, damageTaken: 9, roundsAlive: 3, finalDialIndex: 2, destroyed: true, destructionRound: 3 }],
  humanPool: { granted: 5, spent: 4, wasted: 1, calledShots: 2, postures: 2, rounds: [{ round: 1, granted: 2, spent: 1, wasted: 1, calledShots: 1, postures: 0 }] },
  reproducibility: { seed: "seed", budget: 50, resolvedArchetypeId: "arena" as never, aiTier: 1, humanRosterShareString: "human-share", aiRosterShareStrings: ["ai-1", "ai-2", "ai-3", "ai-4"] },
};

describe("ResultSummary", () => {
  it("gives every authoritative fact a semantic home", () => {
    const html = renderToStaticMarkup(<ResultSummary result={result} />);
    for (const truth of ["2ND", "OF 5", "PLACEMENT UNRESOLVED", "Damage dealt", "8", "Wasted", "CALLED SHOTS", "seed", "hash-1", "human-share", "ai-4", "NO PROGRESSION"]) expect(html).toContain(truth);
    expect(html.match(/<table/g)?.length).toBe(2);
  });
});
