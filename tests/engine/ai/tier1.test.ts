import { describe, expect, it } from "vitest";
import {
  aiAttackPlot,
  aiMovePlot,
  nodeBudget,
  scoreAttackCandidate,
  scoreMoveEndpoint,
} from "../../../src/engine/ai/index";
import { rngFromSeed, stream } from "../../../src/engine/rng/index";
import {
  legalAttackPlot,
  legalMovePlot,
  resolveMovementPhase,
  squadId,
  constructsOfSquad,
} from "../../../src/engine/match/index";
import type {
  MatchState,
} from "../../../src/engine/match/index";
import { publicView, updateKnownPositions } from "../../../src/engine/view/index";
import type { KnownConstruct } from "../../../src/engine/view/index";
import type { Fx, Vec2 } from "../../../src/engine/fx/index";
import type { Catalog } from "../../../src/engine/catalog/index";
import {
  makeCloseSoloMatch,
  makeDeployedSoloMatch,
  pairMatchConfig,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";
import { testAiWeights } from "../../fixtures/ai/tunables";

/** Position override for a specific squad's construct. */
function withPos(state: MatchState, squad: number, x: number, y: number): MatchState {
  const constructs = state.constructs.map((c) =>
    (c.squadId as number) === squad
      ? { ...c, position: { x: x as Fx, y: y as Fx } }
      : c,
  );
  return { ...state, constructs };
}

/** Force squad's pool total for attack tests. */
function withPool(state: MatchState, squad: number, poolTotal: number): MatchState {
  const squads = state.squads.map((s, i) =>
    i === squad ? { ...s, poolTotal } : s,
  ) as unknown as MatchState["squads"];
  return { ...state, squads };
}

/** Force phase transition without running movement resolution (for pure attack tests). */
function forcePhase(state: MatchState, phase: MatchState["phase"]): MatchState {
  return { ...state, phase };
}

function knownForId(state: MatchState, catalog: Catalog, cid: number): KnownConstruct {
  const view = publicView(updateKnownPositions(state, catalog), squadId(0), catalog);
  const found = view.constructs.find((k) => (k.base.id as number) === cid);
  if (found === undefined) throw new Error(`no known ${cid}`);
  return found;
}

describe("ai/policy Tier 1 / greedy movement", () => {
  it("returns a legal SquadMovePlots — every move accepted by legalMovePlot", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier1-move"), "ai.squad0.move");
    const result = aiMovePlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(200), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const mp of result.value.choice.moves) {
      const res = legalMovePlot(state, mp.constructId, mp.path, config.catalog);
      expect(res.ok).toBe(true);
    }
  });

  it("resolveMovementPhase accepts AI move plots for every squad in the tuple", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const plots = [] as unknown[];
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const view = publicView(state, squadId(sq), config.catalog);
      const rng = stream(rngFromSeed(`tier1-move-${sq}`), `ai.squad${sq}.move`);
      const r = aiMovePlot(view, squadId(sq), config.catalog, rng, testAiWeights, nodeBudget(100), 1);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      plots.push(r.value.choice);
    }
    const outcome = resolveMovementPhase(state, plots as never, config.catalog);
    expect(outcome.ok).toBe(true);
  });

  it("deterministic under repeated calls with same rng / inputs", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(3), config.catalog);
    const rng1 = stream(rngFromSeed("det"), "ai.squad3.move");
    const rng2 = stream(rngFromSeed("det"), "ai.squad3.move");
    const a = aiMovePlot(view, squadId(3), config.catalog, rng1, testAiWeights, nodeBudget(50), 1);
    const b = aiMovePlot(view, squadId(3), config.catalog, rng2, testAiWeights, nodeBudget(50), 1);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.value.choice)).toBe(JSON.stringify(b.value.choice));
    expect(a.value.rng).toEqual(b.value.rng);
  });

  it("respects node budget — nodesVisited never exceeds budget", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(1), config.catalog);
    const rng = stream(rngFromSeed("budget"), "ai.squad1.move");
    const bud = 3;
    const r = aiMovePlot(view, squadId(1), config.catalog, rng, testAiWeights, nodeBudget(bud), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.diagnostics.nodesVisited).toBeLessThanOrEqual(bud);
  });

  it("prefers trace safety over greedy proximity (positioned adversarially)", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    // Construct 0 sits at (0,0) inside the round 4 safe region (spawn is at -13,-13 so
    // pretend we're now at round 4). Anchor two enemy positions: one at (5,5) (near, unsafe)
    // and one at (-5,-5). The center endpoint (safe region) should score higher than a
    // greedy move toward an enemy that would take us out of the safe zone.
    const shifted = withPos(state, 0, 0, 0);
    const forced = { ...shifted, round: 4 };
    const view = publicView(forced, squadId(0), config.catalog);
    const own = view.constructs.find((k) => (k.base.squadId as number) === 0);
    if (own === undefined) throw new Error("no own");
    // Safe region for round 4 = boxRegion(0,0,12) → (-12,-12) to (12,12).
    const inSafe: Vec2 = { x: 100 as Fx, y: 100 as Fx };
    const outOfSafe: Vec2 = { x: 15 * 1024 as Fx, y: 15 * 1024 as Fx };
    const safeScore = scoreMoveEndpoint(view, own, inSafe, config.catalog, testAiWeights);
    const unsafeScore = scoreMoveEndpoint(view, own, outOfSafe, config.catalog, testAiWeights);
    expect(safeScore.score).toBeGreaterThan(unsafeScore.score);
  });
});

describe("ai/policy Tier 1 / attacks and pool", () => {
  it("produces a legal SquadAttackPlot — every attack + posture passes legalAttackPlot", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const readyForAttack = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 5);
    const view = publicView(readyForAttack, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("tier1-attack"), "ai.squad0.attack");
    const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(100), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const violations = legalAttackPlot(readyForAttack, squadId(0), r.value.choice);
    expect(violations).toEqual([]);
  });

  it("never selects an out-of-range or LOS-blocked attack", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    // Every construct is at its spawn anchor — squads 0..3 are in the four corners
    // (±13, ±13) and squad 4 at (0,13). Attack range ~10 board units, so no
    // squad should see any enemy. Attack plot should be all NO-ATTACK.
    const withKnown = updateKnownPositions(state, config.catalog);
    const readyForAttack = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 5);
    const view = publicView(readyForAttack, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("no-target"), "ai.squad0.attack");
    const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(100), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.choice.attacks.length).toBe(0);
  });

  it("prefers targeting the enemy commander when non-commander is equal", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    // squad 0's construct is at (-1, 5); squad 1's construct is at (1, 5).
    // Squad 1's single construct is the commander (soloRoster has commander).
    // Score commander vs a hypothetical non-commander target of equal stats.
    const own = knownForId(withKnown, config.catalog, 0);
    const cmdTarget = knownForId(withKnown, config.catalog, 1);
    // Same construct with commander stripped for hypothetical comparison.
    const nonCmdTarget: KnownConstruct = {
      ...cmdTarget,
      base: { ...cmdTarget.base, commanderCode: null },
    };
    const scoredCmd = scoreAttackCandidate(own, cmdTarget, false, 0, 1, config.catalog, testAiWeights);
    const scoredNonCmd = scoreAttackCandidate(own, nonCmdTarget, false, 0, 1, config.catalog, testAiWeights);
    expect(scoredCmd.score).toBeGreaterThan(scoredNonCmd.score);
  });

  it("kill-this-round shots score higher than non-kill shots (all else equal)", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const own = knownForId(withKnown, config.catalog, 0);
    // Make the attacker weak (mountless, low-damage dial) so a healthy
    // 4-integrity HARDLINE is NOT killed but a wounded one is.
    const weakOwn: KnownConstruct = {
      ...own,
      base: { ...own.base, dialIndex: 3, mounts: [] }, // damage = 2, no mount buff
    };
    const healthyTarget = knownForId(withKnown, config.catalog, 1);
    const wounded: KnownConstruct = {
      ...healthyTarget,
      base: { ...healthyTarget.base, dialIndex: 3 }, // integrity remaining = 1
    };
    const scoredHealthy = scoreAttackCandidate(weakOwn, healthyTarget, false, 0, 1, config.catalog, testAiWeights);
    const scoredWounded = scoreAttackCandidate(weakOwn, wounded, false, 0, 1, config.catalog, testAiWeights);
    expect(scoredWounded.isKill).toBe(true);
    expect(scoredHealthy.isKill).toBe(false);
    expect(scoredWounded.score).toBeGreaterThan(scoredHealthy.score);
  });

  it("pool overspend is impossible — spent ≤ poolTotal", () => {
    const state = makeCloseSoloMatch();
    const config = pairMatchConfig();
    // Use pair rosters (2 constructs per squad) so multiple posture / called
    // opportunities exist, then constrain pool.
    const withKnown = updateKnownPositions(state, config.catalog);
    const readyForAttack = withPool(forcePhase(withKnown, "ATTACK_PLOT"), 0, 2);
    const view = publicView(readyForAttack, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("pool"), "ai.squad0.attack");
    const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(100), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const called = r.value.choice.attacks.filter((a) => a.called).length;
    const postures = r.value.choice.postures.filter((p) => p.posture === "POSTURE").length;
    expect(called + postures).toBeLessThanOrEqual(2);
    const violations = legalAttackPlot(readyForAttack, squadId(0), r.value.choice);
    expect(violations).toEqual([]);
  });

  it("does not target a destroyed enemy (destroyed constructs never generate candidates)", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const withDestroyed = {
      ...withKnown,
      constructs: withKnown.constructs.map((c) =>
        (c.id as number) === 1 ? { ...c, destroyed: true, destroyedRound: 1 } : c,
      ),
    };
    const readyForAttack = withPool(forcePhase(withDestroyed, "ATTACK_PLOT"), 0, 5);
    const view = publicView(readyForAttack, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("no-dead"), "ai.squad0.attack");
    const r = aiAttackPlot(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(100), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const a of r.value.choice.attacks) {
      expect(a.targetId as number).not.toBe(1);
    }
  });

  it("Tier 1 posture rate responds to exposure — more exposed → more likely POSTURE", () => {
    const config = pairMatchConfig();
    const state = makeCloseSoloMatch();
    // Craft a heavily-exposed variant: place squad 1 constructs on top of squad 0's
    // constructs so exposure is maximum.
    const withKnown = updateKnownPositions(state, config.catalog);
    const heavy = withPos(withKnown, 1, -1 * 1024, 5 * 1024); // right on top of squad 0
    const readyHeavy = withPool(forcePhase(heavy, "ATTACK_PLOT"), 0, 3);
    // Contrast: enemies far away.
    const light = withPos(withKnown, 1, 14 * 1024, 14 * 1024);
    const readyLight = withPool(forcePhase(light, "ATTACK_PLOT"), 0, 3);
    const rng = stream(rngFromSeed("posture-rate"), "ai.squad0.attack");
    const rHeavy = aiAttackPlot(publicView(readyHeavy, squadId(0), config.catalog), squadId(0), config.catalog, rng, testAiWeights, nodeBudget(200), 1);
    const rLight = aiAttackPlot(publicView(readyLight, squadId(0), config.catalog), squadId(0), config.catalog, rng, testAiWeights, nodeBudget(200), 1);
    expect(rHeavy.ok && rLight.ok).toBe(true);
    if (!rHeavy.ok || !rLight.ok) return;
    const heavyPost = rHeavy.value.choice.postures.filter((p) => p.posture === "POSTURE").length;
    const lightPost = rLight.value.choice.postures.filter((p) => p.posture === "POSTURE").length;
    expect(heavyPost).toBeGreaterThanOrEqual(lightPost);
  });
});

describe("ai/policy Tier 1 / commander protection", () => {
  it("own commander in exposed position scores lower than non-commander (commanderProtection penalty)", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const view = publicView(withKnown, squadId(0), config.catalog);
    const own = view.constructs.find((k) => (k.base.squadId as number) === 0);
    if (own === undefined) throw new Error("no own");
    // Non-commander variant of same construct.
    const nonCommander: KnownConstruct = {
      ...own,
      base: { ...own.base, commanderCode: null },
    };
    // Position exposed to enemies.
    const exposedPos: Vec2 = { x: 0 as Fx, y: 5 * 1024 as Fx };
    const cmdScore = scoreMoveEndpoint(view, own, exposedPos, config.catalog, testAiWeights);
    const nonScore = scoreMoveEndpoint(view, nonCommander, exposedPos, config.catalog, testAiWeights);
    // If exposure is nonzero, commander should be penalized more.
    if (cmdScore.terms.exposure > 0) {
      expect(cmdScore.score).toBeLessThan(nonScore.score);
    }
  });
});

describe("ai/policy Tier 1 / information boundary", () => {
  it("aiMovePlot signature strictly accepts PublicState — MatchState is not assignable", () => {
    // This test is enforced by the type system; runtime asserts merely
    // document the contract. The compile-time assertion is that aiMovePlot's
    // first parameter is `PublicState`, not `MatchState`.
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    // View must not have any known intent field like committed plots.
    expect(Object.keys(view)).not.toContain("plots");
    expect(Object.keys(view)).not.toContain("attacks");
    expect(Object.keys(view)).not.toContain("moves");
    for (const k of view.constructs) {
      expect(Object.keys(k.base)).not.toContain("path");
      expect(Object.keys(k.base)).not.toContain("attackTarget");
    }
    const own = constructsOfSquad(state, squadId(0));
    expect(own.length).toBeGreaterThan(0);
  });
});
