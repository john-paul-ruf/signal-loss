/**
 * Match-store tests — pure logic (no DOM).
 *
 * Covers:
 *   1. Phase-flow order (DEPLOYMENT → MOVEMENT_PLOT → MOVEMENT_PLAYBACK → …).
 *   2. Human drafts stay OUT of MatchState (fresh MatchState is
 *      structurally cloneable with no draft field anywhere).
 *   3. AI slot bookkeeping (PENDING → READY → cleared on transition).
 *   4. Selector isolation (a pointer-only hover change updates ONLY the
 *      selection slice, not the drafts or engine slices).
 *   5. No timer field or wall-clock read anywhere in the store.
 */

import { describe, expect, it } from "vitest";
import {
  createMatchStore,
  buildHumanMovePlot,
  countImplicitHolds,
  projectedPoolSpend,
  matchSelectors,
} from "../../../src/app/store/match";
import type { AiStatus } from "../../../src/app/store/match";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core/flow-store";
import {
  soloRoster,
  testCatalog,
} from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import type { ConstructId, Fx } from "../../../src/engine";
import { constructId, squadId } from "../../../src/engine";

function makeLaunch(): CompleteMatchLaunchConfig {
  const humanRoster = soloRoster();
  return {
    human: {
      source: { kind: "saved", id: "roster:1", name: "test-roster" },
      roster: humanRoster,
      shareString: "SL1-human",
    },
    aiRosters: [
      { constructs: [{ chassisCode: 11 as never, commanderCode: 1 as never, mounts: [] }] },
      { constructs: [{ chassisCode: 12 as never, commanderCode: 2 as never, mounts: [] }] },
      { constructs: [{ chassisCode: 10 as never, commanderCode: 3 as never, mounts: [] }] },
      { constructs: [{ chassisCode: 11 as never, commanderCode: 2 as never, mounts: [] }] },
    ],
    aiRosterShareStrings: ["SL1-ai1", "SL1-ai2", "SL1-ai3", "SL1-ai4"],
    map: buildSimpleMap("match-solo"),
    seed: "seed-08",
    budget: 25,
    aiTier: 1,
    selector: { kind: "any" },
    resolvedArchetypeId: "arena" as never,
  };
}

function bootStore(): ReturnType<typeof createMatchStore> {
  const store = createMatchStore();
  const catalog = testCatalog();
  const ok = store.getState().boot(makeLaunch(), catalog);
  if (!ok) throw new Error("boot failed");
  return store;
}

function deployedStore(): ReturnType<typeof createMatchStore> {
  const store = bootStore();
  const engine = store.getState().engine!;
  for (let sq = 0; sq < 5; sq += 1) {
    const anchor = engine.map.spawns[sq]?.anchor;
    if (anchor === undefined) throw new Error("spawn missing");
    if (sq === 0) store.getState().setDeploymentDraft(0, anchor);
    else store.getState().markAiReadyDeploy(squadId(sq), [{ rosterIndex: 0, position: anchor }]);
  }
  if (!store.getState().applyDeployment()) throw new Error("deployment failed");
  return store;
}

function readyAllMoves(store: ReturnType<typeof createMatchStore>): void {
  for (let sq = 1; sq < 5; sq += 1) {
    store.getState().markAiReadyMove(squadId(sq), { squadId: squadId(sq), moves: [] }, "seed");
  }
}

function readyAllAttacks(store: ReturnType<typeof createMatchStore>): void {
  for (let sq = 1; sq < 5; sq += 1) {
    store.getState().markAiReadyAttack(squadId(sq), { squadId: squadId(sq), attacks: [], postures: [] }, "seed");
  }
}

describe("match-store — boot", () => {
  it("creates a match, moves to DEPLOYMENT mode, empties drafts + ai", () => {
    const store = bootStore();
    const s = store.getState();
    expect(s.engine).not.toBeNull();
    expect(s.mode).toBe("DEPLOYMENT");
    expect(s.engineRevision).toBe(1);
    expect(s.drafts.moveDrafts.size).toBe(0);
    expect(s.drafts.deploymentDrafts.size).toBe(0);
    expect(s.ai.size).toBe(0);
    expect(s.lastError).toBeNull();
    expect(s.engine?.constructs.map((construct) => construct.chassisCode as number)).toEqual([10, 11, 12, 10, 11]);
    expect(s.launch?.input).toEqual(makeLaunch());
  });

  it("reports a create failure with a CREATE_FAILED error", () => {
    const store = createMatchStore();
    // Pass a null-y catalog so createMatch surfaces validation errors —
    // easiest to construct via a stub roster whose chassis is unknown.
    const badLaunch = makeLaunch();
    const ok = store.getState().boot(
      {
        ...badLaunch,
        human: {
          ...badLaunch.human,
          roster: { constructs: [{ chassisCode: 9999 as never, commanderCode: null, mounts: [] }] },
        },
      },
      testCatalog(),
    );
    expect(ok).toBe(false);
    expect(store.getState().lastError?.kind).toBe("CREATE_FAILED");
  });
});

describe("match-store — phase flow", () => {
  it("cycles DEPLOYMENT → MOVEMENT_PLAYBACK → MOVEMENT_PLOT via commit + playback finish", () => {
    const store = bootStore();
    const engine = store.getState().engine!;
    // Deploy each of the five squads to their spawn anchor. The human's
    // draft goes through the store; AI slots are filled directly.
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const anchor = engine.map.spawns[sq]?.anchor;
      if (anchor === undefined) throw new Error(`No spawn for ${sq}`);
      if (sq === 0) {
        store.getState().setDeploymentDraft(0, anchor);
      } else {
        store.getState().markAiReadyDeploy(squadId(sq), [
          { rosterIndex: 0, position: anchor },
        ]);
      }
    }
    const ok = store.getState().applyDeployment();
    expect(ok).toBe(true);
    // After deployment the engine transitions to MOVEMENT_PLOT and
    // playback carries the DEPLOYMENT_REVEAL + POOL_REFILL events.
    const afterDeploy = store.getState();
    expect(afterDeploy.engine?.phase).toBe("MOVEMENT_PLOT");
    expect(afterDeploy.mode).toBe("MOVEMENT_PLOT");
    expect(afterDeploy.playback.events.length).toBeGreaterThan(0);
    expect(afterDeploy.engineRevision).toBe(2);
    // Draft slate is cleared post-commit.
    expect(afterDeploy.drafts.deploymentDrafts.size).toBe(0);
    // AI slate cleared post-transition.
    expect(afterDeploy.ai.size).toBe(0);
  });

  it("HOLD every construct → resolveMovement → MOVEMENT_PLAYBACK", () => {
    const store = bootStore();
    // Deploy first.
    const engine = store.getState().engine!;
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const anchor = engine.map.spawns[sq]?.anchor;
      if (anchor === undefined) throw new Error(`No spawn for ${sq}`);
      if (sq === 0) store.getState().setDeploymentDraft(0, anchor);
      else store.getState().markAiReadyDeploy(squadId(sq), [{ rosterIndex: 0, position: anchor }]);
    }
    store.getState().applyDeployment();

    // All squads HOLD by leaving their AI ready with an empty plot.
    // Human already has no draft — that also means HOLD.
    const midEngine = store.getState().engine!;
    const humanCid = midEngine.constructs.find((c) => (c.squadId as number) === 0)?.id as ConstructId;
    store.getState().setHold(humanCid, true);
    for (let sq = 1; sq < 5; sq = sq + 1) {
      store.getState().markAiReadyMove(squadId(sq), { squadId: squadId(sq), moves: [] }, "seed");
    }
    const ok = store.getState().resolveMovement();
    expect(ok).toBe(true);
    const after = store.getState();
    expect(after.mode).toBe("MOVEMENT_PLAYBACK");
    expect(after.playback.stageKind).toBe("MOVEMENT");
    // playbackFinish should transition into ATTACK_PLOT (movement stage
    // does not advance the round; the engine still stays in MOVEMENT_PLOT
    // → ATTACK_PLOT via the phase machine).
    store.getState().playbackFinish();
    expect(store.getState().mode).toBe("ATTACK_PLOT");
  });
});

describe("match-store — drafts NEVER on engine state", () => {
  it("no field named moveDrafts / attackDrafts / holdSet on MatchState", () => {
    const store = bootStore();
    const engine = store.getState().engine!;
    const serialized = JSON.stringify(engine);
    expect(serialized).not.toContain("moveDrafts");
    expect(serialized).not.toContain("attackDrafts");
    expect(serialized).not.toContain("holdSet");
    expect(serialized).not.toContain("postureDrafts");
  });

  it("HumanDraftPlots type is not required to instantiate a MatchState", () => {
    const store = bootStore();
    // Setting a draft must not mutate engine or bump engineRevision.
    const priorRev = store.getState().engineRevision;
    const priorEngine = store.getState().engine;
    store.getState().setMoveDraft(constructId(0), [
      { x: 0 as Fx, y: 0 as Fx },
    ]);
    expect(store.getState().engineRevision).toBe(priorRev);
    expect(store.getState().engine).toBe(priorEngine);
  });

  it("MatchState round-trips through structuredClone (no functions, no Maps of objects)", () => {
    const store = bootStore();
    const engine = store.getState().engine!;
    const roundTripped = structuredClone(engine);
    expect(roundTripped.round).toBe(engine.round);
    expect(roundTripped.constructs.length).toBe(engine.constructs.length);
  });
});

describe("match-store — AI slot bookkeeping", () => {
  it("PENDING → READY → cleared on transition", () => {
    const store = bootStore();
    store.getState().markAiPending(squadId(1), 42);
    expect(getSlot(store, 1)?.kind).toBe("PENDING");
    store.getState().markAiReadyMove(squadId(1), { squadId: squadId(1), moves: [] }, "s");
    expect(getSlot(store, 1)?.kind).toBe("READY_MOVE");
    // A commit clears the AI slate.
    // Deploy first so we have a committed match to resolve movement on.
    const engine = store.getState().engine!;
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const anchor = engine.map.spawns[sq]?.anchor;
      if (anchor === undefined) throw new Error("spawn");
      if (sq === 0) store.getState().setDeploymentDraft(0, anchor);
      else store.getState().markAiReadyDeploy(squadId(sq), [{ rosterIndex: 0, position: anchor }]);
    }
    store.getState().applyDeployment();
    // Now the ai map is empty; queue moves and resolve.
    for (let sq = 1; sq < 5; sq = sq + 1) {
      store.getState().markAiReadyMove(squadId(sq), { squadId: squadId(sq), moves: [] }, "s");
    }
    store.getState().resolveMovement();
    expect(store.getState().ai.size).toBe(0);
  });
});

describe("match-store — phase-safe resolution", () => {
  it.each(["missing", "pending", "error", "wrong-phase"] as const)("rejects %s movement AI without changing committed or draft state", (condition) => {
    const store = deployedStore();
    const engine = store.getState().engine;
    const revision = store.getState().engineRevision;
    const human = engine!.constructs.find((construct) => (construct.squadId as number) === 0)!;
    store.getState().setHold(human.id, true);
    readyAllMoves(store);
    if (condition === "missing") store.getState().clearAiSlot(squadId(1));
    if (condition === "pending") store.getState().markAiPending(squadId(1), 91);
    if (condition === "error") store.getState().markAiError(squadId(1), 91, "AI_FAILURE", "visible failure");
    if (condition === "wrong-phase") store.getState().markAiReadyAttack(squadId(1), { squadId: squadId(1), attacks: [], postures: [] }, "seed");
    const drafts = store.getState().drafts;
    const ai = store.getState().ai;
    expect(store.getState().resolveMovement()).toBe(false);
    expect(store.getState().engine).toBe(engine);
    expect(store.getState().engineRevision).toBe(revision);
    expect(store.getState().drafts).toBe(drafts);
    expect(store.getState().ai).toBe(ai);
    expect(store.getState().mode).toBe("MOVEMENT_PLOT");
    if (condition === "error") expect(store.getState().lastError).toMatchObject({ kind: "AI_FAILED", message: expect.stringContaining("visible failure") });
  });

  it("requires exact attack readiness and preserves attack drafts on rejection", () => {
    const store = deployedStore();
    readyAllMoves(store);
    expect(store.getState().resolveMovement()).toBe(true);
    store.getState().playbackFinish();
    readyAllAttacks(store);
    store.getState().markAiReadyMove(squadId(2), { squadId: squadId(2), moves: [] }, "wrong");
    const engine = store.getState().engine;
    const drafts = store.getState().drafts;
    expect(store.getState().resolveAttack()).toBe(false);
    expect(store.getState().engine).toBe(engine);
    expect(store.getState().drafts).toBe(drafts);
    expect(store.getState().mode).toBe("ATTACK_PLOT");
  });

  it("defers movement authority and revision until zero-event playback finishes", () => {
    const store = deployedStore();
    const before = store.getState().engine;
    const revision = store.getState().engineRevision;
    readyAllMoves(store);
    expect(store.getState().resolveMovement()).toBe(true);
    const playback = store.getState().playback;
    expect(playback.beforeSnapshot).toBe(before);
    expect(playback.afterSnapshot).not.toBe(before);
    expect(store.getState().engine).toBe(before);
    expect(store.getState().engineRevision).toBe(revision);
    expect(playback.events).toHaveLength(0);
    expect(matchSelectors.selectPlaybackDone(store.getState())).toBe(true);
    store.getState().playbackFinish();
    expect(store.getState().engine).toBe(playback.afterSnapshot);
    expect(store.getState().engineRevision).toBe(revision + 1);
    expect(store.getState().mode).toBe("ATTACK_PLOT");
  });

  it("appends history once and updates opponent observations only after attack finish", () => {
    const store = deployedStore();
    const deploymentHistory = store.getState().eventHistory;
    expect(deploymentHistory.length).toBeGreaterThan(0);
    readyAllMoves(store);
    store.getState().resolveMovement();
    store.getState().playbackSkip();
    store.getState().playbackFinish();
    const afterMoveHistory = store.getState().eventHistory;
    expect(afterMoveHistory.slice(0, deploymentHistory.length)).toEqual(deploymentHistory);

    readyAllAttacks(store);
    const modelBefore = store.getState().opponentModel;
    expect(store.getState().resolveAttack()).toBe(true);
    const attackEvents = store.getState().playback.events;
    expect(store.getState().opponentModel).toBe(modelBefore);
    expect(store.getState().eventHistory).toBe(afterMoveHistory);
    store.getState().playbackSkip();
    store.getState().playbackFinish();
    expect(store.getState().eventHistory).toEqual([...afterMoveHistory, ...attackEvents]);
    expect(store.getState().opponentModel).not.toBe(modelBefore);
    const historyLength = store.getState().eventHistory.length;
    store.getState().playbackFinish();
    expect(store.getState().eventHistory).toHaveLength(historyLength);
  });
});

describe("match-store — selector isolation", () => {
  it("hoverWaypoint updates only the selection slice", () => {
    const store = bootStore();
    const beforeDrafts = store.getState().drafts;
    const beforeEngine = store.getState().engine;
    const beforeAi = store.getState().ai;
    store.getState().hoverWaypoint({
      x: 42 as Fx,
      y: 42 as Fx,
    });
    const after = store.getState();
    expect(after.drafts).toBe(beforeDrafts);
    expect(after.engine).toBe(beforeEngine);
    expect(after.ai).toBe(beforeAi);
    expect(after.selection.hoveredWaypoint).not.toBeNull();
  });

  it("hoverWaypoint no-ops when the same point is set twice", () => {
    const store = bootStore();
    store.getState().hoverWaypoint({
      x: 4 as Fx,
      y: 4 as Fx,
    });
    const priorSelection = store.getState().selection;
    store.getState().hoverWaypoint({
      x: 4 as Fx,
      y: 4 as Fx,
    });
    expect(store.getState().selection).toBe(priorSelection);
  });

  it("selectConstruct twice on the same id is a no-op", () => {
    const store = bootStore();
    store.getState().selectConstruct(constructId(0));
    const prior = store.getState().selection;
    store.getState().selectConstruct(constructId(0));
    expect(store.getState().selection).toBe(prior);
  });
});

describe("match-store — no timer / no wall clock", () => {
  it("has no field named timer, deadline, elapsed, msRemaining anywhere", () => {
    const store = bootStore();
    const s = store.getState();
    const banned = ["timer", "deadline", "elapsed", "msRemaining", "startTs", "timeout"];
    // Walk the top-level state.
    for (const k of Object.keys(s)) {
      for (const banned_k of banned) {
        expect(k.toLowerCase()).not.toContain(banned_k.toLowerCase());
      }
    }
    // Walk engine.
    if (s.engine !== null) {
      const serialized = JSON.stringify(s.engine);
      for (const banned_k of banned) {
        expect(serialized).not.toContain(banned_k);
      }
    }
    // Walk playback.
    const pkeys = Object.keys(s.playback);
    for (const k of pkeys) {
      for (const banned_k of banned) {
        expect(k.toLowerCase()).not.toContain(banned_k.toLowerCase());
      }
    }
  });
});

describe("match-store — plot-draft helpers", () => {
  it("buildHumanMovePlot returns HOLD paths sorted by construct id", () => {
    const store = bootStore();
    const engine = store.getState().engine!;
    const plot = buildHumanMovePlot(engine, squadId(0), store.getState().drafts, testCatalog());
    expect(plot.squadId as number).toBe(0);
    const ids = plot.moves.map((m) => m.constructId as number);
    const sorted = ids.slice().sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
    for (const m of plot.moves) expect(m.path.length).toBe(0);
  });

  it("countImplicitHolds decreases when a construct is HOLD explicitly", () => {
    const store = bootStore();
    const engine = store.getState().engine!;
    const own = engine.constructs.filter((c) => (c.squadId as number) === 0);
    const before = countImplicitHolds(engine, squadId(0), store.getState().drafts);
    expect(before).toBe(own.length);
    if (own.length > 0 && own[0] !== undefined) {
      store.getState().setHold(own[0].id, true);
    }
    const after = countImplicitHolds(engine, squadId(0), store.getState().drafts);
    expect(after).toBe(Math.max(0, before - 1));
  });

  it("projectedPoolSpend accounts for POSTURE + called separately", () => {
    const store = bootStore();
    const engine = store.getState().engine!;
    const own = engine.constructs.filter((c) => (c.squadId as number) === 0);
    if (own[0] === undefined) throw new Error("no owns");
    store.getState().setPostureDraft(own[0].id, "POSTURE");
    // FLAT posture must not count toward spend.
    const spend = projectedPoolSpend(engine, squadId(0), store.getState().drafts);
    expect(spend.postures).toBe(1);
    expect(spend.called).toBe(0);
    expect(spend.total).toBe(1);
  });
});

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function getSlot(
  store: ReturnType<typeof createMatchStore>,
  sq: number,
): AiStatus | undefined {
  return store.getState().ai.get(sq) as AiStatus | undefined;
}
