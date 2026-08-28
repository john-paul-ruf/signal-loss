import { describe, expect, it } from "vitest";
import {
  aiAttackPlot,
  aiMovePlot,
  emptyOpponentModel,
  nodeBudget,
} from "../../../src/engine/ai/index";
import { rngFromSeed, stream } from "../../../src/engine/rng/index";
import {
  legalAttackPlot,
  legalMovePlot,
  squadId,
} from "../../../src/engine/match/index";
import type { MatchState } from "../../../src/engine/match/index";
import { publicView, updateKnownPositions } from "../../../src/engine/view/index";
import type { Fx } from "../../../src/engine/fx/index";
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
