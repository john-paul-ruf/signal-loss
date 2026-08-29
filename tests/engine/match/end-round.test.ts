import { describe, expect, it } from "vitest";
import { fxFromInt } from "../../../src/engine/fx/index";
import type { Vec2 } from "../../../src/engine/fx/index";
import {
  applyTrace,
  applyDestruction,
  advanceRoundAndRefill,
  checkElimination,
  currentTraceStep,
  resolveAttackPhase,
  resolveAttackStage,
  snapshotStartOfRound,
  squadId,
} from "../../../src/engine/match/index";
import type { MatchState, SquadAttackPlot } from "../../../src/engine/match/index";
import { soloMatchConfig, makeCloseSoloMatch, makeDeployedSoloMatch } from "../../fixtures/matches/simple-match";

function v(x: number, y: number): Vec2 {
  return { x: fxFromInt(x), y: fxFromInt(y) };
}

function withRound(state: MatchState, round: number): MatchState {
  return { ...state, round };
}

function emptyAttackPlots(): [
  SquadAttackPlot,
  SquadAttackPlot,
  SquadAttackPlot,
  SquadAttackPlot,
  SquadAttackPlot,
] {
  return [0, 1, 2, 3, 4].map((id) => ({
    squadId: squadId(id),
    attacks: [],
    postures: [],
  })) as unknown as ReturnType<typeof emptyAttackPlots>;
}

describe("match/end-round / currentTraceStep", () => {
  it("returns null before the first scheduled contraction", () => {
    const state = makeDeployedSoloMatch();
    const trace = currentTraceStep(state.map.traceSchedule, 1);
    expect(trace).toBeNull();
  });

  it("returns the highest-index step whose round has been reached", () => {
    const state = makeDeployedSoloMatch();
    const trace = currentTraceStep(state.map.traceSchedule, 6);
    expect(trace).not.toBeNull();
    expect(trace?.step.round).toBe(6);
  });
});

describe("match/end-round / applyTrace", () => {
  it("does nothing when no trace is active", () => {
    const state = withRound(makeDeployedSoloMatch(), 1);
    const catalog = soloMatchConfig().catalog;
    const r = applyTrace(state, catalog);
    expect(r.events).toEqual([]);
    expect(r.state).toEqual(state);
  });

  it("advances dial for constructs outside the safe region", () => {
    // Trace step at round 4 has safeRegion box centered on origin with
    // halfSize=12. Constructs at anchors (~13, 13) etc. are OUTSIDE.
    const catalog = soloMatchConfig().catalog;
    const state = withRound(makeDeployedSoloMatch(), 4);
    const before = state.constructs.map((c) => c.dialIndex);
    const r = applyTrace(state, catalog);
    // Every squad's construct is outside the safe region.
    expect(r.events.length).toBe(5);
    for (let i = 0; i < r.state.constructs.length; i = i + 1) {
      const b = before[i]!;
      const after = r.state.constructs[i]!.dialIndex;
      expect(after).toBeGreaterThan(b);
    }
  });

  it("leaves constructs inside the safe region untouched", () => {
    // Move all constructs into the round-4 safe region.
    const catalog = soloMatchConfig().catalog;
    const state = withRound(
      {
        ...makeDeployedSoloMatch(),
        constructs: makeDeployedSoloMatch().constructs.map((c) => ({ ...c, position: v(0, 0) })),
      },
      4,
    );
    const r = applyTrace(state, catalog);
    expect(r.events).toEqual([]);
  });
});

describe("match/end-round / applyDestruction", () => {
  it("marks a construct destroyed when the dial is exhausted", () => {
    const catalog = soloMatchConfig().catalog;
    const base = makeDeployedSoloMatch();
    // Advance sq 0's construct's dial to the last state.
    const constructs = base.constructs.map((c) =>
      (c.squadId as number) === 0 ? { ...c, dialIndex: 4 } : c,
    );
    const state = { ...base, constructs };
    const r = applyDestruction(state, catalog, new Map([[0, 3]]));
    const destroyed = r.events.filter((e) => e.kind === "DESTROYED");
    expect(destroyed).toHaveLength(1);
    if (destroyed[0]?.kind === "DESTROYED") {
      expect(destroyed[0].cause).toBe("ATTACK");
      expect(destroyed[0].wasCommander).toBe(true);
    }
    // Commander death flag set.
    expect(r.state.squads[0]!.commanderDead).toBe(true);
  });
});

describe("match/end-round / snapshot + elimination", () => {
  it("records placement in reverse-elimination order (last standing = 1st)", () => {
    const catalog = soloMatchConfig().catalog;
    const base = makeDeployedSoloMatch();
    // Manually destroy squads 4, 3, 2, then squad 0 wins.
    let state = base;
    for (const sq of [4, 3, 2, 1]) {
      const constructs = state.constructs.map((c) =>
        (c.squadId as number) === sq
          ? { ...c, destroyed: true, destroyedRound: state.round }
          : c,
      );
      state = { ...state, phase: "ATTACK_PLOT", constructs };
      const snapshot = snapshotStartOfRound(state, catalog);
      const r = checkElimination(state, snapshot);
      state = r.state;
    }
    const placements = state.eliminationOrder.map((e) => ({
      squadId: e.squadId as number,
      placement: e.placement,
    }));
    // Squad 4 eliminated first → placement 5; sq 3 → 4; sq 2 → 3; sq 1 → 2.
    // Sq 0 remains → winner (placement 1 by convention).
    expect(placements.find((p) => p.squadId === 4)?.placement).toBe(5);
    expect(placements.find((p) => p.squadId === 3)?.placement).toBe(4);
    expect(placements.find((p) => p.squadId === 2)?.placement).toBe(3);
    expect(placements.find((p) => p.squadId === 1)?.placement).toBe(2);
    expect(state.phase).toBe("COMPLETE");
    expect(state.winner).toBe(squadId(0));
  });

  it("resolves simultaneous elimination by AD-4 total integrity", () => {
    // Manufacture: 2 squads simultaneously eliminated in the same round.
    // Higher start-of-round integrity gets better placement.
    const catalog = soloMatchConfig().catalog;
    const base = makeDeployedSoloMatch();
    // Prior state: sqs 2, 3, 4 already eliminated (previous rounds).
    let state = base;
    for (const sq of [4, 3, 2]) {
      const constructs = state.constructs.map((c) =>
        (c.squadId as number) === sq
          ? { ...c, destroyed: true, destroyedRound: 1 }
          : c,
      );
      state = { ...state, constructs };
      const snapshot = snapshotStartOfRound(state, catalog);
      state = checkElimination({ ...state, phase: "ATTACK_PLOT" }, snapshot).state;
    }
    // Snapshot start of THIS round: sq 0 has lower dialIndex than sq 1.
    // Advance sq 1 further so sq 0 has more integrity.
    const constructs = state.constructs.map((c) => {
      if (c.destroyed) return c;
      if ((c.squadId as number) === 1) return { ...c, dialIndex: 3 };
      return c;
    });
    state = { ...state, constructs };
    const snapshot = snapshotStartOfRound(state, catalog);
    // Then destroy both.
    const withBothDestroyed = {
      ...state,
      constructs: state.constructs.map((c) =>
        !c.destroyed ? { ...c, destroyed: true, destroyedRound: state.round + 1 } : c,
      ),
      round: state.round + 1,
      phase: "ATTACK_PLOT" as const,
    };
    const r = checkElimination(withBothDestroyed, snapshot);
    // Sq 0 (higher integrity) gets rank 1; sq 1 gets rank 2.
    const sq0 = r.state.eliminationOrder.find((e) => (e.squadId as number) === 0);
    const sq1 = r.state.eliminationOrder.find((e) => (e.squadId as number) === 1);
    expect(sq0?.placement).toBe(1);
    expect(sq1?.placement).toBe(2);
    expect(r.state.phase).toBe("COMPLETE");
  });
});

describe("match/end-round / trace advancing dial to destruction cascades", () => {
  it("trace can destroy a construct whose dial is on the last state", () => {
    const catalog = soloMatchConfig().catalog;
    const base = makeCloseSoloMatch();
    const constructs = base.constructs.map((c) =>
      (c.squadId as number) === 0 ? { ...c, position: v(15, 15), dialIndex: 4 } : c,
    );
    const state = withRound({ ...base, constructs }, 4);
    const traced = applyTrace(state, catalog);
    const destroyed = applyDestruction(traced.state, catalog, new Map());
    const dEvents = destroyed.events.filter((e) => e.kind === "DESTROYED");
    expect(dEvents).toHaveLength(1);
    if (dEvents[0]?.kind === "DESTROYED") {
      expect(dEvents[0].cause).toBe("TRACE");
    }
  });
});

describe("match/end-round / cumulative pool accounting", () => {
  it("counts each completed round's waste once while preserving spend counters", () => {
    const catalog = soloMatchConfig().catalog;
    let state = { ...makeCloseSoloMatch(), phase: "ATTACK_PLOT" as const };
    const human = state.constructs.find((construct) => (construct.squadId as number) === 0)!;

    const roundOnePlots = emptyAttackPlots();
    roundOnePlots[0] = {
      squadId: squadId(0),
      attacks: [],
      postures: [{ constructId: human.id, posture: "POSTURE" }],
    };
    const roundOne = resolveAttackStage(state, roundOnePlots, catalog);
    expect(roundOne.ok).toBe(true);
    if (!roundOne.ok) return;

    const afterRoundOne = roundOne.value.state.squads[0];
    expect(afterRoundOne.totalPoolGranted).toBe(state.squads[0].poolTotal);
    expect(afterRoundOne.totalPoolSpent).toBe(1);
    expect(afterRoundOne.totalPoolWasted).toBe(state.squads[0].poolTotal - 1);
    expect(afterRoundOne.totalCalledShots).toBe(0);
    expect(afterRoundOne.totalPostures).toBe(1);

    const advanced = advanceRoundAndRefill(roundOne.value.state, catalog);
    state = { ...advanced.state, phase: "ATTACK_PLOT" };
    expect(state.round).toBe(2);
    expect(state.squads[0].totalPoolWasted).toBe(afterRoundOne.totalPoolWasted);

    const roundTwo = resolveAttackStage(state, emptyAttackPlots(), catalog);
    expect(roundTwo.ok).toBe(true);
    if (!roundTwo.ok) return;
    const totals = roundTwo.value.state.squads[0];
    expect(totals.totalPoolGranted).toBe(totals.totalPoolSpent + totals.totalPoolWasted);
    expect(totals.totalCalledShots).toBe(0);
    expect(totals.totalPostures).toBe(1);
  });

  it("includes unused pool once when the attack phase completes the match", () => {
    const catalog = soloMatchConfig().catalog;
    const base = makeCloseSoloMatch();
    const terminal: MatchState = {
      ...base,
      phase: "ATTACK_PLOT",
      constructs: base.constructs.map((construct) =>
        (construct.squadId as number) === 0
          ? construct
          : { ...construct, destroyed: true, destroyedRound: base.round },
      ),
    };
    const result = resolveAttackPhase(terminal, emptyAttackPlots(), catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.phase).toBe("COMPLETE");
    const human = result.value.state.squads[0];
    expect(human.totalPoolGranted).toBe(terminal.squads[0].poolTotal);
    expect(human.totalPoolSpent).toBe(0);
    expect(human.totalPoolWasted).toBe(terminal.squads[0].poolTotal);
  });
});
