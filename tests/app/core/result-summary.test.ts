import { describe, expect, it } from "vitest";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core/flow-store";
import {
  deriveMatchResultSummary,
  MatchResultSummaryError,
} from "../../../src/app/store/core/result-summary";
import { squadId } from "../../../src/engine";
import type { EliminationEntry, Event, MatchState } from "../../../src/engine";
import {
  makeCloseSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

function launchConfig(): CompleteMatchLaunchConfig {
  const engineConfig = soloMatchConfig();
  return {
    human: {
      source: { kind: "saved", id: "roster:1", name: "Human" },
      roster: engineConfig.rosters[0],
      shareString: "SL1-human",
    },
    aiRosters: [
      engineConfig.rosters[1],
      engineConfig.rosters[2],
      engineConfig.rosters[3],
      engineConfig.rosters[4],
    ],
    aiRosterShareStrings: ["SL1-ai1", "SL1-ai2", "SL1-ai3", "SL1-ai4"],
    map: engineConfig.map,
    seed: "summary-seed",
    budget: engineConfig.budget,
    aiTier: 2,
    selector: { kind: "any" },
    resolvedArchetypeId: "arena" as never,
  };
}

function multiRoundHistory(winner: number | null): readonly Event[] {
  const base = makeCloseSoloMatch();
  const human = base.constructs.find((construct) => (construct.squadId as number) === 0)!;
  const target = base.constructs.find((construct) => (construct.squadId as number) === 1)!;
  return [
    { kind: "POOL_REFILL", round: 1, squadId: squadId(0), total: 2, base: 1, commanderBase: 0, aliveCount: 1, rDivisor: 1, unitTerm: 1, commanderLost: false },
    { kind: "SHOT", round: 1, attackerId: human.id, targetId: target.id, called: true, landed: true, damage: 3, targetPosture: "FLAT", baseDamage: 2 },
    { kind: "POOL_REFILL", round: 2, squadId: squadId(0), total: 2, base: 1, commanderBase: 0, aliveCount: 1, rDivisor: 1, unitTerm: 1, commanderLost: false },
    { kind: "POSTURE_REVEAL", round: 2, constructId: human.id, posture: "POSTURE", squadId: squadId(0) },
    { kind: "MATCH_COMPLETE", round: 2, winner: winner === null ? null : squadId(winner), reason: winner === null ? "HUMAN_ELIMINATED" : "LAST_STANDING" },
  ];
}

function completedState(options: {
  winner: number | null;
  eliminations: readonly [number, number, 1 | 2 | 3 | 4 | 5][];
}): MatchState {
  const base = makeCloseSoloMatch();
  const eliminationOrder: readonly EliminationEntry[] = options.eliminations.map(
    ([id, round, placement]) => ({ squadId: squadId(id), round, placement }),
  );
  const eliminationBySquad = new Map(
    eliminationOrder.map((entry) => [entry.squadId as number, entry.round]),
  );
  return {
    ...base,
    phase: "COMPLETE",
    round: 2,
    winner: options.winner === null ? null : squadId(options.winner),
    eliminationOrder,
    squads: base.squads.map((squad) => ({
      ...squad,
      eliminatedRound: eliminationBySquad.get(squad.id as number) ?? null,
      ...(squad.id === squadId(0)
        ? {
            totalPoolGranted: 4,
            totalPoolSpent: 2,
            totalPoolWasted: 2,
            totalCalledShots: 1,
            totalPostures: 1,
          }
        : {}),
    })) as unknown as MatchState["squads"],
    constructs: base.constructs.map((construct) =>
      (construct.squadId as number) === 0
        ? {
            ...construct,
            damageDealt: 7,
            damageTaken: 5,
            roundsAlive: 2,
            dialIndex: 3,
            destroyed: eliminationBySquad.has(0),
            destroyedRound: eliminationBySquad.get(0) ?? null,
          }
        : construct,
    ),
  };
}

describe("app/core/result-summary / complete result", () => {
  it("derives a deterministic, cloneable victory with all result facts", () => {
    const state = completedState({
      winner: 0,
      eliminations: [[4, 1, 5], [3, 1, 4], [2, 2, 3], [1, 2, 2]],
    });
    const history = multiRoundHistory(0);
    const first = deriveMatchResultSummary(state, launchConfig(), squadId(0), history);
    const second = deriveMatchResultSummary(state, launchConfig(), squadId(0), history);

    expect(first).toEqual(second);
    expect(structuredClone(first)).toEqual(first);
    expect(first).toMatchObject({
      outcome: "victory",
      roundsElapsed: 2,
      humanPlacement: 1,
      humanEliminationRound: null,
      humanPool: {
        granted: 4,
        spent: 2,
        wasted: 2,
        calledShots: 1,
        postures: 1,
        rounds: [
          { round: 1, granted: 2, spent: 1, wasted: 1, calledShots: 1, postures: 0 },
          { round: 2, granted: 2, spent: 1, wasted: 1, calledShots: 0, postures: 1 },
        ],
      },
      reproducibility: {
        seed: "summary-seed",
        aiTier: 2,
        humanRosterShareString: "SL1-human",
        aiRosterShareStrings: ["SL1-ai1", "SL1-ai2", "SL1-ai3", "SL1-ai4"],
      },
    });
    expect(first.finalStateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(first.ladder.map((entry) => entry.placement)).toEqual([1, 2, 3, 4, 5]);
    expect(first.constructs[0]).toMatchObject({
      squadId: squadId(0),
      isCommander: true,
      damageDealt: 7,
      damageTaken: 5,
      roundsAlive: 2,
      finalDialIndex: 3,
      destroyed: false,
      destructionRound: null,
    });
  });

  it("reports an early human loss while leaving multiple AI survivors unplaced", () => {
    const state = completedState({
      winner: null,
      eliminations: [[4, 1, 5], [0, 2, 4]],
    });
    const summary = deriveMatchResultSummary(state, launchConfig(), squadId(0), multiRoundHistory(null));

    expect(summary.outcome).toBe("defeat");
    expect(summary.humanPlacement).toBe(4);
    expect(summary.humanEliminationRound).toBe(2);
    const survivors = summary.ladder.filter((entry) => entry.status === "SURVIVED_AT_END");
    expect(survivors.map((entry) => entry.squadId as number)).toEqual([1, 2, 3]);
    expect(survivors.every((entry) => entry.placement === null && entry.eliminationRound === null && entry.displayOrderOnly)).toBe(true);
  });

  it("preserves full simultaneous elimination ordering and the explicit rank-one winner", () => {
    const state = completedState({
      winner: 2,
      eliminations: [[4, 1, 5], [3, 1, 4], [0, 2, 3], [1, 2, 2], [2, 2, 1]],
    });
    const summary = deriveMatchResultSummary(state, launchConfig(), squadId(0), multiRoundHistory(2));

    expect(summary.outcome).toBe("defeat");
    expect(summary.ladder.map((entry) => [entry.squadId as number, entry.placement])).toEqual([
      [2, 1], [1, 2], [0, 3], [3, 4], [4, 5],
    ]);
    expect(summary.ladder[0]).toMatchObject({ status: "WINNER", eliminationRound: 2 });
    expect(summary.constructs[0]).toMatchObject({ destroyed: true, destructionRound: 2 });
  });

  it("uses stalemate only when the human survives a complete state with no winner", () => {
    const state = completedState({ winner: null, eliminations: [[4, 1, 5]] });
    const history = multiRoundHistory(null).map((event) =>
      event.kind === "MATCH_COMPLETE" ? { ...event, reason: "SIMULTANEOUS" as const } : event,
    );
    expect(deriveMatchResultSummary(state, launchConfig(), squadId(0), history).outcome).toBe("stalemate");
  });
});

describe("app/core/result-summary / rejection", () => {
  it("rejects a non-complete match", () => {
    expect(() =>
      deriveMatchResultSummary(makeCloseSoloMatch(), launchConfig(), squadId(0), multiRoundHistory(0)),
    ).toThrowError(expect.objectContaining({ code: "MATCH_NOT_COMPLETE" }));
  });

  it("rejects a missing human squad", () => {
    const state = completedState({ winner: 0, eliminations: [] });
    const malformed = { ...state, squads: state.squads.filter((squad) => squad.id !== squadId(0)) } as unknown as MatchState;
    expect(() =>
      deriveMatchResultSummary(malformed, launchConfig(), squadId(0), multiRoundHistory(0)),
    ).toThrowError(expect.objectContaining({ code: "HUMAN_SQUAD_MISSING" }));
  });

  it("rejects disagreement between event history and engine aggregates", () => {
    const state = completedState({ winner: 0, eliminations: [] });
    const inconsistent = {
      ...state,
      squads: state.squads.map((squad) =>
        squad.id === squadId(0) ? { ...squad, totalPoolWasted: 99 } : squad,
      ) as unknown as MatchState["squads"],
    };
    expect(() =>
      deriveMatchResultSummary(inconsistent, launchConfig(), squadId(0), multiRoundHistory(0)),
    ).toThrowError(MatchResultSummaryError);
    expect(() =>
      deriveMatchResultSummary(inconsistent, launchConfig(), squadId(0), multiRoundHistory(0)),
    ).toThrowError(expect.objectContaining({ code: "POOL_HISTORY_MISMATCH" }));
  });
});
