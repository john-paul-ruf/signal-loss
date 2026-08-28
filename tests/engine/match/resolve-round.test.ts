import { describe, expect, it } from "vitest";
import {
  constructsOfSquad,
  hashState,
  resolveAttackPhase,
  resolveMovementPhase,
  resolveRound,
  sortEventsCanonical,
  squadId,
} from "../../../src/engine/match/index";
import type {
  AttackPlot,
  MatchState,
  SquadAttackPlot,
  SquadMovePlots,
  SquadPlots,
} from "../../../src/engine/match/index";
import {
  makeCloseSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

function emptyMovePlots(): [SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots] {
  return [
    { squadId: squadId(0), moves: [] },
    { squadId: squadId(1), moves: [] },
    { squadId: squadId(2), moves: [] },
    { squadId: squadId(3), moves: [] },
    { squadId: squadId(4), moves: [] },
  ];
}

function emptyAttackPlots(): [SquadAttackPlot, SquadAttackPlot, SquadAttackPlot, SquadAttackPlot, SquadAttackPlot] {
  return [
    { squadId: squadId(0), attacks: [], postures: [] },
    { squadId: squadId(1), attacks: [], postures: [] },
    { squadId: squadId(2), attacks: [], postures: [] },
    { squadId: squadId(3), attacks: [], postures: [] },
    { squadId: squadId(4), attacks: [], postures: [] },
  ];
}

function fullPlots(): [SquadPlots, SquadPlots, SquadPlots, SquadPlots, SquadPlots] {
  return [
    { squadId: squadId(0), moves: [], attacks: [], postures: [] },
    { squadId: squadId(1), moves: [], attacks: [], postures: [] },
    { squadId: squadId(2), moves: [], attacks: [], postures: [] },
    { squadId: squadId(3), moves: [], attacks: [], postures: [] },
    { squadId: squadId(4), moves: [], attacks: [], postures: [] },
  ];
}

describe("match/resolve-round / resolveMovementPhase + resolveAttackPhase compose", () => {
  it("resolveRound == resolveMovementPhase then resolveAttackPhase", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const move = resolveMovementPhase(state, emptyMovePlots(), catalog);
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    const attack = resolveAttackPhase(move.value.state, emptyAttackPlots(), catalog);
    expect(attack.ok).toBe(true);
    if (!attack.ok) return;

    const round = resolveRound(state, fullPlots(), catalog);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(hashState(round.value.state)).toBe(hashState(attack.value.state));
    expect(sortEventsCanonical(round.value.events)).toEqual(
      sortEventsCanonical(move.value.events.concat(attack.value.events)),
    );
  });

  it("advances round from 1 to 2 with refill events", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const round = resolveRound(state, fullPlots(), catalog);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.value.state.round).toBe(2);
    expect(round.value.state.phase).toBe("MOVEMENT_PLOT");
    const refills = round.value.events.filter((e) => e.kind === "POOL_REFILL");
    expect(refills.length).toBe(5);
  });
});

describe("match/resolve-round / permutation invariance across a full round", () => {
  it("byte-identical hashState + canonical events over squad plot permutations", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const a0 = constructsOfSquad(state, squadId(0))[0]!;
    const a1 = constructsOfSquad(state, squadId(1))[0]!;
    const withPools: MatchState = {
      ...state,
      squads: state.squads.map((s) => ({ ...s, poolTotal: 3 })) as unknown as MatchState["squads"],
    };
    const plotsBase = fullPlots();
    plotsBase[0] = {
      squadId: squadId(0),
      moves: [],
      attacks: [{ constructId: a0.id, targetId: a1.id, called: true } as AttackPlot],
      postures: [],
    };
    plotsBase[1] = {
      squadId: squadId(1),
      moves: [],
      attacks: [{ constructId: a1.id, targetId: a0.id, called: false }],
      postures: [{ constructId: a1.id, posture: "POSTURE" }],
    };

    const perms: number[][] = [];
    const p = (a: number[], k: number) => {
      if (k === a.length) {
        perms.push(a.slice());
        return;
      }
      for (let i = k; i < a.length; i = i + 1) {
        [a[k], a[i]] = [a[i] as number, a[k] as number];
        p(a, k + 1);
        [a[k], a[i]] = [a[i] as number, a[k] as number];
      }
    };
    p([0, 1, 2, 3, 4], 0);

    let refHash: string | null = null;
    for (const perm of perms) {
      const shuffled = perm.map((i) => plotsBase[i]) as unknown as typeof plotsBase;
      const r = resolveRound(withPools, shuffled, catalog);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const h = hashState(r.value.state);
      if (refHash === null) refHash = h;
      else expect(h).toBe(refHash);
    }
  });
});

describe("match/resolve-round / human elimination ends the match", () => {
  it("MATCH_COMPLETE with reason HUMAN_ELIMINATED", () => {
    const catalog = soloMatchConfig().catalog;
    const base = makeCloseSoloMatch();
    // Force sq 0's construct to dialIndex = last state (destroyed by any advance).
    const constructs = base.constructs.map((c) =>
      (c.squadId as number) === 0 ? { ...c, dialIndex: 4 } : c,
    );
    const state: MatchState = {
      ...base,
      constructs,
      squads: base.squads.map((s) => ({ ...s, poolTotal: 3 })) as unknown as MatchState["squads"],
    };
    const a0 = constructsOfSquad(state, squadId(0))[0]!;
    const a1 = constructsOfSquad(state, squadId(1))[0]!;
    const plots = fullPlots();
    plots[1] = {
      squadId: squadId(1),
      moves: [],
      attacks: [{ constructId: a1.id, targetId: a0.id, called: false }],
      postures: [],
    };
    const r = resolveRound(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state.phase).toBe("COMPLETE");
    const complete = r.value.events.find((e) => e.kind === "MATCH_COMPLETE");
    expect(complete).toBeDefined();
    if (complete?.kind === "MATCH_COMPLETE") {
      expect(complete.reason).toBe("HUMAN_ELIMINATED");
    }
  });
});
