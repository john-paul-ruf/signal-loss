/**
 * Pure helpers that transform HumanDraftState into the canonical
 * committed `SquadMovePlots` / `SquadAttackPlot`. Kept outside the
 * store implementation so tests can hit them without spinning up
 * Zustand.
 *
 * Invariant: these helpers NEVER copy a draft into a MatchState field.
 * They produce SquadPlot values which the engine consumes.
 */

import type {
  AttackPlot,
  ConstructId,
  MatchState,
  MovePlot,
  PostureAssignment,
  SquadAttackPlot,
  SquadId,
  SquadMovePlots,
} from "../../../engine";
import { constructsOfSquad, legalMovePlot } from "../../../engine";
import type { Catalog } from "../../../engine";
import type { HumanDraftState } from "./types";

/**
 * Build the human squad's SquadMovePlots from drafts. Empty path for
 * every construct not explicitly plotted (HOLD). Rejected drafts fall
 * back to HOLD so the commit call never gets a legality violation from
 * a stale draft that no longer clears the wall — the caller is expected
 * to have surfaced the rejection at edit time.
 */
export function buildHumanMovePlot(
  state: MatchState,
  squad: SquadId,
  drafts: HumanDraftState,
  catalog: Catalog,
): SquadMovePlots {
  const own = constructsOfSquad(state, squad).filter((c) => !c.destroyed);
  const moves: MovePlot[] = [];
  for (const c of own) {
    if (drafts.holdSet.has(c.id as number)) {
      moves.push({ constructId: c.id, path: [] });
      continue;
    }
    const raw = drafts.moveDrafts.get(c.id as number);
    if (raw === undefined || raw.length === 0) {
      moves.push({ constructId: c.id, path: [] });
      continue;
    }
    const legal = legalMovePlot(state, c.id, raw, catalog);
    if (legal.ok) moves.push(legal.value);
    else moves.push({ constructId: c.id, path: [] });
  }
  moves.sort((a, b) => (a.constructId as number) - (b.constructId as number));
  return { squadId: squad, moves };
}

/**
 * Compose the human squad's SquadAttackPlot from drafts. Constructs
 * with neither an attack draft nor a posture draft simply don't appear.
 * The engine's `legalAttackPlot` will surface any invalid entry.
 */
export function buildHumanAttackPlot(
  state: MatchState,
  squad: SquadId,
  drafts: HumanDraftState,
): SquadAttackPlot {
  const own = constructsOfSquad(state, squad).filter((c) => !c.destroyed);
  const ownIds = new Set(own.map((c) => c.id as number));
  const attacks: AttackPlot[] = [];
  for (const [cid, draft] of drafts.attackDrafts) {
    if (!ownIds.has(cid)) continue;
    attacks.push({
      constructId: cid as unknown as ConstructId,
      targetId: draft.targetId,
      called: draft.called,
    });
  }
  attacks.sort((a, b) => (a.constructId as number) - (b.constructId as number));
  const postures: PostureAssignment[] = [];
  for (const [cid, posture] of drafts.postureDrafts) {
    if (!ownIds.has(cid)) continue;
    postures.push({ constructId: cid as unknown as ConstructId, posture });
  }
  postures.sort((a, b) => (a.constructId as number) - (b.constructId as number));
  return { squadId: squad, attacks, postures };
}

/**
 * Count implicit HOLDs — living own constructs with neither an
 * explicit HOLD nor an in-progress path. Used by the commit
 * confirmation modal (design.md §5.6).
 */
export function countImplicitHolds(
  state: MatchState,
  squad: SquadId,
  drafts: HumanDraftState,
): number {
  let n = 0;
  const own = constructsOfSquad(state, squad).filter((c) => !c.destroyed);
  for (const c of own) {
    if (drafts.holdSet.has(c.id as number)) continue;
    const raw = drafts.moveDrafts.get(c.id as number);
    if (raw === undefined || raw.length === 0) n = n + 1;
  }
  return n;
}

/**
 * True iff every own construct has either a plotted move or an
 * explicit HOLD. Used to decide whether the commit button is armed.
 */
export function everyConstructAccountedFor(
  state: MatchState,
  squad: SquadId,
  drafts: HumanDraftState,
): boolean {
  const own = constructsOfSquad(state, squad).filter((c) => !c.destroyed);
  for (const c of own) {
    if (drafts.holdSet.has(c.id as number)) continue;
    const raw = drafts.moveDrafts.get(c.id as number);
    if (raw === undefined || raw.length === 0) return false;
  }
  return true;
}

/**
 * Pool spend from drafts — sum of called shots + POSTURE assignments
 * over the human squad's living constructs. Used to render the
 * "PROJECTED SPEND" section and to disable overspend at plot time.
 */
export function projectedPoolSpend(
  state: MatchState,
  squad: SquadId,
  drafts: HumanDraftState,
): { readonly called: number; readonly postures: number; readonly total: number } {
  const own = constructsOfSquad(state, squad).filter((c) => !c.destroyed);
  const ownIds = new Set(own.map((c) => c.id as number));
  let called = 0;
  let postures = 0;
  for (const [cid, draft] of drafts.attackDrafts) {
    if (!ownIds.has(cid)) continue;
    if (draft.called) called = called + 1;
  }
  for (const [cid, p] of drafts.postureDrafts) {
    if (!ownIds.has(cid)) continue;
    if (p === "POSTURE") postures = postures + 1;
  }
  return { called, postures, total: called + postures };
}
