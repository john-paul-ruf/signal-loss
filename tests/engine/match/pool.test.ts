import { describe, expect, it } from "vitest";
import type { MatchState } from "../../../src/engine/match/index";
import { poolFor, squadId } from "../../../src/engine/match/index";
import {
  makeDeployedSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

function withCommanderDead(state: MatchState): MatchState {
  const squads = state.squads.map((s, i) =>
    i === 0 ? { ...s, commanderDead: true, commanderDeathRound: 1 } : s,
  ) as unknown as MatchState["squads"];
  return { ...state, squads };
}

describe("match/pool / poolFor", () => {
  it("returns the FR-17 breakdown for a healthy commander squad", () => {
    const catalog = soloMatchConfig().catalog;
    const state = makeDeployedSoloMatch();
    const p = poolFor(state, squadId(0), catalog);
    // Solo match: 1 alive construct (the commander). CIPHER has base 1,
    // ladder [3, 4, 6, 8] at dial index 0 → R = 3. floor(1/3) = 0.
    expect(p.total).toBe(1 + 1 + 0);
    expect(p.terms[0]).toEqual({ kind: "BASE", value: 1 });
    expect(p.terms[1]).toEqual({ kind: "COMMANDER", value: 1 });
    expect(p.terms[2]).toEqual({ kind: "UNITS", alive: 1, divisor: 3, value: 0 });
    expect(p.commanderLost).toBe(false);
  });

  it("collapses to 1 when commanderDead is set", () => {
    const catalog = soloMatchConfig().catalog;
    const state = withCommanderDead(makeDeployedSoloMatch());
    const p = poolFor(state, squadId(0), catalog);
    expect(p.total).toBe(1);
    expect(p.terms[1].value).toBe(0);
    expect(p.terms[2].value).toBe(0);
    expect(p.commanderLost).toBe(true);
  });

  it("uses the last ladder entry for a wounded commander past ladder length", () => {
    const catalog = soloMatchConfig().catalog;
    const base = makeDeployedSoloMatch();
    // Advance sq 0's commander to a dial index past ladder length (4).
    const constructs = base.constructs.map((c) =>
      (c.squadId as number) === 0 ? { ...c, dialIndex: 6 } : c,
    );
    const state = { ...base, constructs };
    const p = poolFor(state, squadId(0), catalog);
    // CIPHER ladder [3,4,6,8] → last is 8. Alive still 1 → floor(1/8) = 0.
    expect(p.terms[2].divisor).toBe(8);
  });
});
