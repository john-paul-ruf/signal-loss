import { describe, expect, it, vi } from "vitest";
import type { AiCallResult, AiClient, AiClientRequest } from "../../../src/app/bridge/ai-client";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core/flow-store";
import { createMatchStore } from "../../../src/app/store/match";
import { resolveMatchAiConfig } from "../../../src/app/store/match/ai-config";
import { startAiPhase, type AiPlotPhase } from "../../../src/app/store/match/ai-phase";
import type { LaunchSnapshot } from "../../../src/app/store/match/types";
import { emptyOpponentModel, squadId, type Catalog, type MatchState, type SquadAttackPlot, type SquadMovePlots } from "../../../src/engine";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";

function makeLaunch(aiTier: 1 | 2 | 3 = 1): CompleteMatchLaunchConfig {
  const human = soloRoster();
  return {
    human: { source: { kind: "saved", id: "roster:1", name: "human" }, roster: human, shareString: "human" },
    aiRosters: [human, human, human, human],
    aiRosterShareStrings: ["1", "2", "3", "4"],
    map: buildSimpleMap("ai-phase"),
    seed: "phase-seed",
    budget: 25,
    aiTier,
    selector: { kind: "any" },
    resolvedArchetypeId: "arena" as never,
  };
}

function phaseState(phase: AiPlotPhase, aiTier: 1 | 2 | 3 = 1): { engine: MatchState; catalog: Catalog; launch: LaunchSnapshot } {
  const store = createMatchStore();
  const catalog = testCatalog();
  if (!store.getState().boot(makeLaunch(aiTier), catalog)) throw new Error("boot failed");
  const initial = store.getState().engine!;
  for (let sq = 0; sq < 5; sq += 1) {
    const anchor = initial.map.spawns[sq]?.anchor;
    if (anchor === undefined) throw new Error("spawn missing");
    if (sq === 0) store.getState().setDeploymentDraft(0, anchor);
    else store.getState().markAiReadyDeploy(squadId(sq), [{ rosterIndex: 0, position: anchor }]);
  }
  if (!store.getState().applyDeployment()) throw new Error("deployment failed");
  if (phase === "ATTACK") {
    for (let sq = 1; sq < 5; sq += 1) {
      store.getState().markAiReadyMove(squadId(sq), { squadId: squadId(sq), moves: [] }, "test");
    }
    if (!store.getState().resolveMovement()) throw new Error("movement failed");
    store.getState().playbackFinish();
  }
  const state = store.getState();
  return { engine: state.engine!, catalog, launch: state.launch! };
}

interface RecordedCall {
  readonly request: AiClientRequest;
  readonly requestId: number;
  resolve(result: AiCallResult): void;
  reject(error: unknown): void;
  cancelled: boolean;
}

function fakeClient(): { client: AiClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client: AiClient = {
    postAiRequest(request) {
      const requestId = calls.length + 1;
      let resolve!: (result: AiCallResult) => void;
      let reject!: (error: unknown) => void;
      const result = new Promise<AiCallResult>((res, rej) => { resolve = res; reject = rej; });
      const call: RecordedCall = { request, requestId, resolve, reject, cancelled: false };
      calls.push(call);
      return { requestId, result, cancel: () => { call.cancelled = true; } };
    },
    dispose() {},
    inFlightCount: () => calls.filter((call) => !call.cancelled).length,
  };
  return { client, calls };
}

function start(phase: AiPlotPhase, options: { tier?: 1 | 2 | 3 } = {}) {
  const input = phaseState(phase, options.tier);
  const fake = fakeClient();
  const callbacks = {
    onPending: vi.fn(),
    onReadyMove: vi.fn(),
    onReadyAttack: vi.fn(),
    onError: vi.fn(),
  };
  const run = startAiPhase({ ...input, phase, client: fake.client, config: resolveMatchAiConfig(), opponentModel: emptyOpponentModel(), ...callbacks });
  return { ...input, ...fake, callbacks, run };
}

function moveOk(id: number, plot: SquadMovePlots): AiCallResult {
  return { kind: "ok", response: { id, version: 1, kind: "AI_MOVE_OK", decision: { choice: plot, diagnostics: {}, rng: {} } } } as unknown as AiCallResult;
}

function attackOk(id: number, plot: SquadAttackPlot): AiCallResult {
  return { kind: "ok", response: { id, version: 1, kind: "AI_ATTACK_OK", decision: { choice: plot, diagnostics: {}, rng: {} } } } as unknown as AiCallResult;
}

const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe("startAiPhase requests", () => {
  it.each([["MOVE", "AI_MOVE", "move"], ["ATTACK", "AI_ATTACK", "attack"]] as const)("posts four deterministic public %s requests", (phase, kind, suffix) => {
    const { calls, engine, launch } = start(phase, { tier: 2 });
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.request.kind)).toEqual([kind, kind, kind, kind]);
    for (let index = 0; index < calls.length; index += 1) {
      const request = calls[index]!.request;
      if (request.kind === "AI_ROSTER") throw new Error("wrong request");
      expect(request.squadId).toBe(index + 1);
      expect(request.streamLabel).toBe(`ai.squad${index + 1}.r${engine.round}.${suffix}`);
      expect(request.tier).toBe(2);
      expect(request.nodeBudget).toBe(50_000);
      expect(request.state.observer as number).toBe(index + 1);
      expect("drafts" in request).toBe(false);
      expect("phase" in request.state).toBe(true);
      expect("knownPositions" in request.state).toBe(false);
      expect(request.seed).toBe(launch.seed);
    }
    const normalized = calls.map((call) => JSON.stringify(call.request));
    const again = start(phase, { tier: 2 }).calls.map((call) => JSON.stringify(call.request));
    expect(normalized).toEqual(again);
  });

  it("uses the exact authored budget for every tier", () => {
    expect(start("MOVE", { tier: 1 }).calls[0]!.request).toMatchObject({ nodeBudget: 1_000 });
    expect(start("MOVE", { tier: 2 }).calls[0]!.request).toMatchObject({ nodeBudget: 50_000 });
    expect(start("MOVE", { tier: 3 }).calls[0]!.request).toMatchObject({ nodeBudget: 500_000 });
  });
});

describe("startAiPhase results", () => {
  it("routes only a legal matching move response", async () => {
    const { calls, launch, callbacks } = start("MOVE");
    const call = calls[0]!;
    const plot = { squadId: launch.aiSquadIds[0], moves: [] };
    call.resolve(moveOk(call.requestId, plot));
    await flush();
    expect(callbacks.onReadyMove).toHaveBeenCalledWith(launch.aiSquadIds[0], plot, expect.stringMatching(/\.move$/));
    expect(callbacks.onReadyAttack).not.toHaveBeenCalled();
  });

  it("routes only a legal matching attack response", async () => {
    const { calls, launch, callbacks } = start("ATTACK");
    const call = calls[0]!;
    const plot = { squadId: launch.aiSquadIds[0], attacks: [], postures: [] };
    call.resolve(attackOk(call.requestId, plot));
    await flush();
    expect(callbacks.onReadyAttack).toHaveBeenCalledWith(launch.aiSquadIds[0], plot, expect.stringMatching(/\.attack$/));
    expect(callbacks.onReadyMove).not.toHaveBeenCalled();
  });

  it("rejects wrong response kinds and wrong squad ids", async () => {
    const wrongKind = start("MOVE");
    wrongKind.calls[0]!.resolve(attackOk(wrongKind.calls[0]!.requestId, { squadId: squadId(1), attacks: [], postures: [] }));
    await flush();
    expect(wrongKind.callbacks.onError).toHaveBeenCalledWith(squadId(1), 1, "AI_UNEXPECTED_RESPONSE", expect.any(String));

    const wrongSquad = start("MOVE");
    wrongSquad.calls[0]!.resolve(moveOk(1, { squadId: squadId(4), moves: [] }));
    await flush();
    expect(wrongSquad.callbacks.onError).toHaveBeenCalledWith(squadId(1), 1, "AI_ILLEGAL_MOVE", expect.any(String));
  });

  it("rejects illegal plots, worker errors, and promise rejections", async () => {
    const illegal = start("ATTACK");
    illegal.calls[0]!.resolve(attackOk(1, { squadId: squadId(1), attacks: [{ constructId: 999 as never, targetId: 0 as never, called: false }], postures: [] }));
    await flush();
    expect(illegal.callbacks.onError).toHaveBeenCalledWith(squadId(1), 1, "AI_ILLEGAL_ATTACK", expect.any(String));

    const worker = start("MOVE");
    worker.calls[0]!.resolve({ kind: "error", requestId: 1, errorKind: "AI_FAILURE", message: "failed" });
    await flush();
    expect(worker.callbacks.onError).toHaveBeenCalledWith(squadId(1), 1, "AI_FAILURE", "failed");

    const rejected = start("MOVE");
    rejected.calls[0]!.reject(new Error("boom"));
    await flush();
    expect(rejected.callbacks.onError).toHaveBeenCalledWith(squadId(1), 1, "INTERNAL_DEFECT", "boom");
  });

  it("cancels all calls and suppresses late callbacks", async () => {
    const phase = start("MOVE");
    phase.run.cancel();
    expect(phase.calls.every((call) => call.cancelled)).toBe(true);
    phase.calls[0]!.resolve(moveOk(1, { squadId: squadId(1), moves: [] }));
    phase.calls[1]!.reject(new Error("late"));
    await flush();
    expect(phase.callbacks.onReadyMove).not.toHaveBeenCalled();
    expect(phase.callbacks.onError).not.toHaveBeenCalled();
  });
});
