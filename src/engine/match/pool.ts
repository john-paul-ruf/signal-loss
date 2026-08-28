/**
 * Reaction pool computation (FR-17).
 *
 * Formula (per commander type):
 *   pool = 1 + commander_base + floor(alive_constructs / R)
 * where `R` is looked up on the commander type's rLadder using the
 * commander's current dial position. Values past the ladder length reuse
 * the last entry.
 *
 * Commander destroyed makes BOTH commander-derived terms zero: pool = 1
 * for every remaining round. This is stored as a permanent squad flag
 * (`SquadState.commanderDead`) so once tripped it never restores — even
 * if the AI or codec ever loads a state that references a dial-zero
 * commander that "would" satisfy the ladder again.
 *
 * `poolFor(state, squadId, catalog)` returns the full breakdown so the UI
 * can render every term (design.md §5.7's pool ledger) and the FR-17
 * reference table can be reproduced from typed test fixtures.
 */

import type { Catalog } from "../catalog/index";
import type { MatchState, SquadId } from "./state";
import { constructsOfSquad } from "./state";

/**
 * FR-17 pool breakdown. Every consumer (UI ledger, replay, test suites)
 * reads the same shape.
 */
export interface PoolBreakdown {
  readonly total: number;
  readonly terms: readonly [
    { readonly kind: "BASE"; readonly value: 1 },
    { readonly kind: "COMMANDER"; readonly value: number },
    {
      readonly kind: "UNITS";
      readonly alive: number;
      readonly divisor: number;
      readonly value: number;
    },
  ];
  readonly commanderLost: boolean;
}

/**
 * Compute one squad's pool. `catalog` is required to resolve the
 * commander's rLadder. Commander loss (state.squads[id].commanderDead)
 * is authoritative — regardless of what commander construct still
 * exists, a lost commander collapses pool to 1.
 */
export function poolFor(
  state: MatchState,
  squad: SquadId,
  catalog: Catalog,
): PoolBreakdown {
  const squadState = state.squads[squad as number];
  if (squadState === undefined) {
    return frozenCollapsed(0, 0);
  }
  const alive = countAlive(state, squad);
  if (squadState.commanderDead) {
    return frozenCollapsed(alive, 0);
  }
  // Locate the commander construct within the squad.
  const owns = constructsOfSquad(state, squad);
  const commander = owns.find((c) => c.commanderCode !== null);
  if (commander === undefined || commander.destroyed) {
    // Same collapse — the flag will be set at end-round, but the calling
    // path (start-of-round refill) may still see the dial-zero commander
    // in transient states. Defensive fallback.
    return frozenCollapsed(alive, 0);
  }
  if (commander.commanderCode === null) return frozenCollapsed(alive, 0);
  const commanderType = catalog.indexes.commanderTypeByCode.get(commander.commanderCode);
  if (commanderType === undefined) {
    return frozenCollapsed(alive, 0);
  }
  const ladder = commanderType.rLadder;
  const ladderIdx = Math.min(commander.dialIndex, ladder.length - 1);
  const divisor = ladder[ladderIdx] ?? 8;
  const unitTerm = Math.floor(alive / divisor);
  const commanderTerm = commanderType.commanderBase;
  const total = 1 + commanderTerm + unitTerm;
  return {
    total,
    terms: [
      { kind: "BASE", value: 1 },
      { kind: "COMMANDER", value: commanderTerm },
      { kind: "UNITS", alive, divisor, value: unitTerm },
    ],
    commanderLost: false,
  };
}

/** Number of alive constructs in a squad. */
export function countAlive(state: MatchState, squad: SquadId): number {
  let n = 0;
  for (const c of state.constructs) {
    if ((c.squadId as number) === (squad as number) && !c.destroyed) n = n + 1;
  }
  return n;
}

function frozenCollapsed(alive: number, divisor: number): PoolBreakdown {
  return {
    total: 1,
    terms: [
      { kind: "BASE", value: 1 },
      { kind: "COMMANDER", value: 0 },
      { kind: "UNITS", alive, divisor, value: 0 },
    ],
    commanderLost: true,
  };
}
