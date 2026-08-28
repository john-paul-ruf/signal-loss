import { describe, expect, it } from "vitest";
import { aiDeploy, nodeBudget } from "../../../src/engine/ai/index";
import { rngFromSeed, stream } from "../../../src/engine/rng/index";
import {
  applyDeployments,
  createMatch,
  legalDeployment,
  squadId,
} from "../../../src/engine/match/index";
import { publicView } from "../../../src/engine/view/index";
import { soloMatchConfig, pairMatchConfig } from "../../fixtures/matches/simple-match";
import { testAiWeights } from "../../fixtures/ai/tunables";

describe("ai/deploy / aiDeploy", () => {
  it("produces one legal placement per solo squad — legalDeployment passes", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.value;
    const view = publicView(state, squadId(2), config.catalog);
    const rng = stream(rngFromSeed("deploy-solo"), "ai.squad2.deploy");
    const result = aiDeploy(view, squadId(2), config.catalog, rng, testAiWeights, nodeBudget(8));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.choice.length).toBe(1);
    const violations = legalDeployment(state, squadId(2), result.value.choice, config.catalog);
    expect(violations).toEqual([]);
  });

  it("produces placements for every construct in a pair match", () => {
    const config = pairMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.value;
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const view = publicView(state, squadId(sq), config.catalog);
      const rng = stream(rngFromSeed(`deploy-pair-${sq}`), `ai.squad${sq}.deploy`);
      const result = aiDeploy(view, squadId(sq), config.catalog, rng, testAiWeights, nodeBudget(8));
      expect(result.ok, `squad ${sq}`).toBe(true);
      if (!result.ok) continue;
      expect(result.value.choice.length).toBe(2);
      const violations = legalDeployment(state, squadId(sq), result.value.choice, config.catalog);
      expect(violations, `squad ${sq} violations`).toEqual([]);
    }
  });

  it("full applyDeployments succeeds when every squad uses aiDeploy", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.value;
    const placements: unknown[] = [];
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const view = publicView(state, squadId(sq), config.catalog);
      const rng = stream(rngFromSeed(`deploy-all-${sq}`), `ai.squad${sq}.deploy`);
      const result = aiDeploy(view, squadId(sq), config.catalog, rng, testAiWeights, nodeBudget(6));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      placements.push(result.value.choice);
    }
    const applied = applyDeployments(
      state,
      placements as never,
      config.catalog,
    );
    expect(applied.ok).toBe(true);
  });

  it("is deterministic for the same seed / squad / state / weights", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const view = publicView(created.value, squadId(1), config.catalog);
    const rng1 = stream(rngFromSeed("determ-deploy"), "ai.squad1.deploy");
    const rng2 = stream(rngFromSeed("determ-deploy"), "ai.squad1.deploy");
    const a = aiDeploy(view, squadId(1), config.catalog, rng1, testAiWeights, nodeBudget(10));
    const b = aiDeploy(view, squadId(1), config.catalog, rng2, testAiWeights, nodeBudget(10));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.value.choice)).toBe(JSON.stringify(b.value.choice));
    expect(a.value.rng).toEqual(b.value.rng);
  });

  it("advances the rng", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const view = publicView(created.value, squadId(0), config.catalog);
    const rng = stream(rngFromSeed("advance-deploy"), "ai.squad0.deploy");
    const result = aiDeploy(view, squadId(0), config.catalog, rng, testAiWeights, nodeBudget(5));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.value.rng)).not.toBe(JSON.stringify(rng));
  });

  it("emits diagnostics with nodesVisited > 0 and selectedIds populated", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const view = publicView(created.value, squadId(4), config.catalog);
    const rng = stream(rngFromSeed("diag-deploy"), "ai.squad4.deploy");
    const result = aiDeploy(view, squadId(4), config.catalog, rng, testAiWeights, nodeBudget(4));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diagnostics.nodesVisited).toBeGreaterThan(0);
    expect(result.value.diagnostics.selectedIds.length).toBe(result.value.choice.length);
  });
});
