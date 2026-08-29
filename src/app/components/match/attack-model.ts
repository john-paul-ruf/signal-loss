import type {
  Catalog,
  ConstructId,
  Event,
  ExchangeCard,
  MatchConstruct,
  MatchState,
  PublicState,
  ShotOutcome,
  SquadId,
} from "../../../engine";
import { effectiveDialLength, exchangePreview } from "../../../engine";
import type { HumanDraftState } from "../../store/match";
import { projectedPoolSpend } from "../../store/match";

export interface DialTransition {
  readonly from: number;
  readonly to: number;
}

export interface AttackOutcomeCell {
  readonly outcome: ShotOutcome;
  readonly dial: DialTransition;
}

export interface AttackExchangeModel {
  readonly attackerId: ConstructId;
  readonly targetId: ConstructId;
  readonly isTargetConfirmed: boolean;
  readonly positionLabel: "POSITION CONFIRMED" | "POSITION UNCONFIRMED · AT LAST CONFIRMED POSITION";
  readonly normal: {
    readonly flat: AttackOutcomeCell;
    readonly posture: AttackOutcomeCell;
  };
  readonly called: {
    readonly flat: AttackOutcomeCell;
    readonly posture: AttackOutcomeCell;
  };
}

export interface PoolBalance {
  readonly total: number;
  readonly spent: number;
  readonly remaining: number;
  readonly overspentBy: number;
}

export type GuardedToggle =
  | { readonly accepted: true; readonly active: boolean; readonly balance: PoolBalance }
  | { readonly accepted: false; readonly reason: "NO_TARGET" | "POOL_EXHAUSTED"; readonly balance: PoolBalance };

export type AttackHitCommand =
  | { readonly kind: "NONE" }
  | { readonly kind: "SELECT"; readonly constructId: ConstructId }
  | { readonly kind: "TARGET"; readonly attackerId: ConstructId; readonly targetId: ConstructId };

/**
 * Preview an exchange against the human observer's public positions. The
 * app-only state copy is never stored and all rule math remains in M09.
 */
export function buildAttackExchangeModel(
  state: MatchState,
  publicState: PublicState,
  attackerId: ConstructId,
  targetId: ConstructId,
  catalog: Catalog,
): AttackExchangeModel | null {
  const publicPositions = new Map(
    publicState.constructs.map((construct) => [construct.base.id as number, construct.position]),
  );
  const hypothetical: MatchState = {
    ...state,
    constructs: state.constructs.map((construct) => ({
      ...construct,
      position: publicPositions.get(construct.id as number) ?? construct.position,
    })),
  };
  const normal = exchangePreview(hypothetical, attackerId, targetId, false, catalog);
  const called = exchangePreview(hypothetical, attackerId, targetId, true, catalog);
  const target = hypothetical.constructs.find((construct) => construct.id === targetId);
  const publicTarget = publicState.constructs.find((construct) => construct.base.id === targetId);
  if (normal === null || called === null || target === undefined || publicTarget === undefined) {
    return null;
  }

  const dialLength = effectiveDialLength(target, catalog);
  return {
    attackerId,
    targetId,
    isTargetConfirmed: publicTarget.confirmed,
    positionLabel: publicTarget.confirmed
      ? "POSITION CONFIRMED"
      : "POSITION UNCONFIRMED · AT LAST CONFIRMED POSITION",
    normal: cellsFor(normal, target.dialIndex, dialLength),
    called: cellsFor(called, target.dialIndex, dialLength),
  };
}

export function outcomeReason(outcome: ShotOutcome): string {
  switch (outcome.reason) {
    case "OK":
      return "SHOT LANDS";
    case "OUT_OF_RANGE":
      return "OUT OF RANGE";
    case "NO_LOS":
      return "NO LINE OF SIGHT";
    case "TARGET_DESTROYED":
      return "TARGET DESTROYED";
    case "SELF_TARGET":
      return "SELF TARGET";
  }
}

export function poolBalance(
  state: MatchState,
  squadId: SquadId,
  drafts: HumanDraftState,
  poolTotal: number,
): PoolBalance {
  const spent = projectedPoolSpend(state, squadId, drafts).total;
  return {
    total: poolTotal,
    spent,
    remaining: Math.max(0, poolTotal - spent),
    overspentBy: Math.max(0, spent - poolTotal),
  };
}

export function guardCalledToggle(
  state: MatchState,
  squadId: SquadId,
  drafts: HumanDraftState,
  poolTotal: number,
  constructId: ConstructId,
): GuardedToggle {
  const balance = poolBalance(state, squadId, drafts, poolTotal);
  const attack = drafts.attackDrafts.get(constructId as number);
  if (attack === undefined) return { accepted: false, reason: "NO_TARGET", balance };
  if (attack.called) return { accepted: true, active: false, balance };
  if (balance.remaining === 0) return { accepted: false, reason: "POOL_EXHAUSTED", balance };
  return { accepted: true, active: true, balance };
}

export function guardPostureToggle(
  state: MatchState,
  squadId: SquadId,
  drafts: HumanDraftState,
  poolTotal: number,
  constructId: ConstructId,
): GuardedToggle {
  const balance = poolBalance(state, squadId, drafts, poolTotal);
  if (drafts.postureDrafts.get(constructId as number) === "POSTURE") {
    return { accepted: true, active: false, balance };
  }
  if (balance.remaining === 0) return { accepted: false, reason: "POOL_EXHAUSTED", balance };
  return { accepted: true, active: true, balance };
}

export function routeAttackHit(
  constructs: readonly MatchConstruct[],
  humanSquadId: SquadId,
  selectedId: ConstructId | null,
  hitId: ConstructId | null,
): AttackHitCommand {
  if (hitId === null) return { kind: "NONE" };
  const hit = constructs.find((construct) => construct.id === hitId);
  if (hit === undefined || hit.destroyed) return { kind: "NONE" };
  if (hit.squadId === humanSquadId) return { kind: "SELECT", constructId: hit.id };
  const selected = constructs.find((construct) => construct.id === selectedId);
  if (selected === undefined || selected.destroyed || selected.squadId !== humanSquadId) {
    return { kind: "NONE" };
  }
  return { kind: "TARGET", attackerId: selected.id, targetId: hit.id };
}

export function committedHumanSpend(
  events: readonly Event[],
  beforeState: MatchState,
  humanSquadId: SquadId,
): { readonly called: number; readonly postures: number; readonly total: number } {
  const humanIds = new Set(
    beforeState.constructs
      .filter((construct) => construct.squadId === humanSquadId)
      .map((construct) => construct.id as number),
  );
  let called = 0;
  let postures = 0;
  for (const event of events) {
    if (event.kind === "SHOT" && event.called && humanIds.has(event.attackerId as number)) called += 1;
    if (event.kind === "POSTURE_REVEAL" && event.posture === "POSTURE" && event.squadId === humanSquadId) {
      postures += 1;
    }
  }
  return { called, postures, total: called + postures };
}

function cellsFor(
  card: ExchangeCard,
  dialIndex: number,
  dialLength: number,
): { readonly flat: AttackOutcomeCell; readonly posture: AttackOutcomeCell } {
  return {
    flat: cellFor(card.vsFlat, dialIndex, dialLength),
    posture: cellFor(card.vsPosture, dialIndex, dialLength),
  };
}

function cellFor(outcome: ShotOutcome, dialIndex: number, dialLength: number): AttackOutcomeCell {
  return {
    outcome,
    dial: {
      from: dialIndex,
      to: Math.min(dialLength, dialIndex + outcome.damage),
    },
  };
}
