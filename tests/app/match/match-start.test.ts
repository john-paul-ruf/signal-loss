/**
 * Match-start defensive gate tests (M17, SESSION-01).
 *
 * The store's `applyDeployment()` is the safety boundary — even if a caller
 * bypasses the command-bar button, it must never hand the engine a partial
 * five-squad deployment. These tests use a real booted store:
 *   - human draft complete but AI slots not ready → false, engine untouched,
 *     still DEPLOYMENT, truthful FR-12:AI_DEPLOYMENT_NOT_READY error;
 *   - an errored AI slot → false with a preserved AI_FAILED detail;
 *   - every AI slot READY_DEPLOY → the normal transition to MOVEMENT_PLOT.
 */

import { describe, expect, it } from "vitest";
import { createMatchStore } from "../../../src/app/store/match";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core/flow-store";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import { squadId } from "../../../src/engine";
import type { MatchState, SquadId, Vec2 } from "../../../src/engine";

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
    map: buildSimpleMap("match-start"),
    seed: "seed-start",
    budget: 25,
    aiTier: 1,
    selector: { kind: "any" },
    resolvedArchetypeId: "arena" as never,
  };
}

function bootStore(): ReturnType<typeof createMatchStore> {
  const store = createMatchStore();
  const ok = store.getState().boot(makeLaunch(), testCatalog());
  if (!ok) throw new Error("boot failed");
  return store;
}

function anchorFor(engine: MatchState, squad: number): Vec2 {
  const anchor = engine.map.spawns[squad]?.anchor;
  if (anchor === undefined) throw new Error(`no spawn anchor for squad ${squad}`);
  return anchor;
}

function placeHuman(store: ReturnType<typeof createMatchStore>): void {
  const engine = store.getState().engine!;
  store.getState().setDeploymentDraft(0, anchorFor(engine, 0));
}

function readyAllAi(store: ReturnType<typeof createMatchStore>): void {
  const engine = store.getState().engine!;
  for (let sq = 1; sq <= 4; sq = sq + 1) {
    store.getState().markAiReadyDeploy(squadId(sq) as SquadId, [
      { rosterIndex: 0, position: anchorFor(engine, sq) },
    ]);
  }
}

describe("applyDeployment — defensive AI-readiness gate", () => {
  it("refuses to commit before AI slots are ready and leaves the engine untouched", () => {
    const store = bootStore();
    placeHuman(store);
    const priorEngine = store.getState().engine;
    const priorRev = store.getState().engineRevision;

    const ok = store.getState().applyDeployment();

    expect(ok).toBe(false);
    const s = store.getState();
    expect(s.engine).toBe(priorEngine);
    expect(s.engineRevision).toBe(priorRev);
    expect(s.mode).toBe("DEPLOYMENT");
    expect(s.drafts.deploymentDrafts.size).toBe(1);
    expect(s.lastError?.kind).toBe("ENGINE_REJECTED");
    if (s.lastError?.kind === "ENGINE_REJECTED") {
      expect(s.lastError.stage).toBe("DEPLOY");
      expect(s.lastError.message).toContain("FR-12:AI_DEPLOYMENT_NOT_READY");
    }
  });

  it("preserves an AI failure detail when a slot errored", () => {
    const store = bootStore();
    placeHuman(store);
    const engine = store.getState().engine!;
    // Squads 2..4 ready; squad 1 errored.
    for (let sq = 2; sq <= 4; sq = sq + 1) {
      store.getState().markAiReadyDeploy(squadId(sq) as SquadId, [
        { rosterIndex: 0, position: anchorFor(engine, sq) },
      ]);
    }
    store.getState().markAiError(squadId(1) as SquadId, 7, "AI_FAILURE", "no legal deployment");
    const priorEngine = store.getState().engine;

    const ok = store.getState().applyDeployment();

    expect(ok).toBe(false);
    const s = store.getState();
    expect(s.engine).toBe(priorEngine);
    expect(s.mode).toBe("DEPLOYMENT");
    expect(s.lastError?.kind).toBe("AI_FAILED");
    if (s.lastError?.kind === "AI_FAILED") {
      expect(s.lastError.squadId as number).toBe(1);
      expect(s.lastError.message).toContain("no legal deployment");
    }
  });

  it("transitions to MOVEMENT_PLOT once every AI slot is READY_DEPLOY", () => {
    const store = bootStore();
    placeHuman(store);
    readyAllAi(store);
    const priorRev = store.getState().engineRevision;

    const ok = store.getState().applyDeployment();

    expect(ok).toBe(true);
    const s = store.getState();
    expect(s.mode).toBe("MOVEMENT_PLOT");
    expect(s.engine?.phase).toBe("MOVEMENT_PLOT");
    expect(s.engineRevision).toBe(priorRev + 1);
    expect(s.ai.size).toBe(0);
    expect(s.lastError).toBeNull();
  });
});
