import { describe, expect, it } from "vitest";
import {
  createMatch,
  SQUAD_COUNT,
  constructsOfSquad,
  getConstruct,
  squadId,
} from "../../../src/engine/match/index";
import type { Roster } from "../../../src/engine/build/index";
import {
  pairMatchConfig,
  soloMatchConfig,
  testCatalog,
} from "../../fixtures/matches/simple-match";

describe("match/state / createMatch", () => {
  it("builds a five-squad match with the correct construct roster", () => {
    const config = soloMatchConfig();
    const result = createMatch(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.value;
    expect(state.phase).toBe("DEPLOYMENT");
    expect(state.round).toBe(0);
    expect(state.squads).toHaveLength(SQUAD_COUNT);
    expect(state.constructs).toHaveLength(SQUAD_COUNT); // one per solo squad
    for (let i = 0; i < SQUAD_COUNT; i = i + 1) {
      const owns = constructsOfSquad(state, squadId(i));
      expect(owns).toHaveLength(1);
    }
    // Digest reflects the catalog hashes.
    expect(state.config.catalogHash).toEqual(config.catalog.hashes.catalog);
    expect(state.config.tunablesHash).toEqual(config.catalog.hashes.tunables);
  });

  it("assigns construct ids in squad-major, roster-index order", () => {
    const config = pairMatchConfig();
    const result = createMatch(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 5 squads × 2 constructs = ids 0..9; squad k owns 2k and 2k+1.
    for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
      const owns = constructsOfSquad(result.value, squadId(sq));
      expect(owns.map((c) => c.id as number)).toEqual([sq * 2, sq * 2 + 1]);
    }
    // getConstruct works by binary search.
    const found = getConstruct(result.value, 6 as never);
    expect(found).toBeDefined();
    expect(found?.squadId as number).toBe(3);
  });

  it("reports an illegal roster with FR-tagged violations", () => {
    const catalog = testCatalog();
    const bad: Roster = { constructs: [] };
    const config = {
      seed: "bad",
      budget: 25 as never,
      aiTier: 1,
      catalog,
      map: soloMatchConfig().map,
      rosters: [bad, bad, bad, bad, bad] as never,
    };
    const result = createMatch(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.some((v) => v.rule === "FR-4" && v.kind === "EMPTY_ROSTER")).toBe(true);
  });

  it("rejects rosters that violate budget", () => {
    // 25 budget with a 29-cost pair roster is over budget.
    const catalog = testCatalog();
    const pair: Roster = {
      constructs: [
        { chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] },
        { chassisCode: 10 as never, commanderCode: null, mounts: [] },
      ],
    };
    const config = {
      seed: "over",
      budget: 25 as never,
      aiTier: 1,
      catalog,
      map: soloMatchConfig().map,
      rosters: [pair, pair, pair, pair, pair] as never,
    };
    const result = createMatch(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.some((v) => v.rule === "FR-4" && v.kind === "OVER_BUDGET")).toBe(true);
  });

  it("state is JSON-safe (structuredClone round-trips)", () => {
    const config = soloMatchConfig();
    const result = createMatch(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cloned = structuredClone(result.value);
    expect(cloned).toEqual(result.value);
  });
});
