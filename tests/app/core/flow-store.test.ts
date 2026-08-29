import { describe, expect, it } from "vitest";
import {
  createFlowStore,
  type MatchLaunchConfig,
  type MatchResultSummary,
} from "../../../src/app/store/core/index";
import { buildSimpleMap } from "../../fixtures/maps/simple";

const launch: MatchLaunchConfig = {
  human: {
    source: { kind: "saved", id: "roster:1", name: "R1" },
    roster: { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] },
    shareString: "SL1-human",
  },
  aiRosters: [
    { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] },
    { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] },
    { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] },
    { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] },
  ],
  aiRosterShareStrings: ["SL1-ai1", "SL1-ai2", "SL1-ai3", "SL1-ai4"],
  map: buildSimpleMap("seed-abc"),
  budget: 50,
  seed: "seed-abc",
  aiTier: 2,
  selector: { kind: "any" },
  resolvedArchetypeId: "arena" as never,
};

const result: MatchResultSummary = {
  outcome: "victory",
  roundsElapsed: 1,
  humanPlacement: 1,
  humanEliminationRound: null,
  finalStateHash: "abcd1234",
  ladder: [], constructs: [],
  humanPool: { granted: 2, spent: 1, wasted: 1, calledShots: 1, postures: 0, rounds: [{ round: 1, granted: 2, spent: 1, wasted: 1, calledShots: 1, postures: 0 }] },
  reproducibility: { seed: "seed-abc", budget: 50, resolvedArchetypeId: "arena" as never, aiTier: 2, humanRosterShareString: "SL1-human", aiRosterShareStrings: ["SL1-ai1", "SL1-ai2", "SL1-ai3", "SL1-ai4"] },
};

describe("app/core/flow-store", () => {
  it("setPendingLaunch and setLastResult round-trip values", () => {
    const store = createFlowStore();
    expect(store.getState().pendingLaunch).toBeNull();
    store.getState().setPendingLaunch(launch);
    expect(store.getState().pendingLaunch).toEqual(launch);
    store.getState().setLastResult(result);
    expect(store.getState().lastResult).toEqual(result);
  });

  it("requestEntity carries a target id for cross-screen navigation", () => {
    const store = createFlowStore();
    store.getState().requestEntity("roster:1");
    expect(store.getState().requestedEntity).toBe("roster:1");
    store.getState().requestEntity(null);
    expect(store.getState().requestedEntity).toBeNull();
  });

  it("clear resets every field to the initial state", () => {
    const store = createFlowStore();
    store.getState().setPendingLaunch(launch);
    store.getState().setLastResult(result);
    store.getState().requestEntity("construct:5");
    store.getState().clear();
    const state = store.getState();
    expect(state.pendingLaunch).toBeNull();
    expect(state.lastResult).toBeNull();
    expect(state.requestedEntity).toBeNull();
  });
});
