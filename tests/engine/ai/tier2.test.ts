import { describe, expect, it } from "vitest";
import {
  aiAttackPlot,
  bestOf,
  emptyOpponentModel,
  nodeBudget,
  observationCount,
  postureFrequency,
  topK,
  updateOpponentModel,
} from "../../../src/engine/ai/index";
import { rngFromSeed, stream } from "../../../src/engine/rng/index";
import {
  constructId,
  squadId,
  legalAttackPlot,
} from "../../../src/engine/match/index";
import type { Event, MatchState, PostureRevealEvent } from "../../../src/engine/match/index";
import { publicView, updateKnownPositions } from "../../../src/engine/view/index";
import { makeCloseSoloMatch, soloMatchConfig } from "../../fixtures/matches/simple-match";
import { testAiWeights } from "../../fixtures/ai/tunables";

function withPool(state: MatchState, squad: number, poolTotal: number): MatchState {
  const squads = state.squads.map((s, i) =>
    i === squad ? { ...s, poolTotal } : s,
  ) as unknown as MatchState["squads"];
  return { ...state, squads };
}
function forcePhase(state: MatchState, phase: MatchState["phase"]): MatchState {
  return { ...state, phase };
}

describe("ai/model / opponent posture-frequency observations", () => {
  it("empty model has neutral (Laplace 1/2) frequency for every squad", () => {
    const model = emptyOpponentModel();
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const f = postureFrequency(model, squadId(sq));
      expect(f.numer).toBe(1);
      expect(f.denom).toBe(2);
      expect(observationCount(model, squadId(sq))).toBe(0);
    }
  });

  it("adapts to an always-posture history: frequency approaches 1", () => {
    let model = emptyOpponentModel();
    const events: PostureRevealEvent[] = [];
    for (let r = 1; r <= 10; r = r + 1) {
      events.push({
        kind: "POSTURE_REVEAL",
        round: r,
        constructId: constructId(3),
        posture: "POSTURE",
        squadId: squadId(3),
      });
    }
    model = updateOpponentModel(model, events);
    const f = postureFrequency(model, squadId(3));
    // (10 + 1) / (10 + 1 + 0 + 1) = 11 / 12
    expect(f.numer).toBe(11);
    expect(f.denom).toBe(12);
    expect(observationCount(model, squadId(3))).toBe(10);
  });

  it("adapts to a never-posture history: frequency approaches 0", () => {
    let model = emptyOpponentModel();
    const events: PostureRevealEvent[] = [];
    for (let r = 1; r <= 10; r = r + 1) {
      events.push({
        kind: "POSTURE_REVEAL",
        round: r,
        constructId: constructId(2),
        posture: "FLAT",
        squadId: squadId(2),
      });
    }
    model = updateOpponentModel(model, events);
    const f = postureFrequency(model, squadId(2));
    // (0 + 1) / (0 + 1 + 10 + 1) = 1 / 12
    expect(f.numer).toBe(1);
    expect(f.denom).toBe(12);
  });

  it("keeps rates non-extreme across a neutral (short/balanced) history", () => {
    let model = emptyOpponentModel();
    model = updateOpponentModel(model, [
      { kind: "POSTURE_REVEAL", round: 1, constructId: constructId(4), posture: "POSTURE", squadId: squadId(4) },
      { kind: "POSTURE_REVEAL", round: 2, constructId: constructId(4), posture: "FLAT", squadId: squadId(4) },
    ]);
    const f = postureFrequency(model, squadId(4));
    // (1 + 1) / (1 + 1 + 1 + 1) = 2 / 4 — exactly 50%
    expect(f.numer * 2).toBe(f.denom);
  });

  it("no update before reveal: non-POSTURE_REVEAL events do not shift counts", () => {
    let model = emptyOpponentModel();
    const events: Event[] = [
      { kind: "DAMAGE_APPLIED", round: 1, targetId: constructId(0), damage: 3 },
      { kind: "DIAL_ADVANCED", round: 1, constructId: constructId(0), from: 0, to: 3 },
      { kind: "TRACE_DAMAGE", round: 4, constructId: constructId(1), damage: 2, stepIndex: 0, safeRegionRound: 4 },
    ];
    model = updateOpponentModel(model, events);
    for (let sq = 0; sq < 5; sq = sq + 1) {
      expect(observationCount(model, squadId(sq))).toBe(0);
    }
  });

  it("per-squad isolation: one squad's observations do not shift another's frequency", () => {
    let model = emptyOpponentModel();
    model = updateOpponentModel(model, [
      { kind: "POSTURE_REVEAL", round: 1, constructId: constructId(1), posture: "POSTURE", squadId: squadId(1) },
      { kind: "POSTURE_REVEAL", round: 1, constructId: constructId(1), posture: "POSTURE", squadId: squadId(1) },
    ]);
    const f1 = postureFrequency(model, squadId(1));
    const f2 = postureFrequency(model, squadId(2));
    expect(f2.numer).toBe(1);
    expect(f2.denom).toBe(2);
    expect(f1.numer).toBeGreaterThan(f2.numer);
  });
});

describe("ai/policy Tier 2 / attack policy adapts to model", () => {
  it("prefers called shots more often when target usually postures than when it usually goes flat", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 5);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier2-adapt"), "ai.squad0.attack");

    // Always-posture model for squad 1 (the opponent).
    let alwaysPost = emptyOpponentModel();
    const posEvents: Event[] = [];
    for (let r = 1; r <= 6; r = r + 1) {
      posEvents.push({
        kind: "POSTURE_REVEAL",
        round: r,
        constructId: constructId(1),
        posture: "POSTURE",
        squadId: squadId(1),
      });
    }
    alwaysPost = updateOpponentModel(alwaysPost, posEvents);

    // Always-flat model for squad 1.
    let alwaysFlat = emptyOpponentModel();
    const flatEvents: Event[] = [];
    for (let r = 1; r <= 6; r = r + 1) {
      flatEvents.push({
        kind: "POSTURE_REVEAL",
        round: r,
        constructId: constructId(1),
        posture: "FLAT",
        squadId: squadId(1),
      });
    }
    alwaysFlat = updateOpponentModel(alwaysFlat, flatEvents);

    const rPost = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(50), 2, alwaysPost);
    const rFlat = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(50), 2, alwaysFlat);
    expect(rPost.ok && rFlat.ok).toBe(true);
    if (!rPost.ok || !rFlat.ok) return;
    // Against a posturing enemy: normal shot does 0 damage → called shot's
    // marginal upgrade is very high, called rate should be maximal.
    // Against a flat enemy: normal shot does full damage → called shot's
    // marginal upgrade is smaller (only +50%).
    const postCalled = rPost.value.choice.attacks.filter((a) => a.called).length;
    const flatCalled = rFlat.value.choice.attacks.filter((a) => a.called).length;
    expect(postCalled).toBeGreaterThanOrEqual(flatCalled);
  });

  it("produces a legal SquadAttackPlot in Tier 2 as well", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier2-legal"), "ai.squad0.attack");
    const model = emptyOpponentModel();
    const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(50), 2, model);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const violations = legalAttackPlot(ready, squadId(0), r.value.choice);
    expect(violations).toEqual([]);
  });

  it("respects node budget — Tier 2 truncates exactly", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier2-budget"), "ai.squad0.attack");
    const model = emptyOpponentModel();
    for (const bud of [1, 2, 3, 5, 10]) {
      const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(bud), 2, model);
      expect(r.ok, `budget ${bud}`).toBe(true);
      if (!r.ok) continue;
      expect(r.value.diagnostics.nodesVisited, `budget ${bud}`).toBeLessThanOrEqual(bud);
    }
  });

  it("deterministic across repeated calls with identical rng / model / state", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng1 = stream(rngFromSeed("det-tier2"), "ai.squad0.attack");
    const rng2 = stream(rngFromSeed("det-tier2"), "ai.squad0.attack");
    let model = emptyOpponentModel();
    model = updateOpponentModel(model, [
      { kind: "POSTURE_REVEAL", round: 1, constructId: constructId(1), posture: "POSTURE", squadId: squadId(1) },
    ]);
    const a = aiAttackPlot(view, squadId(0), config.catalog, rng1, testAiWeights, nodeBudget(50), 2, model);
    const b = aiAttackPlot(view, squadId(0), config.catalog, rng2, testAiWeights, nodeBudget(50), 2, model);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.value.choice)).toBe(JSON.stringify(b.value.choice));
    expect(a.value.rng).toEqual(b.value.rng);
  });
});

describe("ai/search / bestOf and topK", () => {
  it("bestOf returns the highest-scoring item with stable seeded tiebreak", () => {
    const items = [10, 20, 30, 30, 40, 40] as const;
    const rng = stream(rngFromSeed("best"), "test");
    const r = bestOf(items, (x) => x, rng);
    expect(r.best?.item).toBe(40);
  });

  it("topK returns the top-k items in descending composite-score order", () => {
    const items = [1, 5, 3, 5, 8, 2, 7] as const;
    const rng = stream(rngFromSeed("topk"), "test");
    const r = topK(items, (x) => x, 3, rng);
    // Highest scores 8, 7, then 5 (either of the two ties).
    expect(r.beam.length).toBe(3);
    expect(r.beam[0]?.item).toBe(8);
    expect(r.beam[1]?.item).toBe(7);
    expect(r.beam[2]?.item).toBe(5);
  });

  it("topK truncates when k is larger than input", () => {
    const items = [1, 2] as const;
    const rng = stream(rngFromSeed("topk-small"), "test");
    const r = topK(items, (x) => x, 10, rng);
    expect(r.beam.length).toBe(2);
  });
});
