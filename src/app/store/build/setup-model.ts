/**
 * Setup-domain model (M17, session 02 checkpoints 2–3).
 *
 * A headless, injected preparation service for the Match Setup route. From a
 * single displayed seed it derives ONE accepted map and FOUR legal AI rosters,
 * then hands SESSION-04 a typed `PreparedSetup` artifact. It owns no React, no
 * route, and no flow-store write.
 *
 * Determinism (FR-29): every worker request carries the same visible seed,
 * budget, and validated catalog; the four AI streams use fixed labels
 * (`ai.squad1.roster` … `ai.squad4.roster`). No path retries with a derived or
 * hidden seed, reads a clock, or falls back to `Math.random`.
 */

import type {
  ArchetypeId,
  ArchetypeSelector,
  AiTier,
  Budget,
  Catalog,
  MapResult,
  Roster,
} from "../../../engine/index";
import type { WorkerErrorKind } from "../../../workers/protocol";
import type { MapGenCallResult, MapGenClient } from "../../bridge/mapgen-client";
import { asRosterOk, type AiCallResult, type AiClient } from "../../bridge/ai-client";
import { asBudget } from "./collection-model";

/* ------------------------------------------------------------------------- */
/* Draft                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Immutable setup draft. `selector` keeps `"any"` as the engine's selector
 * rather than resolving an archetype in UI code; `seed` is concrete and
 * visible before generation.
 */
export interface SetupDraft {
  readonly budget: Budget;
  readonly aiTier: AiTier;
  readonly selector: ArchetypeSelector;
  readonly seed: string;
}

/** Freeze a draft from fully-typed fields. */
export function makeSetupDraft(fields: {
  readonly budget: Budget;
  readonly aiTier: AiTier;
  readonly selector: ArchetypeSelector;
  readonly seed: string;
}): SetupDraft {
  return Object.freeze({
    budget: fields.budget,
    aiTier: fields.aiTier,
    selector: fields.selector,
    seed: fields.seed,
  });
}

/** Map a UI archetype choice to an engine selector, keeping `"any"` intact. */
export function selectorForArchetype(choice: ArchetypeId | "any"): ArchetypeSelector {
  return choice === "any" ? { kind: "any" } : { kind: "id", id: choice };
}

export type SetupDraftIssue = "SEED_EMPTY" | "BUDGET_INVALID" | "AI_TIER_INVALID";

/**
 * Report why a draft is not yet launchable. An empty issue list means the
 * draft is ready to prepare. Budget / tier checks are defensive against a UI
 * that constructs a draft from raw control values.
 */
export function validateSetupDraft(draft: SetupDraft): readonly SetupDraftIssue[] {
  const issues: SetupDraftIssue[] = [];
  if (draft.seed.trim() === "") issues.push("SEED_EMPTY");
  if (asBudget(draft.budget) === null) issues.push("BUDGET_INVALID");
  if (draft.aiTier !== 1 && draft.aiTier !== 2 && draft.aiTier !== 3) {
    issues.push("AI_TIER_INVALID");
  }
  return issues;
}

/* ------------------------------------------------------------------------- */
/* User-action seed boundary                                                 */
/* ------------------------------------------------------------------------- */

/** The narrow `Crypto` surface the seed helper needs. */
export interface CryptoLike {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

export type SeedResult =
  | { readonly kind: "ok"; readonly seed: string }
  | {
      readonly kind: "error";
      readonly errorKind: "ENTROPY_UNAVAILABLE";
      readonly message: string;
    };

/**
 * Create a visible seed from a `Crypto`-shaped entropy source. This is the ONE
 * sanctioned use of `getRandomValues` — a user action producing a seed BEFORE
 * generation. It never falls back to `Math.random` or a clock; a missing or
 * throwing source returns a typed `ENTROPY_UNAVAILABLE` error instead.
 */
export function createUserSeed(source: CryptoLike | null | undefined): SeedResult {
  if (source === null || source === undefined || typeof source.getRandomValues !== "function") {
    return {
      kind: "error",
      errorKind: "ENTROPY_UNAVAILABLE",
      message: "No cryptographic entropy source is available.",
    };
  }
  try {
    const words = source.getRandomValues(new Uint32Array(4));
    let seed = "";
    for (const word of words) {
      seed = seed + word.toString(16).padStart(8, "0");
    }
    return { kind: "ok", seed };
  } catch (err) {
    return {
      kind: "error",
      errorKind: "ENTROPY_UNAVAILABLE",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ------------------------------------------------------------------------- */
/* Prepared result + failure surface                                         */
/* ------------------------------------------------------------------------- */

/**
 * The four AI roster stream labels, in squad order. Exact strings are a
 * determinism contract with the worker (arch §Preparation boundary).
 */
export const AI_ROSTER_STREAM_LABELS = [
  "ai.squad1.roster",
  "ai.squad2.roster",
  "ai.squad3.roster",
  "ai.squad4.roster",
] as const;

/** The prepared, launchable setup artifact SESSION-04 consumes. */
export interface PreparedSetup {
  readonly seed: string;
  readonly budget: Budget;
  readonly aiTier: AiTier;
  readonly selector: ArchetypeSelector;
  readonly mapResult: MapResult;
  readonly aiRosters: readonly [Roster, Roster, Roster, Roster];
}

export type SetupFailureKind =
  | WorkerErrorKind
  | "WORKER_DOWN"
  | "MESSAGE_MALFORMED"
  | "CANCELLED"
  | "UNEXPECTED_RESPONSE";

/** A structured failure naming the branch that blocked preparation. */
export interface SetupPreparationFailure {
  readonly stage: "MAP" | "AI_ROSTER";
  /** The AI stream label for an `AI_ROSTER` failure; `null` for the map branch. */
  readonly streamLabel: string | null;
  readonly errorKind: SetupFailureKind;
  readonly message: string;
}

export type SetupPreparationResult =
  | { readonly kind: "ok"; readonly prepared: PreparedSetup }
  | { readonly kind: "error"; readonly failure: SetupPreparationFailure };

/** The two injected worker clients the preparation service drives. */
export interface SetupGenerationClients {
  readonly map: MapGenClient;
  readonly ai: AiClient;
}

/* ------------------------------------------------------------------------- */
/* Preparation orchestration                                                 */
/* ------------------------------------------------------------------------- */

interface StartedGeneration {
  readonly mapCall: ReturnType<MapGenClient["request"]>;
  readonly aiCalls: readonly {
    readonly streamLabel: string;
    readonly call: ReturnType<AiClient["postAiRequest"]>;
  }[];
}

/**
 * Submit exactly one `MAP_GEN` request and four `AI_ROSTER` requests, all
 * derived from the same draft seed / budget / catalog. Emits nothing itself —
 * the caller awaits and interprets the calls. No field carries a human draft;
 * no request uses an unseeded value.
 */
function startGeneration(
  clients: SetupGenerationClients,
  draft: SetupDraft,
  catalog: Catalog,
): StartedGeneration {
  const mapCall = clients.map.request({
    kind: "MAP_GEN",
    baseSeed: draft.seed,
    selector: draft.selector,
    archetypes: catalog.mapArchetypes,
    tunables: catalog.tunables,
  });
  const aiCalls = AI_ROSTER_STREAM_LABELS.map((streamLabel) => ({
    streamLabel: streamLabel as string,
    call: clients.ai.postAiRequest({
      kind: "AI_ROSTER",
      catalog,
      budget: draft.budget,
      seed: draft.seed,
      streamLabel,
    }),
  }));
  return { mapCall, aiCalls };
}

function mapFailure(result: MapGenCallResult): SetupPreparationFailure {
  if (result.kind === "cancelled") {
    return {
      stage: "MAP",
      streamLabel: null,
      errorKind: "CANCELLED",
      message: `Map generation cancelled (request ${result.requestId}).`,
    };
  }
  if (result.kind === "error") {
    return { stage: "MAP", streamLabel: null, errorKind: result.errorKind, message: result.message };
  }
  return {
    stage: "MAP",
    streamLabel: null,
    errorKind: "UNEXPECTED_RESPONSE",
    message: "Map generation resolved unexpectedly.",
  };
}

function aiRosterFailure(streamLabel: string, result: AiCallResult): SetupPreparationFailure {
  if (result.kind === "cancelled") {
    return {
      stage: "AI_ROSTER",
      streamLabel,
      errorKind: "CANCELLED",
      message: `AI roster ${streamLabel} cancelled (request ${result.requestId}).`,
    };
  }
  if (result.kind === "error") {
    return { stage: "AI_ROSTER", streamLabel, errorKind: result.errorKind, message: result.message };
  }
  return {
    stage: "AI_ROSTER",
    streamLabel,
    errorKind: "UNEXPECTED_RESPONSE",
    message: `Expected AI_ROSTER_OK for ${streamLabel}, got ${result.response.kind}.`,
  };
}

/**
 * Await a started generation and resolve only when the map is `MAP_GEN_OK` and
 * all four AI responses are `AI_ROSTER_OK`. The failure branch is checked in a
 * fixed order — map, then squad 1..4 — so an equal set of failures reports the
 * same branch every run.
 */
async function collectSetup(
  draft: SetupDraft,
  started: StartedGeneration,
): Promise<SetupPreparationResult> {
  const [mapResult, aiSettled] = await Promise.all([
    started.mapCall.result,
    Promise.all(
      started.aiCalls.map(async ({ streamLabel, call }) => ({
        streamLabel,
        result: await call.result,
      })),
    ),
  ]);

  if (mapResult.kind !== "ok") {
    return { kind: "error", failure: mapFailure(mapResult) };
  }

  const rosters: Roster[] = [];
  for (const { streamLabel, result } of aiSettled) {
    const ok = asRosterOk(result);
    if (ok === null) {
      return { kind: "error", failure: aiRosterFailure(streamLabel, result) };
    }
    rosters.push(ok.result.roster);
  }

  const [r0, r1, r2, r3] = rosters;
  if (r0 === undefined || r1 === undefined || r2 === undefined || r3 === undefined) {
    // Unreachable: `aiSettled` always has four entries.
    return {
      kind: "error",
      failure: {
        stage: "AI_ROSTER",
        streamLabel: null,
        errorKind: "UNEXPECTED_RESPONSE",
        message: "Expected four AI rosters.",
      },
    };
  }

  return {
    kind: "ok",
    prepared: {
      seed: draft.seed,
      budget: draft.budget,
      aiTier: draft.aiTier,
      selector: draft.selector,
      mapResult: mapResult.response.result,
      aiRosters: [r0, r1, r2, r3],
    },
  };
}

/**
 * Prepare one reproducible setup result. Equal `(draft, catalog)` inputs, given
 * the workers' determinism guarantee, yield byte-identical prepared data.
 */
export async function prepareSetup(
  draft: SetupDraft,
  catalog: Catalog,
  clients: SetupGenerationClients,
): Promise<SetupPreparationResult> {
  return collectSetup(draft, startGeneration(clients, draft, catalog));
}

/* ------------------------------------------------------------------------- */
/* Stateful, cancellable service                                             */
/* ------------------------------------------------------------------------- */

/** One in-flight preparation. `generationId` lets callers ignore a stale run. */
export interface SetupGeneration {
  readonly generationId: number;
  readonly result: Promise<SetupPreparationResult>;
  /** Invalidate this generation; its late worker responses resolve as `CANCELLED`. */
  cancel(): void;
}

/**
 * A long-lived service that owns the two worker clients. Each `prepare` gets a
 * monotonic `generationId`, so a screen can start a fresh generation and
 * disregard an earlier one — a late completion carries the older id and its
 * cancelled requests resolve as `CANCELLED`, never as a newer result.
 */
export interface SetupGenerationService {
  prepare(draft: SetupDraft, catalog: Catalog): SetupGeneration;
  /** Dispose BOTH worker clients; the service rejects further `prepare` calls. */
  dispose(): void;
  inFlightCount(): number;
}

export function createSetupGenerationService(
  clients: SetupGenerationClients,
): SetupGenerationService {
  let counter = 0;
  let disposed = false;

  function prepare(draft: SetupDraft, catalog: Catalog): SetupGeneration {
    if (disposed) {
      throw new Error("SetupGenerationService has been disposed.");
    }
    counter = counter + 1;
    const generationId = counter;
    const started = startGeneration(clients, draft, catalog);
    return {
      generationId,
      result: collectSetup(draft, started),
      cancel(): void {
        started.mapCall.cancel();
        for (const { call } of started.aiCalls) call.cancel();
      },
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clients.map.dispose();
    clients.ai.dispose();
  }

  function inFlightCount(): number {
    return clients.map.inFlightCount() + clients.ai.inFlightCount();
  }

  return { prepare, dispose, inFlightCount };
}
