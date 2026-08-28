/**
 * Deterministic five-squad headless match runner.
 *
 * Uses the engine facade end-to-end:
 *   1. `generateMap` — archetype selectable, "any" delegates to the seed.
 *   2. `generateAiRoster` per squad (five squads = five named streams).
 *   3. `createMatch`.
 *   4. `aiDeploy` per squad on the pre-deployment publicView.
 *   5. `applyDeploymentsWithEvents`.
 *   6. Per round: `updateKnownPositions` → `aiMovePlot` per squad →
 *      `resolveMovementPhase` → `updateKnownPositions` → `aiAttackPlot`
 *      per squad → `resolveAttackPhase`. Stops on COMPLETE or when the
 *      round count hits `MAX_EXPECTED_ROUNDS`.
 *
 * Records:
 *   • The full `MatchLog` (via `makeMatchLog`).
 *   • Per-round terminal hashes (`hashState` after each `resolveAttackPhase`).
 *   • The canonical event sequence per round.
 *
 * The runner accepts an optional `humanPolicy` for a specific squad; when
 * present, the callback returns the squad's move/attack plots instead of
 * delegating to the AI. Session 06 does not need a human policy for its
 * batteries, but the parameter exists so the shape is future-compatible.
 */

import {
  type AiWeights,
  type Catalog,
  type Budget,
  type ArchetypeId,
  type MatchLog,
  type MatchState,
  type Rng,
  type SquadAttackPlot,
  type SquadMovePlots,
  type SquadPlots,
  type Event,
  type Placement,
  type GameMap,
  type Roster,
  SQUAD_IDS,
  aiAttackPlot,
  aiDeploy,
  aiMovePlot,
  applyDeploymentsWithEvents,
  createMatch,
  generateAiRoster,
  generateMap,
  hashState,
  makeMatchLog,
  nodeBudget,
  publicView,
  resolveAttackPhase,
  resolveMovementPhase,
  rngFromSeed,
  sortEventsCanonical,
  squadId,
  stream,
  updateKnownPositions,
} from "../../../src/engine/index";

/* ------------------------------------------------------------------------- */
/* Public API                                                                */
/* ------------------------------------------------------------------------- */

export interface RunMatchOptions {
  readonly seed: string;
  readonly budget: Budget;
  readonly aiTier: 1 | 2 | 3;
  readonly catalog: Catalog;
  readonly weights: AiWeights;
  /**
   * Archetype id or "any". Defaults to "long-avenues" — a reliably-
   * generating archetype at Session-06 catalog values. Callers who
   * want the seed to pick an archetype pass `"any"` explicitly; the
   * playability battery iterates each archetype id in turn.
   */
  readonly archetype?: ArchetypeId | "any";
  /** Per-decision node budget for aiMovePlot / aiAttackPlot. */
  readonly nodeBudget?: number;
  /** Hard round cap; defaults to `catalog.tunables.MAX_EXPECTED_ROUNDS`. */
  readonly maxRounds?: number;
  /** Deploy node budget; defaults to `weights.deploySamples`. */
  readonly deployBudget?: number;
}

export interface MatchRunResult {
  /** Terminal state (COMPLETE or capped-out). */
  readonly state: MatchState;
  /** Terminal hash — the FR-29 byte-identity of the final MatchState. */
  readonly terminalHash: string;
  /** Per-round hashes, in ascending round order. Round 1 hash comes first. */
  readonly perRoundHashes: readonly string[];
  /** Canonically-ordered event list per round. */
  readonly perRoundEvents: readonly (readonly Event[])[];
  /** Complete MatchLog — replayable via foldMatchLog. */
  readonly log: MatchLog;
  /** The generated map (identity used by the log). */
  readonly map: GameMap;
  /** Reason the run terminated: COMPLETE, ROUND_CAP, or NO_LEGAL_DECISION. */
  readonly termination: "COMPLETE" | "ROUND_CAP" | "NO_LEGAL_DECISION";
  /** Winner if COMPLETE; null otherwise. */
  readonly winner: MatchState["winner"];
}

/**
 * Run one full match deterministically. Two calls with identical options
 * produce identical `MatchRunResult` — the terminal hash is FR-29's
 * byte-identity guarantee.
 */
export function runMatch(options: RunMatchOptions): MatchRunResult {
  const {
    seed,
    budget,
    aiTier,
    catalog,
    weights,
    archetype = "long-avenues" as ArchetypeId,
    nodeBudget: budgetSize = 512,
    maxRounds = catalog.tunables.MAX_EXPECTED_ROUNDS,
    deployBudget = Math.max(weights.deploySamples, 12),
  } = options;

  const mapResult = generateMap(
    seed,
    archetype === "any" ? { kind: "any" } : { kind: "id", id: archetype },
    catalog.mapArchetypes,
    catalog.tunables,
  );
  const map = mapResult.map;

  const rosterRng: Rng = rngFromSeed(`${seed}#rosters`);
  const rosters = generateRosters(rosterRng, budget, catalog);
  const rostersTuple = rosters as unknown as [Roster, Roster, Roster, Roster, Roster];

  const created = createMatch({
    seed,
    budget,
    aiTier,
    catalog,
    map,
    rosters: rostersTuple,
  });
  if (!created.ok) {
    throw new RunnerError(`createMatch failed: ${formatViolations(created.error)}`);
  }
  let state = created.value;

  // Deploy every squad.
  const deployments: readonly Placement[][] = generateDeployments(
    state,
    catalog,
    weights,
    seed,
    deployBudget,
  );
  const deployTuple = deployments as unknown as [
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
  ];
  const revealed = applyDeploymentsWithEvents(state, deployTuple, catalog);
  if (!revealed.ok) {
    throw new RunnerError(`applyDeployments failed: ${formatViolations(revealed.error)}`);
  }
  // Do NOT overwrite `state` with updateKnownPositions — foldMatchLog
  // walks the same round pipeline without refreshing knownPositions,
  // so the runner's terminal hash matches the fold-identity check.
  // Fog-of-war projections are computed on demand for AI input only.
  state = revealed.value.state;

  const perRoundHashes: string[] = [];
  const perRoundEvents: (readonly Event[])[] = [];
  const plots: (readonly [SquadPlots, SquadPlots, SquadPlots, SquadPlots, SquadPlots])[] = [];
  let termination: MatchRunResult["termination"] = "ROUND_CAP";

  const budgetToken = nodeBudget(Math.max(1, Math.trunc(budgetSize)));

  while (state.phase !== "COMPLETE") {
    if (state.round > maxRounds) break;

    // Compute a transient fog-projected state for AI input. The AI
    // reads a `PublicState`; refreshing knownPositions before publicView
    // keeps the enemy's positions accurate to end-of-last-round. The
    // update is NOT persisted back onto `state` — foldMatchLog does not
    // refresh knownPositions during resolveRound, and the runner's
    // terminal hash must match the fold-identity check.
    const viewState = updateKnownPositions(state, catalog);

    // Movement plots per squad.
    const moves: SquadMovePlots[] = [];
    const roundPlots: SquadPlots[] = [];
    for (const sid of SQUAD_IDS) {
      const view = publicView(viewState, sid, catalog);
      const rng = stream(rngFromSeed(seed), `ai.squad${sid as number}.r${state.round}.move`);
      const decision = aiMovePlot(view, sid, catalog, rng, weights, budgetToken, aiTier);
      if (!decision.ok) {
        termination = "NO_LEGAL_DECISION";
        break;
      }
      moves.push(decision.value.choice);
      roundPlots.push({
        squadId: sid,
        moves: decision.value.choice.moves,
        attacks: [],
        postures: [],
      });
    }
    if (termination === "NO_LEGAL_DECISION") break;

    const movesTuple = moves as unknown as [
      SquadMovePlots,
      SquadMovePlots,
      SquadMovePlots,
      SquadMovePlots,
      SquadMovePlots,
    ];
    const movement = resolveMovementPhase(state, movesTuple, catalog);
    if (!movement.ok) {
      throw new RunnerError(`resolveMovementPhase failed round ${state.round}: ${formatViolations(movement.error)}`);
    }
    // AI attack plot input uses the post-movement view — refresh known
    // positions transiently, again without persisting.
    const attackViewState = updateKnownPositions(movement.value.state, catalog);

    // Attack plots per squad.
    const attacks: SquadAttackPlot[] = [];
    for (const sid of SQUAD_IDS) {
      const view = publicView(attackViewState, sid, catalog);
      const rng = stream(rngFromSeed(seed), `ai.squad${sid as number}.r${state.round}.attack`);
      const decision = aiAttackPlot(view, sid, catalog, rng, weights, budgetToken, aiTier);
      if (!decision.ok) {
        termination = "NO_LEGAL_DECISION";
        break;
      }
      attacks.push(decision.value.choice);
      const row = roundPlots.find((p) => (p.squadId as number) === (sid as number));
      if (row !== undefined) {
        roundPlots[roundPlots.indexOf(row)] = {
          squadId: sid,
          moves: row.moves,
          attacks: decision.value.choice.attacks,
          postures: decision.value.choice.postures,
        };
      }
    }
    if (termination === "NO_LEGAL_DECISION") break;

    const attacksTuple = attacks as unknown as [
      SquadAttackPlot,
      SquadAttackPlot,
      SquadAttackPlot,
      SquadAttackPlot,
      SquadAttackPlot,
    ];
    const attackPhase = resolveAttackPhase(movement.value.state, attacksTuple, catalog);
    if (!attackPhase.ok) {
      throw new RunnerError(`resolveAttackPhase failed round ${state.round}: ${formatViolations(attackPhase.error)}`);
    }
    const combinedEvents = sortEventsCanonical(
      movement.value.events.concat(attackPhase.value.events),
    );
    perRoundEvents.push(combinedEvents);
    perRoundHashes.push(hashState(attackPhase.value.state));
    state = attackPhase.value.state;

    // Sort plots by squadId ascending for canonical tuple storage.
    roundPlots.sort((a, b) => (a.squadId as number) - (b.squadId as number));
    plots.push(
      roundPlots.slice() as unknown as readonly [
        SquadPlots,
        SquadPlots,
        SquadPlots,
        SquadPlots,
        SquadPlots,
      ],
    );
  }
  if (state.phase === "COMPLETE") termination = "COMPLETE";

  const log = makeMatchLog({
    seed,
    budget,
    archetype,
    aiTier,
    catalog,
    rosters: rostersTuple,
    deployments: deployTuple,
    plots,
  });

  return {
    state,
    terminalHash: hashState(state),
    perRoundHashes,
    perRoundEvents,
    log,
    map,
    termination,
    winner: state.winner,
  };
}

/**
 * Deterministically generate a five-squad roster set.
 */
export function generateRosters(
  rng: Rng,
  budget: Budget,
  catalog: Catalog,
): readonly Roster[] {
  const out: Roster[] = [];
  let currentRng = rng;
  for (let i = 0; i < 5; i = i + 1) {
    const named = stream(currentRng, `roster.squad${i}`);
    const result = generateAiRoster(named, budget, catalog);
    if (!result.ok) {
      throw new RunnerError(`generateAiRoster squad ${i}: ${result.error.message}`);
    }
    out.push(result.value.roster);
    currentRng = result.value.rng;
  }
  return out;
}

/**
 * Generate legal deployments for every squad off a pre-deployment state.
 * Returns an array of five Placement lists.
 */
export function generateDeployments(
  state: MatchState,
  catalog: Catalog,
  weights: AiWeights,
  seed: string,
  budgetSize: number,
): readonly Placement[][] {
  const out: Placement[][] = [];
  for (const sid of SQUAD_IDS) {
    const view = publicView(state, sid, catalog);
    const rng = stream(rngFromSeed(seed), `ai.squad${sid as number}.deploy`);
    const decision = aiDeploy(
      view,
      sid,
      catalog,
      rng,
      weights,
      nodeBudget(Math.max(1, Math.trunc(budgetSize))),
    );
    if (!decision.ok) {
      throw new RunnerError(`aiDeploy squad ${sid as number}: ${decision.error.message}`);
    }
    out.push(decision.value.choice.slice());
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Errors                                                                    */
/* ------------------------------------------------------------------------- */

export class RunnerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RunnerError";
  }
}

function formatViolations(violations: readonly { rule: string; kind: string; message: string; path: string }[]): string {
  return violations.map((v) => `[${v.rule}/${v.kind}] ${v.path}: ${v.message}`).join("; ");
}

/** Convenience — invert squadId branding. */
export function toSquadId(n: number): ReturnType<typeof squadId> {
  return squadId(n);
}
