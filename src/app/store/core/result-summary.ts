import { hashState, SQUAD_IDS } from "../../../engine";
import type {
  ArchetypeId,
  Budget,
  ChassisCode,
  ConstructId,
  Event,
  MatchState,
  SquadId,
} from "../../../engine";
import type { CompleteMatchLaunchConfig } from "./flow-store";

export type MatchOutcome = "victory" | "defeat" | "stalemate";

export type SquadResultStatus = "WINNER" | "ELIMINATED" | "SURVIVED_AT_END";

export interface SquadResultEntry {
  readonly squadId: SquadId;
  readonly status: SquadResultStatus;
  readonly placement: 1 | 2 | 3 | 4 | 5 | null;
  readonly eliminationRound: number | null;
  readonly displayOrderOnly: boolean;
}

export interface ConstructResultEntry {
  readonly id: ConstructId;
  readonly squadId: SquadId;
  readonly chassisCode: ChassisCode;
  readonly isCommander: boolean;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly roundsAlive: number;
  readonly finalDialIndex: number;
  readonly destroyed: boolean;
  readonly destructionRound: number | null;
}

export interface PoolRoundResult {
  readonly round: number;
  readonly granted: number;
  readonly spent: number;
  readonly wasted: number;
  readonly calledShots: number;
  readonly postures: number;
}

export interface HumanPoolResult {
  readonly granted: number;
  readonly spent: number;
  readonly wasted: number;
  readonly calledShots: number;
  readonly postures: number;
  readonly rounds: readonly PoolRoundResult[];
}

export interface MatchReproducibility {
  readonly seed: string;
  readonly budget: Budget;
  readonly resolvedArchetypeId: ArchetypeId;
  readonly aiTier: CompleteMatchLaunchConfig["aiTier"];
  readonly humanRosterShareString: string;
  readonly aiRosterShareStrings: readonly [string, string, string, string];
}

export interface MatchResultSummary {
  readonly outcome: MatchOutcome;
  readonly roundsElapsed: number;
  readonly humanPlacement: 1 | 2 | 3 | 4 | 5 | null;
  readonly humanEliminationRound: number | null;
  readonly finalStateHash: string;
  readonly ladder: readonly SquadResultEntry[];
  readonly constructs: readonly ConstructResultEntry[];
  readonly humanPool: HumanPoolResult;
  readonly reproducibility: MatchReproducibility;
}

export type MatchResultSummaryErrorCode =
  | "MATCH_NOT_COMPLETE"
  | "HUMAN_SQUAD_MISSING"
  | "HISTORY_INCOMPLETE"
  | "POOL_HISTORY_MISMATCH";

export class MatchResultSummaryError extends Error {
  public constructor(
    public readonly code: MatchResultSummaryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MatchResultSummaryError";
  }
}

interface MutablePoolRound {
  round: number;
  granted: number;
  calledShots: number;
  postures: number;
}

function derivePoolRounds(
  state: MatchState,
  humanSquadId: SquadId,
  history: readonly Event[],
): readonly PoolRoundResult[] {
  const humanConstructIds = new Set(
    state.constructs
      .filter((construct) => construct.squadId === humanSquadId)
      .map((construct) => construct.id as number),
  );
  const rounds = new Map<number, MutablePoolRound>();

  for (const event of history) {
    if (event.kind === "POOL_REFILL" && event.squadId === humanSquadId) {
      if (rounds.has(event.round)) {
        throw new MatchResultSummaryError(
          "POOL_HISTORY_MISMATCH",
          `Human pool history contains more than one refill for round ${event.round}.`,
        );
      }
      rounds.set(event.round, {
        round: event.round,
        granted: event.total,
        calledShots: 0,
        postures: 0,
      });
      continue;
    }
    if (
      event.kind === "POSTURE_REVEAL" &&
      event.squadId === humanSquadId &&
      event.posture === "POSTURE"
    ) {
      const round = rounds.get(event.round);
      if (round === undefined) throwMissingRefill(event.round);
      round.postures = round.postures + 1;
      continue;
    }
    if (
      event.kind === "SHOT" &&
      event.called &&
      humanConstructIds.has(event.attackerId as number)
    ) {
      const round = rounds.get(event.round);
      if (round === undefined) throwMissingRefill(event.round);
      round.calledShots = round.calledShots + 1;
    }
  }

  const result = Array.from(rounds.values())
    .sort((a, b) => a.round - b.round)
    .map((round): PoolRoundResult => {
      const spent = round.calledShots + round.postures;
      if (spent > round.granted) {
        throw new MatchResultSummaryError(
          "POOL_HISTORY_MISMATCH",
          `Human pool spend ${spent} exceeds grant ${round.granted} in round ${round.round}.`,
        );
      }
      return {
        round: round.round,
        granted: round.granted,
        spent,
        wasted: round.granted - spent,
        calledShots: round.calledShots,
        postures: round.postures,
      };
    });

  if (result.length !== state.round) {
    throw new MatchResultSummaryError(
      "HISTORY_INCOMPLETE",
      `Completed match at round ${state.round} has ${result.length} human pool refill records.`,
    );
  }
  return result;
}

function throwMissingRefill(round: number): never {
  throw new MatchResultSummaryError(
    "HISTORY_INCOMPLETE",
    `Human pool action in round ${round} has no preceding refill record.`,
  );
}

function deriveLadder(state: MatchState): readonly SquadResultEntry[] {
  const entries = SQUAD_IDS.map((squad): SquadResultEntry => {
    const elimination = state.eliminationOrder.find((entry) => entry.squadId === squad);
    if (state.winner === squad) {
      return {
        squadId: squad,
        status: "WINNER",
        placement: 1,
        eliminationRound: elimination?.round ?? null,
        displayOrderOnly: false,
      };
    }
    if (elimination !== undefined) {
      return {
        squadId: squad,
        status: "ELIMINATED",
        placement: elimination.placement,
        eliminationRound: elimination.round,
        displayOrderOnly: false,
      };
    }
    return {
      squadId: squad,
      status: "SURVIVED_AT_END",
      placement: null,
      eliminationRound: null,
      displayOrderOnly: true,
    };
  });

  return entries.sort((a, b) => {
    if (a.placement !== null && b.placement !== null) return a.placement - b.placement;
    if (a.placement !== null) return -1;
    if (b.placement !== null) return 1;
    return (a.squadId as number) - (b.squadId as number);
  });
}

export function deriveMatchResultSummary(
  state: MatchState,
  config: CompleteMatchLaunchConfig,
  humanSquadId: SquadId,
  history: readonly Event[],
): MatchResultSummary {
  if (state.phase !== "COMPLETE") {
    throw new MatchResultSummaryError(
      "MATCH_NOT_COMPLETE",
      `Match result summary requires phase COMPLETE; received ${state.phase}.`,
    );
  }
  const humanSquad = state.squads.find((squad) => squad.id === humanSquadId);
  if (humanSquad === undefined) {
    throw new MatchResultSummaryError(
      "HUMAN_SQUAD_MISSING",
      `Match state does not contain human squad ${humanSquadId as number}.`,
    );
  }
  const completeEvent = history.find((event) => event.kind === "MATCH_COMPLETE");
  if (completeEvent === undefined || completeEvent.round !== state.round) {
    throw new MatchResultSummaryError(
      "HISTORY_INCOMPLETE",
      `Event history has no completion record for round ${state.round}.`,
    );
  }

  const poolRounds = derivePoolRounds(state, humanSquadId, history);
  const poolTotals = poolRounds.reduce(
    (totals, round) => ({
      granted: totals.granted + round.granted,
      spent: totals.spent + round.spent,
      wasted: totals.wasted + round.wasted,
      calledShots: totals.calledShots + round.calledShots,
      postures: totals.postures + round.postures,
    }),
    { granted: 0, spent: 0, wasted: 0, calledShots: 0, postures: 0 },
  );
  const aggregateTotals = {
    granted: humanSquad.totalPoolGranted,
    spent: humanSquad.totalPoolSpent,
    wasted: humanSquad.totalPoolWasted,
    calledShots: humanSquad.totalCalledShots,
    postures: humanSquad.totalPostures,
  };
  if (
    poolTotals.granted !== aggregateTotals.granted ||
    poolTotals.spent !== aggregateTotals.spent ||
    poolTotals.wasted !== aggregateTotals.wasted ||
    poolTotals.calledShots !== aggregateTotals.calledShots ||
    poolTotals.postures !== aggregateTotals.postures
  ) {
    throw new MatchResultSummaryError(
      "POOL_HISTORY_MISMATCH",
      `Human pool history ${JSON.stringify(poolTotals)} disagrees with engine aggregates ${JSON.stringify(aggregateTotals)}.`,
    );
  }

  const ladder = deriveLadder(state);
  const humanLadder = ladder.find((entry) => entry.squadId === humanSquadId);
  const outcome: MatchOutcome =
    state.winner === humanSquadId
      ? "victory"
      : humanSquad.eliminatedRound !== null
      ? "defeat"
      : "stalemate";

  return {
    outcome,
    roundsElapsed: state.round,
    humanPlacement: humanLadder?.placement ?? null,
    humanEliminationRound: humanSquad.eliminatedRound,
    finalStateHash: hashState(state),
    ladder,
    constructs: state.constructs.map((construct) => ({
      id: construct.id,
      squadId: construct.squadId,
      chassisCode: construct.chassisCode,
      isCommander: construct.commanderCode !== null,
      damageDealt: construct.damageDealt,
      damageTaken: construct.damageTaken,
      roundsAlive: construct.roundsAlive,
      finalDialIndex: construct.dialIndex,
      destroyed: construct.destroyed,
      destructionRound: construct.destroyedRound,
    })),
    humanPool: { ...poolTotals, rounds: poolRounds },
    reproducibility: {
      seed: config.seed,
      budget: config.budget,
      resolvedArchetypeId: config.resolvedArchetypeId,
      aiTier: config.aiTier,
      humanRosterShareString: config.human.shareString,
      aiRosterShareStrings: config.aiRosterShareStrings,
    },
  };
}
