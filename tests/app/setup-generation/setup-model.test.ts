import { describe, expect, it } from "vitest";
import {
  AI_ROSTER_STREAM_LABELS,
  createSetupGenerationService,
  createUserSeed,
  makeSetupDraft,
  prepareSetup,
  selectorForArchetype,
  validateSetupDraft,
  type CryptoLike,
  type SetupDraft,
  type SetupGenerationClients,
} from "../../../src/app/store/build/setup-model";
import {
  createAiClient,
  type AiCallResult,
  type AiClient,
  type AiClientRequest,
  type AiWorkerTarget,
} from "../../../src/app/bridge/ai-client";
import {
  createMapGenClient,
  type MapGenCallResult,
  type MapGenClient,
  type MapWorkerTarget,
} from "../../../src/app/bridge/mapgen-client";
import type {
  MapGenRequest,
  WorkerRequest,
  WorkerResponse,
} from "../../../src/workers/protocol";
import { WORKER_PROTOCOL_VERSION } from "../../../src/workers/protocol";
import type { Budget, Catalog, MapResult, Roster } from "../../../src/engine/index";

/* --------------------------------------------------------------------- */
/* Fakes — deterministic in-memory transports                            */
/* --------------------------------------------------------------------- */

const labelIndex = (streamLabel: string): number =>
  (AI_ROSTER_STREAM_LABELS as readonly string[]).indexOf(streamLabel);

/** A roster whose construct count encodes the squad index — lets ordering be asserted. */
function rosterFor(streamLabel: string): Roster {
  const count = labelIndex(streamLabel) + 1;
  const constructs = Array.from({ length: count }, () => ({
    chassisCode: 10,
    commanderCode: null,
    mounts: [],
  }));
  return { constructs } as unknown as Roster;
}

function okRoster(requestId: number, streamLabel: string): AiCallResult {
  return {
    kind: "ok",
    response: {
      id: requestId,
      version: WORKER_PROTOCOL_VERSION,
      kind: "AI_ROSTER_OK",
      result: { roster: rosterFor(streamLabel), rng: { state: streamLabel } },
    } as unknown as WorkerResponse,
  };
}

function fakeAiClient(overrides?: Record<string, AiCallResult>): {
  readonly client: AiClient;
  readonly requests: readonly AiClientRequest[];
  disposed(): boolean;
} {
  const requests: AiClientRequest[] = [];
  let counter = 0;
  let disposed = false;
  const client: AiClient = {
    postAiRequest(request) {
      requests.push(request);
      counter = counter + 1;
      const requestId = counter;
      const streamLabel = request.streamLabel;
      const result = Promise.resolve(overrides?.[streamLabel] ?? okRoster(requestId, streamLabel));
      return { requestId, result, cancel: () => undefined };
    },
    dispose() {
      disposed = true;
    },
    inFlightCount: () => 0,
  };
  return { client, requests, disposed: () => disposed };
}

function mapResultFor(seed: string): MapResult {
  return { map: { seed, acceptedAttempt: 1 }, rejectedReports: [] } as unknown as MapResult;
}

function fakeMapGenClient(override?: MapGenCallResult): {
  readonly client: MapGenClient;
  readonly requests: readonly Omit<MapGenRequest, "id" | "version">[];
  disposed(): boolean;
} {
  const requests: Omit<MapGenRequest, "id" | "version">[] = [];
  let counter = 0;
  let disposed = false;
  const client: MapGenClient = {
    request(input) {
      requests.push(input);
      counter = counter + 1;
      const requestId = counter;
      const result = Promise.resolve<MapGenCallResult>(
        override ?? {
          kind: "ok",
          response: {
            id: requestId,
            version: WORKER_PROTOCOL_VERSION,
            kind: "MAP_GEN_OK",
            result: mapResultFor(input.baseSeed),
          },
        },
      );
      return { requestId, result, cancel: () => undefined };
    },
    dispose() {
      disposed = true;
    },
    inFlightCount: () => 0,
  };
  return { client, requests, disposed: () => disposed };
}

const stubCatalog = {
  mapArchetypes: [],
  tunables: { MOVE_SUBSTEPS: 64 },
} as unknown as Catalog;

const sampleDraft: SetupDraft = makeSetupDraft({
  budget: 100 as Budget,
  aiTier: 2,
  selector: { kind: "any" },
  seed: "deadbeefcafef00d",
});

/* --------------------------------------------------------------------- */
/* Tests                                                                 */
/* --------------------------------------------------------------------- */

describe("setup-model / draft helpers", () => {
  it("freezes the draft", () => {
    expect(Object.isFrozen(sampleDraft)).toBe(true);
  });

  it("keeps 'any' as the engine selector and resolves a concrete id", () => {
    expect(selectorForArchetype("any")).toEqual({ kind: "any" });
    expect(selectorForArchetype("atrium" as never)).toEqual({ kind: "id", id: "atrium" });
  });

  it("flags a blank seed but accepts a ready draft", () => {
    expect(validateSetupDraft(sampleDraft)).toEqual([]);
    const blank = makeSetupDraft({ ...sampleDraft, seed: "  " });
    expect(validateSetupDraft(blank)).toContain("SEED_EMPTY");
  });
});

describe("setup-model / createUserSeed", () => {
  it("returns ENTROPY_UNAVAILABLE with no source", () => {
    const r = createUserSeed(undefined);
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.errorKind).toBe("ENTROPY_UNAVAILABLE");
  });

  it("produces a deterministic 32-char hex seed from the source, never Math.random", () => {
    const source: CryptoLike = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        const view = array as unknown as Uint32Array;
        for (let i = 0; i < view.length; i = i + 1) view[i] = 0x01020304 + i;
        return array;
      },
    };
    const a = createUserSeed(source);
    const b = createUserSeed(source);
    expect(a.kind).toBe("ok");
    if (a.kind === "ok" && b.kind === "ok") {
      // words [0x01020304, 0x01020305, 0x01020306, 0x01020307] → 8-hex each.
      expect(a.seed).toBe("01020304010203050102030601020307");
      expect(a.seed).toHaveLength(32);
      expect(a.seed).toBe(b.seed);
    }
  });

  it("returns ENTROPY_UNAVAILABLE when the source throws", () => {
    const source: CryptoLike = {
      getRandomValues<T extends ArrayBufferView | null>(_array: T): T {
        throw new Error("quota exceeded");
      },
    };
    const r = createUserSeed(source);
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toBe("quota exceeded");
  });
});

describe("setup-model / prepareSetup orchestration", () => {
  it("submits one MAP_GEN and four AI_ROSTER with the exact stream labels and shared inputs", async () => {
    const ai = fakeAiClient();
    const map = fakeMapGenClient();
    const clients: SetupGenerationClients = { ai: ai.client, map: map.client };

    const result = await prepareSetup(sampleDraft, stubCatalog, clients);
    expect(result.kind).toBe("ok");

    expect(map.requests).toHaveLength(1);
    expect(map.requests[0]?.baseSeed).toBe(sampleDraft.seed);
    expect(map.requests[0]?.selector).toEqual({ kind: "any" });

    expect(ai.requests.map((r) => r.streamLabel)).toEqual([
      "ai.squad1.roster",
      "ai.squad2.roster",
      "ai.squad3.roster",
      "ai.squad4.roster",
    ]);
    for (const req of ai.requests) {
      expect(req.kind).toBe("AI_ROSTER");
      if (req.kind === "AI_ROSTER") {
        expect(req.budget).toBe(sampleDraft.budget);
        expect(req.seed).toBe(sampleDraft.seed);
        expect(req.catalog).toBe(stubCatalog);
      }
    }
  });

  it("preserves the four rosters in squad order", async () => {
    const clients: SetupGenerationClients = {
      ai: fakeAiClient().client,
      map: fakeMapGenClient().client,
    };
    const result = await prepareSetup(sampleDraft, stubCatalog, clients);
    if (result.kind !== "ok") throw new Error("expected ok");
    const counts = result.prepared.aiRosters.map((r) => r.constructs.length);
    expect(counts).toEqual([1, 2, 3, 4]);
    expect(result.prepared.seed).toBe(sampleDraft.seed);
    expect(result.prepared.budget).toBe(sampleDraft.budget);
    expect(result.prepared.aiTier).toBe(2);
  });

  it("is deterministic — equal input yields byte-identical prepared data", async () => {
    const first = await prepareSetup(sampleDraft, stubCatalog, {
      ai: fakeAiClient().client,
      map: fakeMapGenClient().client,
    });
    const second = await prepareSetup(sampleDraft, stubCatalog, {
      ai: fakeAiClient().client,
      map: fakeMapGenClient().client,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("a map failure blocks success and names the MAP branch, with no retry", async () => {
    const ai = fakeAiClient();
    const map = fakeMapGenClient({
      kind: "error",
      requestId: 1,
      errorKind: "MAP_MAX_REGEN",
      message: "regeneration exhausted",
    });
    const result = await prepareSetup(sampleDraft, stubCatalog, { ai: ai.client, map: map.client });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.failure.stage).toBe("MAP");
      expect(result.failure.errorKind).toBe("MAP_MAX_REGEN");
      expect(result.failure.streamLabel).toBeNull();
    }
    expect(map.requests).toHaveLength(1); // no hidden retry
    expect(ai.requests).toHaveLength(4);
  });

  it("any AI failure blocks success and names the failed squad stream", async () => {
    const ai = fakeAiClient({
      "ai.squad3.roster": {
        kind: "error",
        requestId: 3,
        errorKind: "AI_FAILURE",
        message: "no legal roster",
      },
    });
    const map = fakeMapGenClient();
    const result = await prepareSetup(sampleDraft, stubCatalog, { ai: ai.client, map: map.client });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.failure.stage).toBe("AI_ROSTER");
      expect(result.failure.streamLabel).toBe("ai.squad3.roster");
      expect(result.failure.errorKind).toBe("AI_FAILURE");
    }
    expect(ai.requests).toHaveLength(4); // no hidden retry with a derived seed
  });
});

/* --------------------------------------------------------------------- */
/* Cancellation / race / disposal — real clients over fake worker targets */
/* --------------------------------------------------------------------- */

/**
 * A controllable fake Worker satisfying both the AI and map client target
 * contracts. It captures posted requests and delivers `message` events on
 * demand so a test can order a late response after a cancel.
 */
function makeFakeWorker(): {
  readonly target: MapWorkerTarget & AiWorkerTarget;
  readonly posted: readonly WorkerRequest[];
  deliver(response: WorkerResponse): void;
  terminatedCount(): number;
} {
  let onMessage: ((event: { data: WorkerResponse }) => void) | null = null;
  const posted: WorkerRequest[] = [];
  let terminated = 0;
  const target = {
    postMessage(msg: WorkerRequest): void {
      posted.push(msg);
    },
    addEventListener(kind: "message" | "error", handler: (event: never) => void): void {
      if (kind === "message") {
        onMessage = handler as unknown as (event: { data: WorkerResponse }) => void;
      }
    },
    removeEventListener(): void {
      /* not exercised */
    },
    terminate(): void {
      terminated = terminated + 1;
    },
  };
  return {
    target: target as unknown as MapWorkerTarget & AiWorkerTarget,
    posted,
    deliver(response: WorkerResponse): void {
      onMessage?.({ data: response });
    },
    terminatedCount: () => terminated,
  };
}

function mapOk(id: number): WorkerResponse {
  return {
    id,
    version: WORKER_PROTOCOL_VERSION,
    kind: "MAP_GEN_OK",
    result: mapResultFor("x"),
  } as unknown as WorkerResponse;
}

function aiOk(id: number): WorkerResponse {
  return {
    id,
    version: WORKER_PROTOCOL_VERSION,
    kind: "AI_ROSTER_OK",
    result: { roster: { constructs: [] }, rng: { state: id } },
  } as unknown as WorkerResponse;
}

describe("setup-model / createSetupGenerationService", () => {
  it("cancels an earlier generation; a late worker response cannot be mistaken for a newer one", async () => {
    const mapFake = makeFakeWorker();
    const aiFake = makeFakeWorker();
    const clients: SetupGenerationClients = {
      map: createMapGenClient({ factory: () => mapFake.target }),
      ai: createAiClient({ factory: () => aiFake.target }),
    };
    const service = createSetupGenerationService(clients);

    const gen1 = service.prepare(sampleDraft, stubCatalog);
    expect(gen1.generationId).toBe(1);
    gen1.cancel();

    const gen2 = service.prepare(makeSetupDraft({ ...sampleDraft, seed: "second" }), stubCatalog);
    expect(gen2.generationId).toBe(2);

    // gen1 used map request id 1 and AI request ids 1..4; deliver them late.
    mapFake.deliver(mapOk(1));
    for (const id of [1, 2, 3, 4]) aiFake.deliver(aiOk(id));
    const r1 = await gen1.result;
    expect(r1.kind).toBe("error");
    if (r1.kind === "error") expect(r1.failure.errorKind).toBe("CANCELLED");

    // gen2 used map request id 2 and AI request ids 5..8.
    mapFake.deliver(mapOk(2));
    for (const id of [5, 6, 7, 8]) aiFake.deliver(aiOk(id));
    const r2 = await gen2.result;
    expect(r2.kind).toBe("ok");
  });

  it("dispose releases both worker clients and rejects further prepare calls", async () => {
    const mapFake = makeFakeWorker();
    const aiFake = makeFakeWorker();
    const clients: SetupGenerationClients = {
      map: createMapGenClient({ factory: () => mapFake.target }),
      ai: createAiClient({ factory: () => aiFake.target }),
    };
    const service = createSetupGenerationService(clients);

    const gen = service.prepare(sampleDraft, stubCatalog); // spawns both workers
    service.dispose();

    const r = await gen.result; // outstanding calls drained as WORKER_DOWN
    expect(r.kind).toBe("error");
    expect(mapFake.terminatedCount()).toBe(1);
    expect(aiFake.terminatedCount()).toBe(1);

    service.dispose(); // idempotent
    expect(mapFake.terminatedCount()).toBe(1);
    expect(() => service.prepare(sampleDraft, stubCatalog)).toThrow();
  });
});
