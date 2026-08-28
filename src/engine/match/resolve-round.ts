/**
 * The full FR-13 round pipeline, composed from the single implementations
 * declared in `movement.ts`, `attack.ts`, and `end-round.ts`.
 *
 *   resolveMovementPhase   MOVEMENT_PLOT → ATTACK_PLOT (positions updated)
 *   resolveAttackPhase     ATTACK_PLOT   → next round MOVEMENT_PLOT (or COMPLETE)
 *   resolveRound           MOVEMENT_PLOT → next round MOVEMENT_PLOT (or COMPLETE)
 *
 * `resolveRound` is `resolveMovementPhase` then `resolveAttackPhase`.
 * The staged functions are the same implementations the harness / replay
 * fold consumes; there is exactly one movement implementation and one
 * attack/end-round implementation.
 */

import type { Catalog } from "../catalog/index";
import type { Violation } from "../build/index";
import type { Event } from "./events";
import type { MatchState } from "./state";
import type { SquadAttackPlot, SquadMovePlots, SquadPlots } from "./plot";
import { attackPartOf, movePartOf } from "./plot";
import { resolveMovementPhase } from "./movement";
import { resolveAttackStage } from "./attack";
import {
  advanceRoundAndRefill,
  applyDestruction,
  applyTrace,
  checkElimination,
  snapshotStartOfRound,
} from "./end-round";
import { sortEventsCanonical } from "./events";

export interface RoundResult {
  readonly state: MatchState;
  readonly events: readonly Event[];
}

export type ResolveResult =
  | { readonly ok: true; readonly value: RoundResult }
  | { readonly ok: false; readonly error: readonly Violation[] };

/**
 * Full round transition. Composes the two staged functions. Emits the
 * canonical event log for the round in `sortEventsCanonical` order.
 */
export function resolveRound(
  state: MatchState,
  plots: readonly [SquadPlots, SquadPlots, SquadPlots, SquadPlots, SquadPlots],
  catalog: Catalog,
): ResolveResult {
  const moveInputs = plots.map(movePartOf) as unknown as readonly [
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
  ];
  const move = resolveMovementPhase(state, moveInputs, catalog);
  if (!move.ok) return { ok: false, error: move.error };
  const attackInputs = plots.map(attackPartOf) as unknown as readonly [
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
  ];
  const attack = resolveAttackPhase(move.value.state, attackInputs, catalog);
  if (!attack.ok) return { ok: false, error: attack.error };
  const events = sortEventsCanonical(move.value.events.concat(attack.value.events));
  return { ok: true, value: { state: attack.value.state, events } };
}

/**
 * Attack-phase transition. Applies attack damage, trace, destruction,
 * elimination, and refill in one atomic step. Used by the browser's
 * two-commit flow (movement commit, then attack commit) and by
 * `resolveRound`.
 */
export function resolveAttackPhase(
  state: MatchState,
  plots: readonly [
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
    SquadAttackPlot,
  ],
  catalog: Catalog,
): ResolveResult {
  // Snapshot start-of-round facts from the ATTACK_PLOT entry state — this
  // is the state after movement resolution but before any damage; per the
  // rules, movement applies no damage, so dial indices / alive counts
  // here equal the start-of-round values.
  const snapshot = snapshotStartOfRound(state, catalog);
  const attack = resolveAttackStage(state, plots, catalog);
  if (!attack.ok) return { ok: false, error: attack.error };

  const events: Event[] = attack.value.events.slice();

  const traced = applyTrace(attack.value.state, catalog);
  events.push(...traced.events);

  const destroyed = applyDestruction(traced.state, catalog, attack.value.attackerDamageDealt);
  events.push(...destroyed.events);

  const eliminated = checkElimination(destroyed.state, snapshot);
  events.push(...eliminated.events);

  if (eliminated.state.phase === "COMPLETE") {
    return { ok: true, value: { state: eliminated.state, events: sortEventsCanonical(events) } };
  }

  const advanced = advanceRoundAndRefill(eliminated.state, catalog);
  events.push(...advanced.events);
  return { ok: true, value: { state: advanced.state, events: sortEventsCanonical(events) } };
}
