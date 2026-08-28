/**
 * Deterministic legal AI roster generation (FR-9, FR-22).
 *
 * The AI generates rosters from the SAME generic catalog + build validators
 * a human sees; there is no chassis identity table and no "AI-only" mount.
 * Given equal (rng, budget, catalog) the result is byte-identical, and two
 * distinct rng streams tend toward two distinct rosters (property tested,
 * not guaranteed for tiny catalogs).
 *
 * Algorithm:
 *   1. Enumerate every legal commanded construct whose cost fits the
 *      budget, deterministically by (commander code, chassis code, mount
 *      ordering).
 *   2. Enumerate every legal non-commanded construct whose cost fits the
 *      budget, likewise deterministically.
 *   3. Shuffle both lists via the caller-supplied rng.
 *   4. Take the first commanded construct that fits; add it to the roster.
 *   5. Greedily add non-commanded constructs while (roster.size < MAX_SQUAD)
 *      AND (remaining budget ≥ construct cost).
 *   6. Run `validateRoster` on the result. Legality violations here are a
 *      DEFECT — the generator only assembles legal parts.
 *
 * "First fit" over the shuffled candidate list gives variety across seeds
 * without invoking any tier-specific heuristic — the roster is the seed's
 * fair snapshot, not a tuned choice. AI tier plays no part in roster
 * composition; that would be a fairness violation.
 */

import type { Budget, Catalog } from "../catalog/index";
import type { Rng } from "../rng/index";
import { shuffle } from "../rng/index";
import {
  type Construct,
  type Roster,
  constructCost,
  enumerateConstructsForChassis,
  validateRoster,
} from "../build/index";
import type { AiFailure, AiResult } from "./types";

/**
 * Result of `generateAiRoster`: the fresh roster plus the advanced rng.
 * Callers thread the rng into deployment / plotting so the whole match
 * behaves as one deterministic sequence.
 */
export interface AiRosterResult {
  readonly roster: Roster;
  readonly rng: Rng;
}

/**
 * Build a legal AI roster.
 *
 * `rng` must be a caller-scoped named stream (e.g. `stream(root, "ai.squad3.roster")`);
 * the function does no seed derivation of its own. Returned `rng` is the
 * post-draw state — pass it forward into deployment.
 */
export function generateAiRoster(
  rng: Rng,
  budget: Budget,
  catalog: Catalog,
): AiResult<AiRosterResult> {
  const commanders = catalog.commanderTypes
    .slice()
    .sort((a, b) => (a.code as number) - (b.code as number));
  const chassisList = catalog.chassis
    .slice()
    .sort((a, b) => (a.code as number) - (b.code as number));
  const budgetCeil = budget as number;
  const maxSquad = catalog.tunables.MAX_SQUAD;

  const commanded: Construct[] = [];
  const noncommanded: Construct[] = [];

  for (const chassis of chassisList) {
    const chassisCost = chassis.cost;
    if (chassisCost > budgetCeil) continue;
    // Enumerate non-commander constructs for this chassis (empty commander).
    for (const c of enumerateConstructsForChassis(catalog, chassis.code, {
      commanderCode: null,
    })) {
      if (constructCost(c, catalog) <= budgetCeil) {
        noncommanded.push(c);
      }
    }
    // Enumerate commanded constructs for this chassis, one commander at a time.
    for (const cmd of commanders) {
      const commanderCost = cmd.cost;
      if (chassisCost + commanderCost > budgetCeil) continue;
      for (const c of enumerateConstructsForChassis(catalog, chassis.code, {
        commanderCode: cmd.code,
      })) {
        if (constructCost(c, catalog) <= budgetCeil) {
          commanded.push(c);
        }
      }
    }
  }

  if (commanded.length === 0) {
    const failure: AiFailure = {
      kind: "NO_LEGAL_ROSTER",
      message: `No commanded construct fits budget ${budgetCeil} in this catalog.`,
      budget: budgetCeil,
    };
    return { ok: false, error: failure };
  }

  // Shuffle both lists via the injected rng. `shuffle` returns a NEW rng.
  const [shuffledCmd, r1] = shuffle(rng, commanded);
  const [shuffledNon, r2] = shuffle(r1, noncommanded);

  // Pick the first commanded construct — every candidate here fits by
  // construction, so this is guaranteed non-empty.
  const commander = shuffledCmd[0];
  if (commander === undefined) {
    const failure: AiFailure = {
      kind: "NO_LEGAL_ROSTER",
      message: `Shuffled commander list is empty (internal defect).`,
      budget: budgetCeil,
    };
    return { ok: false, error: failure };
  }
  const constructs: Construct[] = [commander];
  let remainingBudget = budgetCeil - constructCost(commander, catalog);

  // Greedy first-fit addition of non-commander constructs.
  for (const c of shuffledNon) {
    if (constructs.length >= maxSquad) break;
    const cost = constructCost(c, catalog);
    if (cost <= remainingBudget) {
      constructs.push(c);
      remainingBudget = remainingBudget - cost;
    }
  }

  const roster: Roster = { constructs };
  const violations = validateRoster(roster, catalog, budget);
  if (violations.length > 0) {
    // Should be unreachable — every part above is individually legal and
    // budget bookkeeping is exact. Surface as a typed failure so callers
    // can log it, but do not fabricate a legal fallback.
    const failure: AiFailure = {
      kind: "ROSTER_INVALID",
      message: `Assembled roster failed validateRoster (internal defect).`,
      violations,
    };
    return { ok: false, error: failure };
  }

  return { ok: true, value: { roster, rng: r2 } };
}
