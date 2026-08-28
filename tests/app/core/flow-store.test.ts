import { describe, expect, it } from "vitest";
import {
  createFlowStore,
  type MatchLaunchConfig,
  type MatchResultPayload,
} from "../../../src/app/store/core/index";

const launch: MatchLaunchConfig = {
  rosterId: "roster:1",
  roster: {
    id: "roster:1",
    name: "R1",
    budget: 50,
    constructs: [
      { chassisCode: 10, commanderCode: 1, mounts: [] },
    ],
  },
  budget: 50,
  seed: "seed-abc",
  archetypeCode: null,
  aiTierId: "steady",
};

const result: MatchResultPayload = {
  config: launch,
  outcome: "victory",
  rounds: 6,
  humanEliminationRound: null,
  finalStateHash: "abcd1234",
  share: { rosterCode: "SL1-...", seed: "seed-abc" },
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
