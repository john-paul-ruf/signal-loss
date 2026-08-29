/**
 * AI deployment coordinator tests (M17, SESSION-01).
 *
 * Drives `startAiDeployment` with an injected fake `AiClient` — never a real
 * browser worker — and asserts:
 *   - four requests, each carrying ONLY a PublicState (no human draft, no
 *     MatchState), a distinct observer + stream label, and the shared
 *     seed/config;
 *   - a legal deploy response marks the slot ready;
 *   - a typed worker error, an unexpected response kind, and an illegal
 *     returned placement each surface a typed onError, never a fake success;
 *   - cancellation silences every late result.
 */

import { describe, expect, it, vi } from "vitest";
import { createMatchStore } from "../../../src/app/store/match";
import { startAiDeployment } from "../../../src/app/store/match/ai-deployment";
import { resolveMatchAiConfig } from "../../../src/app/store/match/ai-config";
import type { LaunchSnapshot } from "../../../src/app/store/match";
import type {
  AiCallResult,
  AiClient,
  AiClientRequest,
} from "../../../src/app/bridge/ai-client";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core/flow-store";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import type { Catalog, MatchState, Placement, SquadId, Vec2 } from "../../../src/engine";

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
    seed: "seed-deploy",
    budget: 25,
    aiTier: 1,
    selector: { kind: "any" },
    resolvedArchetypeId: "arena" as never,
  };
}

interface RecordedCall {
  readonly request: AiClientRequest;
  readonly requestId: number;
  resolve: (result: AiCallResult) => void;
  cancelled: boolean;
}

function fakeClient(): { client: AiClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let nextId = 0;
  const client: AiClient = {
    postAiRequest(request) {
      const requestId = (nextId = nextId + 1);
      let resolve!: (result: AiCallResult) => void;
      const result = new Promise<AiCallResult>((res) => {
        resolve = res;
      });
      const record: RecordedCall = { request, requestId, resolve, cancelled: false };
      calls.push(record);
      return {
        requestId,
        result,
        cancel(): void {
          record.cancelled = true;
        },
      };
    },
    dispose(): void {
      /* no-op for the fake */
    },
    inFlightCount(): number {
      return calls.filter((c) => !c.cancelled).length;
    },
  };
  return { client, calls };
}

function booted(): { engine: MatchState; catalog: Catalog; launch: LaunchSnapshot } {
  const store = createMatchStore();
  const ok = store.getState().boot(makeLaunch(), testCatalog());
  if (!ok) throw new Error("boot failed");
  const s = store.getState();
  if (s.engine === null || s.catalog === null || s.launch === null) {
    throw new Error("store not booted");
  }
  return { engine: s.engine, catalog: s.catalog, launch: s.launch };
}

function anchorFor(engine: MatchState, squad: SquadId): Vec2 {
  const anchor = engine.map.spawns[squad as number]?.anchor;
  if (anchor === undefined) throw new Error(`no spawn anchor for squad ${squad as number}`);
  return anchor;
}

function deployOk(requestId: number, placements: readonly Placement[]): AiCallResult {
  return {
    kind: "ok",
    response: {
      id: requestId,
      version: 1,
      kind: "AI_DEPLOY_OK",
      decision: {
        choice: placements,
        diagnostics: {
          tier: 1,
          nodesVisited: 1,
          nodeBudget: 64,
          candidateCount: 1,
          selectedIds: [],
          scoreTerms: {},
        },
        rng: {},
      },
    },
  } as unknown as AiCallResult;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("startAiDeployment — request construction", () => {
  it("posts four public-only requests with distinct observers and stream labels", () => {
    const { engine, catalog, launch } = booted();
    const config = resolveMatchAiConfig();
    const { client, calls } = fakeClient();
    const onPending = vi.fn();
    startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config,
      onPending,
      onReady: vi.fn(),
      onError: vi.fn(),
    });

    expect(calls).toHaveLength(4);
    expect(onPending).toHaveBeenCalledTimes(4);

    const squads = calls.map((c) =>
      c.request.kind === "AI_DEPLOY" ? c.request.squadId : -1,
    );
    expect(squads).toEqual([1, 2, 3, 4]);

    const labels = calls.map((c) =>
      c.request.kind === "AI_DEPLOY" ? c.request.streamLabel : "",
    );
    expect(labels).toEqual([
      "ai.squad1.deploy",
      "ai.squad2.deploy",
      "ai.squad3.deploy",
      "ai.squad4.deploy",
    ]);

    for (const call of calls) {
      expect(call.request.kind).toBe("AI_DEPLOY");
      if (call.request.kind !== "AI_DEPLOY") continue;
      // Shared, deterministic inputs.
      expect(call.request.seed).toBe(launch.seed);
      expect(call.request.weights).toBe(config.weights);
      expect(call.request.nodeBudget).toBe(config.deploymentNodeBudget);
      expect(call.request.tier).toBe(launch.input.aiTier);
      // Public-only: the request carries a PublicState, no drafts, no MatchState.
      expect("drafts" in call.request).toBe(false);
      const serialized = JSON.stringify(call.request.state);
      expect(serialized).not.toContain("deploymentDrafts");
      expect(serialized).not.toContain("moveDrafts");
      expect(serialized).not.toContain("attackDrafts");
      // PublicState shape (map + constructs projection).
      expect(call.request.state.map).toBeDefined();
      expect(Array.isArray(call.request.state.constructs)).toBe(true);
    }
  });
});

describe("startAiDeployment — result transitions", () => {
  it("marks a slot ready when the returned placement is legal", async () => {
    const { engine, catalog, launch } = booted();
    const onReady = vi.fn();
    const onError = vi.fn();
    const { client, calls } = fakeClient();
    startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config: resolveMatchAiConfig(),
      onPending: vi.fn(),
      onReady,
      onError,
    });

    const squad = launch.aiSquadIds[0];
    const placements: readonly Placement[] = [
      { rosterIndex: 0, position: anchorFor(engine, squad) },
    ];
    const first = calls[0]!;
    first.resolve(deployOk(first.requestId, placements));
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(squad, placements);
  });

  it("surfaces a typed worker error to onError", async () => {
    const { engine, catalog, launch } = booted();
    const onReady = vi.fn();
    const onError = vi.fn();
    const { client, calls } = fakeClient();
    startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config: resolveMatchAiConfig(),
      onPending: vi.fn(),
      onReady,
      onError,
    });

    const first = calls[0]!;
    first.resolve({
      kind: "error",
      requestId: first.requestId,
      errorKind: "AI_FAILURE",
      message: "no legal deployment",
    });
    await flush();

    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      launch.aiSquadIds[0],
      first.requestId,
      "AI_FAILURE",
      "no legal deployment",
    );
  });

  it("rejects an unexpected response kind", async () => {
    const { engine, catalog, launch } = booted();
    const onReady = vi.fn();
    const onError = vi.fn();
    const { client, calls } = fakeClient();
    startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config: resolveMatchAiConfig(),
      onPending: vi.fn(),
      onReady,
      onError,
    });

    const first = calls[0]!;
    first.resolve({
      kind: "ok",
      response: { id: first.requestId, version: 1, kind: "AI_MOVE_OK" },
    } as unknown as AiCallResult);
    await flush();

    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![2]).toBe("AI_UNEXPECTED_RESPONSE");
  });

  it("rejects an illegal returned placement through legalDeployment", async () => {
    const { engine, catalog, launch } = booted();
    const onReady = vi.fn();
    const onError = vi.fn();
    const { client, calls } = fakeClient();
    startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config: resolveMatchAiConfig(),
      onPending: vi.fn(),
      onReady,
      onError,
    });

    // A position far outside the squad spawn region is illegal (FR-12).
    const illegal: readonly Placement[] = [
      { rosterIndex: 0, position: { x: 999_999 as never, y: 999_999 as never } },
    ];
    const first = calls[0]!;
    first.resolve(deployOk(first.requestId, illegal));
    await flush();

    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![2]).toBe("AI_ILLEGAL_DEPLOYMENT");
  });
});

describe("startAiDeployment — cancellation", () => {
  it("cancels outstanding calls and silences late results", async () => {
    const { engine, catalog, launch } = booted();
    const onReady = vi.fn();
    const onError = vi.fn();
    const { client, calls } = fakeClient();
    const run = startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config: resolveMatchAiConfig(),
      onPending: vi.fn(),
      onReady,
      onError,
    });

    run.cancel();
    expect(calls.every((c) => c.cancelled)).toBe(true);

    // A late resolution after cancel must call no callback.
    const squad = launch.aiSquadIds[0];
    const first = calls[0]!;
    first.resolve(deployOk(first.requestId, [{ rosterIndex: 0, position: anchorFor(engine, squad) }]));
    await flush();

    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
