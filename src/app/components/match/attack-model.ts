import type {
  Catalog,
  ConstructId,
  ExchangeCard,
  MatchState,
  PublicState,
  ShotOutcome,
} from "../../../engine";
import { effectiveDialLength, exchangePreview } from "../../../engine";

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
