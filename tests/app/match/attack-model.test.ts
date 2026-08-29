import { describe, expect, it } from "vitest";
import {
  effectiveDialLength,
  exchangePreview,
  publicView,
  squadId,
  type ConstructId,
  type MatchState,
  type PublicState,
  type Vec2,
} from "../../../src/engine";
import { buildAttackExchangeModel, outcomeReason } from "../../../src/app/components/match/attack-model";
import { makeCloseSoloMatch, testCatalog } from "../../fixtures/matches/simple-match";

function publicCopyState(state: MatchState, view: PublicState): MatchState {
  const positions = new Map(view.constructs.map((construct) => [construct.base.id as number, construct.position]));
  return {
    ...state,
    constructs: state.constructs.map((construct) => ({
      ...construct,
      position: positions.get(construct.id as number) ?? construct.position,
    })),
  };
}

function confirmedView(state: MatchState): PublicState {
  const view = publicView(state, squadId(0), testCatalog());
  return {
    ...view,
    constructs: view.constructs.map((known) => {
      const authoritative = state.constructs.find((construct) => construct.id === known.base.id)!;
      return { ...known, position: authoritative.position, confirmedRound: state.round, confirmed: true, driftRadius: 0 as never };
    }),
  };
}

function withGhost(
  state: MatchState,
  targetId: ConstructId,
  publicPosition: Vec2,
): { readonly state: MatchState; readonly view: PublicState } {
  const ghostState: MatchState = {
    ...state,
    knownPositions: state.knownPositions.map((entry) =>
      entry.observer === squadId(0) && entry.subject === targetId
        ? { ...entry, position: publicPosition, confirmedRound: 0 }
        : entry,
    ),
  };
  return { state: ghostState, view: publicView(ghostState, squadId(0), testCatalog()) };
}

describe("attack model", () => {
  it("sources all four cells from normal and called engine previews", () => {
    const catalog = testCatalog();
    const state = makeCloseSoloMatch();
    const view = confirmedView(state);
    const attackerId = state.constructs[0]!.id;
    const targetId = state.constructs[1]!.id;
    const hypothetical = publicCopyState(state, view);
    const normal = exchangePreview(hypothetical, attackerId, targetId, false, catalog)!;
    const called = exchangePreview(hypothetical, attackerId, targetId, true, catalog)!;

    const model = buildAttackExchangeModel(state, view, attackerId, targetId, catalog)!;

    expect(model.normal.flat.outcome).toEqual(normal.vsFlat);
    expect(model.normal.posture.outcome).toEqual(normal.vsPosture);
    expect(model.called.flat.outcome).toEqual(called.vsFlat);
    expect(model.called.posture.outcome).toEqual(called.vsPosture);
    expect(model.normal.posture.outcome.damage).toBe(0);
    expect(model.called.flat.outcome.damage).toBeGreaterThanOrEqual(1);
    expect(model.called.posture.outcome.damage).toBeGreaterThanOrEqual(1);
  });

  it("reports exact invalid reasons and projected dial transitions", () => {
    const catalog = testCatalog();
    const state = makeCloseSoloMatch();
    const attackerId = state.constructs[0]!.id;
    const target = state.constructs[1]!;
    const far = { x: 15 * 1024 as never, y: 15 * 1024 as never };
    const ghost = withGhost(state, target.id, far);
    const model = buildAttackExchangeModel(ghost.state, ghost.view, attackerId, target.id, catalog)!;

    expect(model.normal.flat.outcome.reason).toBe("OUT_OF_RANGE");
    expect(outcomeReason(model.normal.flat.outcome)).toBe("OUT OF RANGE");
    expect(model.normal.flat.dial).toEqual({ from: target.dialIndex, to: target.dialIndex });
    expect(model.called.flat.dial.to).toBe(
      Math.min(effectiveDialLength(target, catalog), target.dialIndex + model.called.flat.outcome.damage),
    );
  });

  it("uses a ghost's last-confirmed position without exposing authoritative range or LOS", () => {
    const catalog = testCatalog();
    const base = makeCloseSoloMatch();
    const attacker = base.constructs[0]!;
    const target = base.constructs[1]!;
    const authoritativeFar: MatchState = {
      ...base,
      constructs: base.constructs.map((construct) =>
        construct.id === target.id
          ? { ...construct, position: { x: 15 * 1024 as never, y: 15 * 1024 as never } }
          : construct,
      ),
    };
    const publicNear = { x: 1024 as never, y: 5 * 1024 as never };
    const ghost = withGhost(authoritativeFar, target.id, publicNear);
    const hidden = exchangePreview(authoritativeFar, attacker.id, target.id, false, catalog)!;

    const model = buildAttackExchangeModel(ghost.state, ghost.view, attacker.id, target.id, catalog)!;

    expect(hidden.vsFlat.reason).toBe("OUT_OF_RANGE");
    expect(model.normal.flat.outcome.reason).toBe("OK");
    expect(model.isTargetConfirmed).toBe(false);
    expect(model.positionLabel).toBe("POSITION UNCONFIRMED · AT LAST CONFIRMED POSITION");
  });

  it("uses exact public positions for own and confirmed constructs and leaves inputs untouched", () => {
    const catalog = testCatalog();
    const state = makeCloseSoloMatch();
    const view = confirmedView(state);
    const beforeState = structuredClone(state);
    const beforeView = structuredClone(view);
    const attackerId = state.constructs[0]!.id;
    const targetId = state.constructs[1]!.id;

    const model = buildAttackExchangeModel(state, view, attackerId, targetId, catalog)!;
    const exact = exchangePreview(publicCopyState(state, view), attackerId, targetId, false, catalog)!;

    expect(model.normal.flat.outcome).toEqual(exact.vsFlat);
    expect(model.positionLabel).toBe("POSITION CONFIRMED");
    expect(state).toEqual(beforeState);
    expect(view).toEqual(beforeView);
  });
});
