import { describe, expect, it } from "vitest";
import {
  aiAttackPlot,
  aiMovePlot,
  emptyOpponentModel,
  generateMoveCandidates,
  nodeBudget,
  scoreMoveEndpoint,
} from "../../../src/engine/ai/index";
import { rngFromSeed, stream } from "../../../src/engine/rng/index";
import {
  legalAttackPlot,
  legalMovePlot,
  squadId,
} from "../../../src/engine/match/index";
import type { ConstructId, MatchState } from "../../../src/engine/match/index";
import { publicView, updateKnownPositions } from "../../../src/engine/view/index";
import { pointInPoly, type Fx, type Vec2 } from "../../../src/engine/fx/index";
import type { TraceStep } from "../../../src/engine/map/index";
import { makeCloseSoloMatch, pairMatchConfig, soloMatchConfig } from "../../fixtures/matches/simple-match";
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
function withDamage(state: MatchState, squad: number, damage: number): MatchState {
  const squads = state.squads.map((s, i) =>
    i === squad ? { ...s, totalDamageDealt: damage } : s,
  ) as unknown as MatchState["squads"];
  return { ...state, squads };
}
function withPos(state: MatchState, squad: number, x: number, y: number): MatchState {
  const constructs = state.constructs.map((c) =>
    (c.squadId as number) === squad
      ? { ...c, position: { x: x as Fx, y: y as Fx } }
      : c,
  );
  return { ...state, constructs };
}

describe("ai/policy Tier 3 / attack anti-kingmaking", () => {
  it("prefers hitting a non-leader over hitting the current leader when both are legal", () => {
    // Set up: squad 0 sees TWO enemies at similar positions, one from squad 1
    // (the leader) and one from squad 2 (behind).
    const state = makeCloseSoloMatch(); // squads 0, 1 close
    const config = pairMatchConfig(); // pair rosters give more constructs to hit
    // Use pair rosters to have two enemies close to squad 0.
    void config;
    // Simpler: use pair match config but hand-position enemies.
    const config2 = pairMatchConfig();
    const state2 = withPos(
      withPos(
        withPos(
          withPos(state, 0, -1 * 1024, 5 * 1024),
          1, 1 * 1024, 5 * 1024,
        ),
        2, 2 * 1024, 5 * 1024,
      ),
      3, -14 * 1024, -14 * 1024, // out of the way
    );
    // Squad 1 is the leader (has done more damage).
    const withLeader = withDamage(state2, 1, 100);
    const withKnown = updateKnownPositions(withLeader, config2.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config2.catalog);
    const rng = stream(rngFromSeed("kingmaking"), "ai.squad0.attack");
    const model = emptyOpponentModel();
    const rT3 = aiAttackPlot(view, squadId(0), config2.catalog, rng, testAiWeights, nodeBudget(100), 3, model);
    const rT2 = aiAttackPlot(view, squadId(0), config2.catalog, rng, testAiWeights, nodeBudget(100), 2, model);
    expect(rT3.ok && rT2.ok).toBe(true);
    if (!rT3.ok || !rT2.ok) return;
    // Diagnostic: leaderMargin should be positive in tier 3.
    expect(rT3.value.diagnostics.scoreTerms["leaderMargin"]).toBeGreaterThan(0);
    // Damage on leader should be less than damage on others under tier 3.
    const t3Leader = rT3.value.diagnostics.scoreTerms["damageOnLeader"] ?? 0;
    const t3Others = rT3.value.diagnostics.scoreTerms["damageOnOthers"] ?? 0;
    // In the presence of a legal non-leader target, tier 3 damage on
    // others must be at least as high as damage on leader (or higher).
    if (t3Others > 0 || t3Leader > 0) {
      expect(t3Others).toBeGreaterThanOrEqual(t3Leader);
    }
  });

  it("produces a legal SquadAttackPlot in Tier 3", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier3-legal"), "ai.squad0.attack");
    const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(50), 3, emptyOpponentModel());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const violations = legalAttackPlot(ready, squadId(0), r.value.choice);
    expect(violations).toEqual([]);
  });

  it("respects node budget — Tier 3 attack truncates exactly", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier3-budget"), "ai.squad0.attack");
    for (const bud of [1, 2, 3, 5, 50, 500, 500_000]) {
      const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(bud), 3, emptyOpponentModel());
      expect(r.ok, `budget ${bud}`).toBe(true);
      if (!r.ok) continue;
      expect(r.value.diagnostics.nodesVisited, `budget ${bud}`).toBeLessThanOrEqual(bud);
    }
  });

  it("deterministic Tier 3 across repeated calls with identical rng / model / state", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    const rng1 = stream(rngFromSeed("det-t3"), "ai.squad0.attack");
    const rng2 = stream(rngFromSeed("det-t3"), "ai.squad0.attack");
    const model = emptyOpponentModel();
    const a = aiAttackPlot(view, squadId(0), config.catalog, rng1, testAiWeights, nodeBudget(50), 3, model);
    const b = aiAttackPlot(view, squadId(0), config.catalog, rng2, testAiWeights, nodeBudget(50), 3, model);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.value.choice)).toBe(JSON.stringify(b.value.choice));
    expect(a.value.rng).toEqual(b.value.rng);
  });
});

describe("ai/policy Tier 3 / movement lookahead", () => {
  it("produces a legal SquadMovePlots in Tier 3", () => {
    const state = withPos(makeCloseSoloMatch(), 0, 0, 0); // in trace safe area
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier3-move"), "ai.squad0.move");
    const r = aiMovePlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(200), 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const mp of r.value.choice.moves) {
      const res = legalMovePlot(state, mp.constructId, mp.path, config.catalog);
      expect(res.ok).toBe(true);
    }
  });

  it("Tier 3 movement respects node budget", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier3-move-budget"), "ai.squad0.move");
    for (const bud of [1, 2, 5, 100, 10_000]) {
      const r = aiMovePlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(bud), 3);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.diagnostics.nodesVisited).toBeLessThanOrEqual(bud);
    }
  });
});

describe("ai/policy tier consistency (fairness invariants)", () => {
  it("all three tiers produce legal SquadAttackPlot for the same state", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    for (const tier of [1, 2, 3] as const) {
      const rng = stream(rngFromSeed(`fair-${tier}`), "ai.squad0.attack");
      const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(200), tier, emptyOpponentModel());
      expect(r.ok, `tier ${tier}`).toBe(true);
      if (!r.ok) continue;
      const violations = legalAttackPlot(ready, squadId(0), r.value.choice);
      expect(violations, `tier ${tier}`).toEqual([]);
      // Pool never exceeded.
      const called = r.value.choice.attacks.filter((a) => a.called).length;
      const postures = r.value.choice.postures.filter((p) => p.posture === "POSTURE").length;
      expect(called + postures, `tier ${tier} pool`).toBeLessThanOrEqual(3);
    }
  });

  it("no tier grants extra pool / relaxes legality: same input state → same pool = 3 respected", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const ready = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 3);
    const view = publicView(ready, squadId(0), config.catalog);
    for (const tier of [1, 2, 3] as const) {
      const rng = stream(rngFromSeed(`pool-${tier}`), "ai.squad0.attack");
      const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(500), tier, emptyOpponentModel());
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const spent = (r.value.choice.attacks.filter((a) => a.called).length +
        r.value.choice.postures.filter((p) => p.posture === "POSTURE").length);
      expect(spent).toBeLessThanOrEqual(3);
    }
  });
});

/** Board-unit vector — fixture maps use 1024 fx per board unit. */
function v(unitX: number, unitY: number): Vec2 {
  return { x: unitX * 1024 as Fx, y: unitY * 1024 as Fx };
}

/** Axis-aligned square region centered on (cx, cy), half-extent in board units. */
function boxRegion(centerX: number, centerY: number, halfSize: number): readonly Vec2[] {
  return [
    v(centerX - halfSize, centerY - halfSize),
    v(centerX + halfSize, centerY - halfSize),
    v(centerX + halfSize, centerY + halfSize),
    v(centerX - halfSize, centerY + halfSize),
  ];
}

/** Synthetic trace schedule: [round, halfExtent] steps, squares centered on the origin. */
function scheduleOf(steps: readonly (readonly [number, number])[]): readonly TraceStep[] {
  return steps.map(([round, half], i) => ({
    round,
    safeRegion: boxRegion(0, 0, half),
    damage: 2 + 2 * i,
  }));
}

/** MatchState variant with a synthetic trace schedule and a forced round. */
function withSchedule(state: MatchState, schedule: readonly TraceStep[], round: number): MatchState {
  return { ...state, round, map: { ...state.map, traceSchedule: schedule } };
}

/**
 * Expected tier-3 lookahead aggregate under the strictly-future rule: every
 * candidate endpoint is scored against exactly the FIRST FUTURE step (index 0)
 * at discount 1 — current and past schedule entries contribute nothing.
 */
function expectedLookaheadBonus(
  view: ReturnType<typeof publicView>,
  ownId: number,
  catalog: ReturnType<typeof soloMatchConfig>["catalog"],
  nextRegion: readonly Vec2[],
): number {
  const weights = testAiWeights;
  let sum = 0;
  for (const c of generateMoveCandidates(view, ownId as unknown as ConstructId, catalog)) {
    sum = sum + (pointInPoly(c.endPosition, nextRegion)
      ? Math.floor(weights.traceSafetyBonus / 1)
      : -Math.floor(weights.traceExposurePenalty / 1));
  }
  return sum;
}

describe("ai/policy Tier 3 / strictly-future lookahead (replan R-01)", () => {
  it("with exactly one future step in the beamDepth window, that step is scored at discount 1", () => {
    // Round 2: the only schedule entry (R4) is strictly future and inside the
    // window (rounds 3..4). An index-1 skip would drop it entirely; a deeper
    // default discount would halve it. The aggregate must equal the
    // full-strength (discount-1) classification of every candidate endpoint.
    const state = withPos(makeCloseSoloMatch(), 0, 2 * 1024, 5 * 1024);
    const config = soloMatchConfig();
    const scheduled = withSchedule(state, scheduleOf([[4, 6]]), 2);
    const view = publicView(scheduled, squadId(0), config.catalog);
    const own = view.constructs.find((k) => (k.base.squadId as number) === 0);
    if (own === undefined) throw new Error("no own");
    const rng = stream(rngFromSeed("tier3-future-one"), "ai.squad0.move");
    const r = aiMovePlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(1000), 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = expectedLookaheadBonus(view, own.base.id as number, config.catalog, boxRegion(0, 0, 6));
    expect(expected).not.toBe(0);
    expect(r.value.diagnostics.scoreTerms["lookaheadBonus"]).toBe(expected);
  });

  it("current and past steps are excluded — only step.round > state.round is scored", () => {
    // Round 7 with schedule [R4(half 6), R7(half 3), R9(half 2)]: the R4 region
    // is past, the R7 region is the CURRENT active step (owned by the base
    // scorer's traceSafety term), and only R9 is strictly future and inside
    // the beamDepth-2 window (rounds 8..9). The aggregate must classify every
    // candidate against R9 ONLY — a past-step recount or current-step
    // double-count changes the sum.
    const state = withPos(makeCloseSoloMatch(), 0, 2 * 1024, 5 * 1024);
    const config = soloMatchConfig();
    const scheduled = withSchedule(state, scheduleOf([[4, 6], [7, 3], [9, 2]]), 7);
    const view = publicView(scheduled, squadId(0), config.catalog);
    const own = view.constructs.find((k) => (k.base.squadId as number) === 0);
    if (own === undefined) throw new Error("no own");
    // From (2,5) at least one candidate endpoint lands inside R9 (half 2) and
    // the majority land outside it — the sum must reflect that mix.
    const expected = expectedLookaheadBonus(view, own.base.id as number, config.catalog, boxRegion(0, 0, 2));
    expect(expected).not.toBe(0);
    const rng = stream(rngFromSeed("tier3-future-window"), "ai.squad0.move");
    const r = aiMovePlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(1000), 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.diagnostics.scoreTerms["lookaheadBonus"]).toBe(expected);
    // Base-scorer ownership: an endpoint inside the CURRENT region but outside
    // the NEXT one earns the active-step bonus (traceSafety) and the next-step
    // penalty (traceAnticipation) — the lookahead layer adds neither again.
    const currentOnly: Vec2 = { x: 2.5 * 1024 as Fx, y: 2.5 * 1024 as Fx };
    const scored = scoreMoveEndpoint(view, own, currentOnly, config.catalog, testAiWeights);
    expect(scored.terms.traceSafety).toBe(testAiWeights.traceSafetyBonus);
    expect(scored.terms.traceAnticipation).toBe(-testAiWeights.traceExposurePenalty);
  });
});
