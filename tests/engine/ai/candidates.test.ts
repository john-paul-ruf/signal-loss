import { describe, expect, it } from "vitest";
import {
  generateAttackCandidates,
  generateMoveCandidates,
  generatePostureCandidates,
  ownAliveConstructs,
} from "../../../src/engine/ai/index";
import {
  legalAttackPlot,
  legalMovePlot,
  squadId,
  constructsOfSquad,
} from "../../../src/engine/match/index";
import type {
  AttackPlot,
  ConstructId,
  PostureAssignment,
} from "../../../src/engine/match/index";
import { publicView, updateKnownPositions } from "../../../src/engine/view/index";
import {
  makeCloseSoloMatch,
  makeDeployedSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

describe("ai/candidates / generateMoveCandidates", () => {
  it("always includes HOLD (empty path) as the first candidate", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    const own = constructsOfSquad(state, squadId(0));
    const cid = own[0]?.id;
    expect(cid).toBeDefined();
    if (cid === undefined) return;
    const candidates = generateMoveCandidates(view, cid, config.catalog);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.path).toEqual([]);
  });

  it("every returned candidate passes legalMovePlot", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    const own = constructsOfSquad(state, squadId(0));
    const cid = own[0]?.id;
    if (cid === undefined) throw new Error("no own construct");
    const candidates = generateMoveCandidates(view, cid, config.catalog);
    for (const c of candidates) {
      const res = legalMovePlot(state, cid, c.path, config.catalog);
      expect(res.ok, `candidate ${c.index} legal`).toBe(true);
    }
  });

  it("returns no candidates when construct is destroyed", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    // Force construct 0 to destroyed for this test.
    const forced = {
      ...state,
      constructs: state.constructs.map((c) =>
        (c.id as number) === 0 ? { ...c, destroyed: true, destroyedRound: 1 } : c,
      ),
    };
    const view = publicView(forced, squadId(0), config.catalog);
    const ownIds = own(forced);
    const cid = ownIds[0];
    if (cid === undefined) throw new Error("no own");
    const candidates = generateMoveCandidates(view, cid, config.catalog);
    expect(candidates.length).toBe(0);
  });

  it("returns no candidates when construct is not owned by observer", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    // squad 1's construct id
    const otherId = constructsOfSquad(state, squadId(1))[0]?.id;
    if (otherId === undefined) throw new Error("no other");
    const candidates = generateMoveCandidates(view, otherId, config.catalog);
    expect(candidates.length).toBe(0);
  });
});

describe("ai/candidates / generateAttackCandidates", () => {
  it("always includes NO-ATTACK as first candidate", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const view = publicView(withKnown, squadId(0), config.catalog);
    const own = constructsOfSquad(state, squadId(0));
    const cid = own[0]?.id;
    if (cid === undefined) throw new Error("no own");
    const candidates = generateAttackCandidates(view, cid, config.catalog);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.targetId).toBeNull();
  });

  it("attack candidates include both called and non-called variants when a target is legal", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    const view = publicView(withKnown, squadId(0), config.catalog);
    const own = constructsOfSquad(state, squadId(0));
    const cid = own[0]?.id;
    if (cid === undefined) throw new Error("no own");
    const candidates = generateAttackCandidates(view, cid, config.catalog);
    // If any real target is in range with LOS, it should generate both variants.
    const targets = candidates.filter((c) => c.targetId !== null);
    if (targets.length > 0) {
      const someCalled = candidates.some((c) => c.targetId !== null && c.called);
      const someNormal = candidates.some((c) => c.targetId !== null && !c.called);
      expect(someCalled).toBe(true);
      expect(someNormal).toBe(true);
    }
  });

  it("each attack candidate (excluding NO-ATTACK) is a legal SquadAttackPlot entry", () => {
    const state = makeCloseSoloMatch();
    const config = soloMatchConfig();
    const withKnown = updateKnownPositions(state, config.catalog);
    // Advance to ATTACK_PLOT so legalAttackPlot's phase check passes; wire
    // a pool for legality (poolSpend must not exceed poolTotal).
    const advanced = {
      ...withKnown,
      phase: "ATTACK_PLOT" as const,
      squads: withKnown.squads.map((s) => ({ ...s, poolTotal: 5 })) as unknown as typeof withKnown.squads,
    };
    const view = publicView(advanced, squadId(0), config.catalog);
    const own = constructsOfSquad(advanced, squadId(0));
    const cid = own[0]?.id;
    if (cid === undefined) throw new Error("no own");
    const candidates = generateAttackCandidates(view, cid, config.catalog);
    for (const c of candidates) {
      if (c.targetId === null) continue;
      const attackPlot: AttackPlot = {
        constructId: cid,
        targetId: c.targetId,
        called: c.called,
      };
      const postureList: readonly PostureAssignment[] = [];
      const violations = legalAttackPlot(advanced, squadId(0), {
        squadId: squadId(0),
        attacks: [attackPlot],
        postures: postureList,
      });
      expect(violations, `candidate ${c.index}`).toEqual([]);
    }
  });
});

describe("ai/candidates / generatePostureCandidates", () => {
  it("returns exactly FLAT and POSTURE for an alive own construct", () => {
    const state = makeDeployedSoloMatch();
    const config = soloMatchConfig();
    const view = publicView(state, squadId(0), config.catalog);
    const cid = ownAliveConstructs(view, squadId(0))[0]?.base.id;
    if (cid === undefined) throw new Error("no own");
    const candidates = generatePostureCandidates(view, cid);
    expect(candidates.length).toBe(2);
    expect(candidates.map((c) => c.posture).sort()).toEqual(["FLAT", "POSTURE"]);
  });
});

function own(state: ReturnType<typeof makeDeployedSoloMatch>): ConstructId[] {
  const list = constructsOfSquad(state, squadId(0));
  return list.map((c) => c.id);
}
