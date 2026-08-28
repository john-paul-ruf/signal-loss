/**
 * Selectors — narrow lenses over the match store used by React
 * components. Each selector reads from ONE slice so a pointer overlay
 * change (selection slice) does not rerender a rail row (drafts /
 * engine slice) or a canvas terrain layer (engine slice).
 *
 * Selectors are pure and referentially transparent — passing the same
 * state twice returns the same array/object/id.
 */

import type {
  ConstructId,
  KnownConstruct,
  MatchConstruct,
  MatchState,
  PoolBreakdown,
  PublicState,
  SquadId,
} from "../../../engine";
import {
  constructsOfSquad,
  getConstruct,
  poolFor,
  publicView,
} from "../../../engine";
import type { MatchStore, MatchStoreState } from "./match-store";

/* ------------------------------------------------------------------------- */
/* Engine-slice selectors                                                     */
/* ------------------------------------------------------------------------- */

export function selectEngine(s: MatchStore | MatchStoreState): MatchState | null {
  return s.engine;
}

export function selectMode(s: MatchStore | MatchStoreState): MatchStore["mode"] {
  return s.mode;
}

export function selectRound(s: MatchStore | MatchStoreState): number {
  return s.engine?.round ?? 0;
}

export function selectHumanSquadId(s: MatchStore | MatchStoreState): SquadId | null {
  return s.launch?.humanSquadId ?? null;
}

export function selectHumanConstructs(
  s: MatchStore | MatchStoreState,
): readonly MatchConstruct[] {
  if (s.engine === null || s.launch === null) return [];
  return constructsOfSquad(s.engine, s.launch.humanSquadId);
}

export function selectConstruct(
  s: MatchStore | MatchStoreState,
  id: ConstructId,
): MatchConstruct | undefined {
  if (s.engine === null) return undefined;
  return getConstruct(s.engine, id);
}

/**
 * Compute the human's PublicState. Cached only per (engine revision,
 * catalog reference) — callers who read this on every render should
 * memoize.
 */
export function selectHumanPublicView(
  s: MatchStore | MatchStoreState,
): PublicState | null {
  if (s.engine === null || s.catalog === null || s.launch === null) return null;
  return publicView(s.engine, s.launch.humanSquadId, s.catalog);
}

export function selectKnownEnemyList(
  s: MatchStore | MatchStoreState,
): readonly KnownConstruct[] {
  const pv = selectHumanPublicView(s);
  if (pv === null) return [];
  const hsq = s.launch?.humanSquadId as number;
  return pv.constructs.filter((k) => (k.base.squadId as number) !== hsq);
}

export function selectHumanPool(
  s: MatchStore | MatchStoreState,
): PoolBreakdown | null {
  if (s.engine === null || s.catalog === null || s.launch === null) return null;
  return poolFor(s.engine, s.launch.humanSquadId, s.catalog);
}

/* ------------------------------------------------------------------------- */
/* Drafts slice                                                               */
/* ------------------------------------------------------------------------- */

export function selectMoveDraftFor(
  s: MatchStore | MatchStoreState,
  cid: ConstructId,
): readonly { x: number; y: number }[] | undefined {
  const draft = s.drafts.moveDrafts.get(cid as number);
  if (draft === undefined) return undefined;
  return draft.map((v) => ({ x: v.x as number, y: v.y as number }));
}

export function selectHold(s: MatchStore | MatchStoreState, cid: ConstructId): boolean {
  return s.drafts.holdSet.has(cid as number);
}

export function selectAttackDraft(
  s: MatchStore | MatchStoreState,
  cid: ConstructId,
): { readonly targetId: ConstructId; readonly called: boolean } | undefined {
  return s.drafts.attackDrafts.get(cid as number);
}

export function selectPostureDraft(
  s: MatchStore | MatchStoreState,
  cid: ConstructId,
): "FLAT" | "POSTURE" | undefined {
  return s.drafts.postureDrafts.get(cid as number);
}

/* ------------------------------------------------------------------------- */
/* AI slice                                                                   */
/* ------------------------------------------------------------------------- */

export function selectAiSlot(s: MatchStore | MatchStoreState, sq: SquadId): unknown {
  return s.ai.get(sq as number);
}

export function selectAiPendingCount(s: MatchStore | MatchStoreState): number {
  let n = 0;
  for (const [, slot] of s.ai) {
    const record = slot as { kind: string };
    if (record.kind === "PENDING") n = n + 1;
  }
  return n;
}

export function selectAllAiReady(
  s: MatchStore | MatchStoreState,
  aiIds: readonly SquadId[],
  requiredKind: "READY" | "READY_DEPLOY",
): boolean {
  for (const sq of aiIds) {
    const slot = s.ai.get(sq as number);
    const record = slot as { kind?: string } | undefined;
    if (record === undefined || record.kind !== requiredKind) return false;
  }
  return true;
}

/* ------------------------------------------------------------------------- */
/* Selection slice                                                            */
/* ------------------------------------------------------------------------- */

export function selectSelectedId(
  s: MatchStore | MatchStoreState,
): ConstructId | null {
  return s.selection.selectedConstructId;
}

export function selectInspectedId(
  s: MatchStore | MatchStoreState,
): ConstructId | null {
  return s.selection.inspectedConstructId;
}

export function selectHoveredTarget(
  s: MatchStore | MatchStoreState,
): ConstructId | null {
  return s.selection.hoveredTargetId;
}

export function selectRulesDrawer(
  s: MatchStore | MatchStoreState,
): { open: boolean; anchor: string | null } {
  return {
    open: s.selection.rulesDrawerOpen,
    anchor: s.selection.rulesDrawerAnchor,
  };
}

/* ------------------------------------------------------------------------- */
/* Playback slice                                                             */
/* ------------------------------------------------------------------------- */

export function selectPlayback(s: MatchStore | MatchStoreState): MatchStore["playback"] {
  return s.playback;
}

export function selectPlaybackDone(s: MatchStore | MatchStoreState): boolean {
  const p = s.playback;
  return p.events.length > 0 && p.cursor >= p.events.length;
}

/* ------------------------------------------------------------------------- */
/* Presentation slice                                                         */
/* ------------------------------------------------------------------------- */

export function selectPresent(
  s: MatchStore | MatchStoreState,
): MatchStore["present"] {
  return s.present;
}
