/**
 * MatchLog: the versioned, replayable record of a match (arch §6.3, FR-29).
 *
 * Contents:
 *   - `formatVersion` — reject an older log rather than guess.
 *   - `seed`, `budget`, `archetype`, `aiTier` — the setup contract.
 *   - `catalogHash`, `tunablesHash` — the balance contract. A replay
 *     against an edited catalog fails LOUDLY here, never diverges silently.
 *   - `rosterShareStrings` — five SL1 share strings for the rosters.
 *     Reconstruction goes through `codec.decode`, so an SL1 change
 *     surfaces as a decoding failure at fold time.
 *   - `deployments` — the round-1 simultaneous placements.
 *   - `plots` — one committed `SquadPlots` tuple per round.
 *
 * The fold API replays the log by:
 *   1. Verifying catalog / tunables hashes against the current catalog.
 *   2. Decoding roster share strings.
 *   3. `createMatch` → `applyDeployments`.
 *   4. `resolveRound` per plot tuple.
 * Returns the terminal state and the (canonically ordered) event log.
 */

import type { ArchetypeId, Budget, Catalog } from "../catalog/index";
import type { Roster, Violation } from "../build/index";
import { decode } from "../codec/index";
import type { Event } from "./events";
import { sortEventsCanonical } from "./events";
import type { MatchState, Placement } from "./state";
import { createMatch } from "./state";
import { applyDeployments } from "./deployment";
import { resolveRound } from "./resolve-round";
import type { SquadPlots } from "./plot";
import { encodeRoster } from "../codec/index";

/** The current MatchLog format version. Bump when the schema breaks. */
export const MATCH_LOG_VERSION = 1 as const;

export interface MatchLog {
  readonly formatVersion: typeof MATCH_LOG_VERSION;
  readonly seed: string;
  readonly budget: Budget;
  readonly archetype: ArchetypeId | "any";
  readonly aiTier: number;
  readonly catalogHash: string;
  readonly tunablesHash: string;
  readonly rosterShareStrings: readonly [string, string, string, string, string];
  readonly deployments: readonly [
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
  ];
  /** One `SquadPlots` tuple per round in ascending round order. */
  readonly plots: readonly (readonly [
    SquadPlots,
    SquadPlots,
    SquadPlots,
    SquadPlots,
    SquadPlots,
  ])[];
}

/**
 * Distinguishable failure conditions when replaying a MatchLog. The
 * fold is a strict operation; every failure has a specific kind.
 */
export type MatchLogError =
  | { readonly kind: "VERSION_UNSUPPORTED"; readonly version: number }
  | { readonly kind: "CATALOG_HASH_MISMATCH"; readonly expected: string; readonly actual: string }
  | { readonly kind: "TUNABLES_HASH_MISMATCH"; readonly expected: string; readonly actual: string }
  | { readonly kind: "ROSTER_DECODE_FAILED"; readonly squad: number; readonly detail: string }
  | { readonly kind: "SETUP_FAILED"; readonly violations: readonly Violation[] }
  | { readonly kind: "DEPLOYMENT_FAILED"; readonly violations: readonly Violation[] }
  | { readonly kind: "ROUND_FAILED"; readonly round: number; readonly violations: readonly Violation[] };

export type MatchLogResult =
  | { readonly ok: true; readonly value: { readonly state: MatchState; readonly events: readonly Event[] } }
  | { readonly ok: false; readonly error: MatchLogError };

/**
 * Build a MatchLog from a completed initial setup + a list of per-round
 * plots. `rosters` are encoded through the codec — if any roster fails
 * codec validation the returned log is unfrozen (caller error).
 */
export function makeMatchLog(input: {
  readonly seed: string;
  readonly budget: Budget;
  readonly archetype: ArchetypeId | "any";
  readonly aiTier: number;
  readonly catalog: Catalog;
  readonly rosters: readonly [Roster, Roster, Roster, Roster, Roster];
  readonly deployments: MatchLog["deployments"];
  readonly plots: MatchLog["plots"];
}): MatchLog {
  const shares = input.rosters.map((r) => encodeRoster(r, input.budget, input.catalog)) as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    formatVersion: MATCH_LOG_VERSION,
    seed: input.seed,
    budget: input.budget,
    archetype: input.archetype,
    aiTier: input.aiTier,
    catalogHash: input.catalog.hashes.catalog,
    tunablesHash: input.catalog.hashes.tunables,
    rosterShareStrings: shares,
    deployments: input.deployments,
    plots: input.plots,
  };
}

/**
 * Fold a MatchLog through `createMatch` → `applyDeployments` →
 * `resolveRound` for every stored plot tuple. Returns the terminal
 * state and the full canonically-ordered event log. Fails loudly at the
 * first mismatch — never a silent migration.
 */
export function foldMatchLog(
  log: MatchLog,
  catalog: Catalog,
  map: MatchState["map"],
): MatchLogResult {
  if (log.formatVersion !== MATCH_LOG_VERSION) {
    return {
      ok: false,
      error: { kind: "VERSION_UNSUPPORTED", version: log.formatVersion },
    };
  }
  if (log.catalogHash !== catalog.hashes.catalog) {
    return {
      ok: false,
      error: {
        kind: "CATALOG_HASH_MISMATCH",
        expected: log.catalogHash,
        actual: catalog.hashes.catalog,
      },
    };
  }
  if (log.tunablesHash !== catalog.hashes.tunables) {
    return {
      ok: false,
      error: {
        kind: "TUNABLES_HASH_MISMATCH",
        expected: log.tunablesHash,
        actual: catalog.hashes.tunables,
      },
    };
  }
  const rosters: Roster[] = [];
  for (let i = 0; i < log.rosterShareStrings.length; i = i + 1) {
    const share = log.rosterShareStrings[i];
    if (share === undefined) continue;
    const decoded = decode(share, catalog);
    if (!decoded.ok) {
      return {
        ok: false,
        error: {
          kind: "ROSTER_DECODE_FAILED",
          squad: i,
          detail: JSON.stringify(decoded.error),
        },
      };
    }
    if (decoded.value.kind !== "roster") {
      return {
        ok: false,
        error: {
          kind: "ROSTER_DECODE_FAILED",
          squad: i,
          detail: `decoded a construct, not a roster`,
        },
      };
    }
    rosters.push(decoded.value.roster);
  }
  const created = createMatch({
    seed: log.seed,
    budget: log.budget,
    aiTier: log.aiTier,
    catalog,
    map,
    rosters: rosters as unknown as [Roster, Roster, Roster, Roster, Roster],
  });
  if (!created.ok) {
    return { ok: false, error: { kind: "SETUP_FAILED", violations: created.error } };
  }
  const deployed = applyDeployments(created.value, log.deployments, catalog);
  if (!deployed.ok) {
    return { ok: false, error: { kind: "DEPLOYMENT_FAILED", violations: deployed.error } };
  }
  let state = deployed.value;
  const events: Event[] = [];
  for (let i = 0; i < log.plots.length; i = i + 1) {
    const plotTuple = log.plots[i];
    if (plotTuple === undefined) continue;
    if (state.phase === "COMPLETE") break;
    const result = resolveRound(state, plotTuple, catalog);
    if (!result.ok) {
      return {
        ok: false,
        error: {
          kind: "ROUND_FAILED",
          round: state.round,
          violations: result.error,
        },
      };
    }
    state = result.value.state;
    events.push(...result.value.events);
  }
  return { ok: true, value: { state, events: sortEventsCanonical(events) } };
}
