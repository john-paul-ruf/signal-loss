/**
 * End-of-round rule pipeline (FR-13):
 *   attack damage (already applied by resolveAttackStage)
 *     → trace damage
 *     → destruction
 *     → commander loss flags
 *     → squad elimination + placement
 *     → refill next round's pool
 *
 * Trace damage advances the dial exactly like attack damage — the two
 * paths converge on the same integer arithmetic. Destruction is applied
 * AFTER both damage sources are accumulated (a construct destroyed by
 * this round's damage still fires this round; see resolveAttackStage's
 * snapshot-then-apply structure).
 *
 * Simultaneous elimination is resolved by AD-4's total ordering:
 *   1. start-of-round total integrity (higher = better placement)
 *   2. start-of-round living count
 *   3. total damage dealt across the match
 *   4. stable squad index (VECTOR=0 wins ties by construction)
 */

import { pointInPoly } from "../fx/index";
import type { Catalog } from "../catalog/index";
import type { TraceStep } from "../map/index";
import type {
  DestroyedEvent,
  EliminatedEvent,
  Event,
  MatchCompleteEvent,
  TraceDamageEvent,
} from "./events";
import type {
  EliminationEntry,
  MatchState,
  SquadId,
  SquadState,
} from "./state";
import { SQUAD_COUNT, squadId } from "./state";
import { effectiveDialLength } from "./plot";
import { poolFor } from "./pool";

/**
 * Find the currently-active trace step for `round`. FR-20 timing: at
 * round R the highest-index step with `round >= step.round` is active.
 * Returns null (no trace applied) if the schedule has no active entry.
 */
export function currentTraceStep(
  schedule: readonly TraceStep[],
  round: number,
): { readonly step: TraceStep; readonly index: number } | null {
  let best: { readonly step: TraceStep; readonly index: number } | null = null;
  for (let i = 0; i < schedule.length; i = i + 1) {
    const s = schedule[i];
    if (s === undefined) continue;
    if (round >= s.round) {
      best = { step: s, index: i };
    } else {
      break; // ascending round order — early exit
    }
  }
  return best;
}

/**
 * Apply trace damage for round `round`, advancing dial indices and
 * emitting `TRACE_DAMAGE` events for each affected construct (ascending
 * id). Does NOT mark destruction — that is `applyDestruction`'s job so
 * the accumulated pipeline stays snapshot-then-apply.
 */
export function applyTrace(
  state: MatchState,
  catalog: Catalog,
): { readonly state: MatchState; readonly events: readonly Event[] } {
  const trace = currentTraceStep(state.map.traceSchedule, state.round);
  if (trace === null) return { state, events: [] };
  const events: Event[] = [];
  const newConstructs = state.constructs.map((c) => {
    if (c.destroyed) return c;
    if (pointInPoly(c.position, trace.step.safeRegion)) return c;
    // Outside safe region → take trace damage.
    const damage = trace.step.damage;
    let newIndex = c.dialIndex + damage;
    const maxLen = effectiveDialLength(c, catalog);
    if (newIndex > maxLen) newIndex = maxLen;
    events.push({
      kind: "TRACE_DAMAGE",
      round: state.round,
      constructId: c.id,
      damage,
      stepIndex: trace.index,
      safeRegionRound: trace.step.round,
    } as TraceDamageEvent);
    return {
      ...c,
      dialIndex: newIndex,
      damageTaken: c.damageTaken + damage,
    };
  });
  const newSquads = state.squads.map((s) => {
    let taken = 0;
    for (let i = 0; i < state.constructs.length; i = i + 1) {
      const before = state.constructs[i];
      const after = newConstructs[i];
      if (before === undefined || after === undefined) continue;
      if ((before.squadId as number) !== (s.id as number)) continue;
      taken = taken + (after.damageTaken - before.damageTaken);
    }
    return { ...s, totalDamageTaken: s.totalDamageTaken + taken };
  }) as unknown as MatchState["squads"];
  return {
    state: { ...state, constructs: newConstructs, squads: newSquads },
    events,
  };
}

/**
 * Mark constructs whose dial has been exhausted as destroyed. Emit
 * `DESTROYED` events (ascending id). Set `squad.commanderDead` the
 * moment a squad's commander construct is marked destroyed.
 *
 * `attackDamageByCid` maps target id → attack damage this round (0 if
 * none). Used to attribute the destroy `cause` field (`"ATTACK"` if
 * attack damage was involved, `"TRACE"` otherwise). If both, ATTACK wins
 * for canonical simplicity — the trace event still precedes destruction
 * in the ordered log, so playback shows both.
 */
export function applyDestruction(
  state: MatchState,
  catalog: Catalog,
  attackDamageByCid: ReadonlyMap<number, number>,
): { readonly state: MatchState; readonly events: readonly Event[] } {
  const events: Event[] = [];
  const commanderDeaths = new Set<number>();
  const newConstructs = state.constructs.map((c) => {
    if (c.destroyed) return c;
    const maxLen = effectiveDialLength(c, catalog);
    if (c.dialIndex < maxLen) return c;
    const attackDmg = attackDamageByCid.get(c.id as number) ?? 0;
    const cause: DestroyedEvent["cause"] = attackDmg > 0 ? "ATTACK" : "TRACE";
    const wasCommander = c.commanderCode !== null;
    events.push({
      kind: "DESTROYED",
      round: state.round,
      constructId: c.id,
      squadId: c.squadId,
      cause,
      wasCommander,
    } as DestroyedEvent);
    if (wasCommander) commanderDeaths.add(c.squadId as number);
    return { ...c, destroyed: true, destroyedRound: state.round };
  });
  const newSquads = state.squads.map((s) => {
    if (!commanderDeaths.has(s.id as number)) return s;
    return { ...s, commanderDead: true, commanderDeathRound: state.round };
  }) as unknown as MatchState["squads"];
  return {
    state: { ...state, constructs: newConstructs, squads: newSquads },
    events,
  };
}

/* ------------------------------------------------------------------------- */
/* Start-of-round snapshot (for AD-4 tiebreak)                                */
/* ------------------------------------------------------------------------- */

/**
 * Snapshot of the tiebreak facts for one squad, taken at start of the
 * round (before any damage or trace). Used to resolve simultaneous
 * eliminations deterministically.
 */
export interface StartOfRoundSnapshot {
  readonly integrity: readonly number[]; // per squadId
  readonly alive: readonly number[];
  readonly damageDealt: readonly number[];
}

/**
 * Build the snapshot from a state. Integrity is per-squad: sum over
 * alive constructs of (effectiveDialLength − dialIndex). Alive count is
 * the number of non-destroyed constructs. Damage dealt is the squad's
 * cumulative total to date.
 */
export function snapshotStartOfRound(
  state: MatchState,
  catalog: Catalog,
): StartOfRoundSnapshot {
  const integrity = [0, 0, 0, 0, 0];
  const alive = [0, 0, 0, 0, 0];
  const damageDealt = state.squads.map((s) => s.totalDamageDealt);
  for (const c of state.constructs) {
    if (c.destroyed) continue;
    const sq = c.squadId as number;
    const remaining = effectiveDialLength(c, catalog) - c.dialIndex;
    integrity[sq] = (integrity[sq] ?? 0) + Math.max(0, remaining);
    alive[sq] = (alive[sq] ?? 0) + 1;
  }
  return { integrity, alive, damageDealt };
}

/* ------------------------------------------------------------------------- */
/* Elimination + placement                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Determine which squads are newly eliminated this round and produce
 * ELIMINATED events + updated squad state. Uses `snapshot` for the AD-4
 * tiebreak when two or more squads eliminate simultaneously (their
 * placement rank is derived from the snapshot, not from insertion order).
 *
 * Emits MATCH_COMPLETE if:
 *   - Human squad (id 0) has no constructs alive → immediate match end
 *   - Only one squad remains alive after this round's eliminations
 */
export function checkElimination(
  state: MatchState,
  snapshot: StartOfRoundSnapshot,
): { readonly state: MatchState; readonly events: readonly Event[] } {
  const events: Event[] = [];
  // Alive after this round's destruction.
  const aliveNow: boolean[] = [false, false, false, false, false];
  for (const c of state.constructs) {
    if (!c.destroyed) aliveNow[c.squadId as number] = true;
  }
  // Squads eliminated this round: previously alive AND now no alive.
  const newlyEliminated: SquadId[] = [];
  const priorEliminated: SquadId[] = [];
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const s = state.squads[sq];
    if (s === undefined) continue;
    if (s.eliminatedRound !== null) {
      priorEliminated.push(s.id);
      continue;
    }
    if (!aliveNow[sq]) newlyEliminated.push(squadId(sq));
  }

  // Placement recording: 1st = last standing; 5th = first eliminated.
  // Track the ordered elimination list so a squad eliminated in round 2
  // is placed above one eliminated in round 5.
  const existingPlacements = new Set<number>();
  for (const e of state.eliminationOrder) existingPlacements.add(e.squadId as number);

  const aliveCount = aliveNow.filter((b) => b).length;
  const humanEliminated = !aliveNow[0];
  const matchEndsThisRound = humanEliminated || aliveCount <= 1;

  // Sort newly-eliminated by AD-4 tiebreak. Higher integrity ranks higher
  // (better placement). Ties then living count, then damage dealt, then
  // stable squad index ASC (lower = better placement).
  const sortedNewly = newlyEliminated.slice().sort((a, b) => {
    const ia = snapshot.integrity[a as number] ?? 0;
    const ib = snapshot.integrity[b as number] ?? 0;
    if (ia !== ib) return ib - ia; // higher integrity better
    const la = snapshot.alive[a as number] ?? 0;
    const lb = snapshot.alive[b as number] ?? 0;
    if (la !== lb) return lb - la;
    const da = snapshot.damageDealt[a as number] ?? 0;
    const db = snapshot.damageDealt[b as number] ?? 0;
    if (da !== db) return db - da;
    return (a as number) - (b as number);
  });

  // Placement math (AD-4):
  //   Rank 1 = winner (last standing). Rank 5 = first eliminated.
  //   Existing eliminations already own the higher numbers (5 → down to
  //   6 - existing.size). Available ranks for THIS round's eliminations
  //   run from `aliveCount + 1` upward. Best AD-4 tiebreak → lowest rank.
  //
  //   Example, existing eliminations {5, 4, 3}, this round eliminates
  //   both remaining squads → available = {1, 2}. Best tiebreak → rank 1.
  const newEliminationEntries: EliminationEntry[] = [];
  const availableCount = SQUAD_COUNT - existingPlacements.size;
  const startRank = availableCount - sortedNewly.length + 1;
  let placement = startRank;
  for (const sq of sortedNewly) {
    newEliminationEntries.push({
      squadId: sq,
      round: state.round,
      placement: placement as EliminationEntry["placement"],
    });
    placement = placement + 1;
  }

  // Emit ELIMINATED events (ascending squadId for canonical ordering).
  const sortedForEvents = newEliminationEntries.slice().sort((a, b) => (a.squadId as number) - (b.squadId as number));
  for (const e of sortedForEvents) {
    events.push({
      kind: "ELIMINATED",
      round: state.round,
      squadId: e.squadId,
      placement: e.placement,
    } as EliminatedEvent);
  }

  const newSquads = state.squads.map((s) => {
    const entry = newEliminationEntries.find((e) => e.squadId === s.id);
    if (entry === undefined) return s;
    return { ...s, eliminatedRound: state.round };
  }) as unknown as MatchState["squads"];

  const eliminationOrder = state.eliminationOrder.concat(newEliminationEntries);
  let phase = state.phase;
  let winner: SquadId | null = state.winner;
  if (matchEndsThisRound) {
    phase = "COMPLETE";
    // Winner: last-standing squad; if human eliminated with others alive,
    // there is no "winner" from the human's perspective but rules-wise the
    // last standing squad still wins the multi-squad game. We record the
    // highest-placement (rank 1) squad as winner. If simultaneous, the
    // survivor of the tiebreak in `sortedNewly` still yields rank 1.
    // Compute winner from all eliminations + still-alive:
    const stillAlive: SquadId[] = [];
    for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
      if (aliveNow[sq]) stillAlive.push(squadId(sq));
    }
    if (stillAlive.length === 1) {
      winner = stillAlive[0] ?? null;
    } else if (stillAlive.length === 0) {
      // Simultaneous total wipe — the highest placement (rank 1) is the
      // winner by AD-4.
      const rank1 = newEliminationEntries.find((e) => e.placement === 1);
      winner = rank1?.squadId ?? null;
    }
    // If humans eliminated but multiple non-humans still alive, no
    // winner-yet from a match-continuation POV — but FR-21 mandates the
    // match ends now. Winner stays null; playback resumes with the human
    // placement recorded from `eliminationOrder`.
    const reason: MatchCompleteEvent["reason"] =
      humanEliminated && aliveCount > 0
        ? "HUMAN_ELIMINATED"
        : aliveCount === 1
        ? "LAST_STANDING"
        : "SIMULTANEOUS";
    events.push({
      kind: "MATCH_COMPLETE",
      round: state.round,
      winner,
      reason,
    } as MatchCompleteEvent);
  }

  const nextState: MatchState = {
    ...state,
    squads: newSquads,
    eliminationOrder,
    phase,
    winner,
  };
  return { state: nextState, events };
}

/**
 * Advance the round, refill pools, transition to MOVEMENT_PLOT of the
 * next round. Not called when the match has already completed.
 */
export function advanceRoundAndRefill(
  state: MatchState,
  catalog: Catalog,
): { readonly state: MatchState; readonly events: readonly Event[] } {
  if (state.phase === "COMPLETE") return { state, events: [] };
  const nextRound = state.round + 1;
  const events: Event[] = [];
  const newSquads: SquadState[] = [];
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const s = state.squads[sq];
    if (s === undefined) continue;
    // Refill pool via poolFor over the pre-transition state.
    const breakdown = poolFor(state, s.id, catalog);
    newSquads.push({
      ...s,
      poolTotal: breakdown.total,
      poolSpent: 0,
      totalPoolGranted: s.totalPoolGranted + breakdown.total,
    });
    events.push({
      kind: "POOL_REFILL",
      round: nextRound,
      squadId: s.id,
      total: breakdown.total,
      base: 1,
      commanderBase: breakdown.terms[1].value,
      aliveCount: breakdown.terms[2].alive,
      rDivisor: breakdown.terms[2].divisor,
      unitTerm: breakdown.terms[2].value,
      commanderLost: breakdown.commanderLost,
    });
  }
  // Roundup roundsAlive for surviving constructs.
  const newConstructs = state.constructs.map((c) => {
    if (c.destroyed) return c;
    return { ...c, roundsAlive: c.roundsAlive + 1 };
  });
  const squadsTuple = newSquads as unknown as MatchState["squads"];
  return {
    state: {
      ...state,
      round: nextRound,
      phase: "MOVEMENT_PLOT",
      constructs: newConstructs,
      squads: squadsTuple,
    },
    events,
  };
}
