# M15 — Worker entries

> **Path:** `./src/workers/`
> **Imports from:** M08, M10, M11 (via the M12 facade)
> **Status:** shipped in SESSION-05.

## Public API

```ts
// protocol.ts — typed, structurally cloneable envelope
const WORKER_PROTOCOL_VERSION = 1;

interface WorkerEnvelope { id: number; version: 1 }

interface AiRequestBase extends WorkerEnvelope {
  state: PublicState;               // FR-24 compile-time barrier: NOT MatchState.
  squadId: number;
  catalog: Catalog;
  seed: string;
  streamLabel: string;
  weights: AiWeights;
  nodeBudget: number;               // NEVER a time budget.
  tier: AiTier;
  opponentModel: OpponentModel;
}
type AiRequest =
  | ({ kind: "AI_DEPLOY" } & AiRequestBase)
  | ({ kind: "AI_MOVE" }   & AiRequestBase)
  | ({ kind: "AI_ATTACK" } & AiRequestBase)
  | { kind: "AI_ROSTER"; catalog; budget; seed; streamLabel } & WorkerEnvelope;

interface MapGenRequest extends WorkerEnvelope {
  kind: "MAP_GEN"; baseSeed; selector: ArchetypeSelector; archetypes; tunables;
}
type MapRequest = MapGenRequest;
type WorkerRequest = AiRequest | MapRequest;

type WorkerResponse =
  | { kind: "AI_DEPLOY_OK"; decision: AiDecision<readonly Placement[]> }
  | { kind: "AI_MOVE_OK";   decision: AiDecision<SquadMovePlots> }
  | { kind: "AI_ATTACK_OK"; decision: AiDecision<SquadAttackPlot> }
  | { kind: "AI_ROSTER_OK"; result: AiRosterResult }
  | { kind: "MAP_GEN_OK";   result: MapResult }
  | { kind: "ERROR"; errorKind: WorkerErrorKind; message; aiFailure?; mapDefect? };

type WorkerErrorKind =
  | "UNSUPPORTED_VERSION" | "UNKNOWN_REQUEST_KIND"
  | "AI_FAILURE" | "MAP_GENERATION_FAILURE" | "MAP_MAX_REGEN" | "INTERNAL_DEFECT";

// ai.worker.ts, mapgen.worker.ts
handleAiRequest(req: WorkerRequest): WorkerResponse;
handleMapRequest(req: WorkerRequest): WorkerResponse;
// Wired to self.addEventListener("message") at module load in Worker context.
```

## Internal Structure

| Area | Path |
|---|---|
| Protocol | `./src/workers/protocol.ts` |
| AI worker | `./src/workers/ai.worker.ts` |
| Map worker | `./src/workers/mapgen.worker.ts` |

## Conventions and Invariants

- **Information contract (FR-24):** AI requests contain `PublicState` only. `MatchState` is not structurally assignable to `PublicState` — negative fixture asserted at compile time (see M10, M11).
- **Deterministic budget only:** requests carry seed / stream / `nodeBudget`. Never a time budget, never a wall-clock deadline.
- **Structural cloneability:** every `WorkerRequest` / `WorkerResponse` round-trips through `structuredClone` (verified by test) so it is safe to `postMessage` across the main-thread / Worker boundary. Catalog's `ReadonlyMap` indexes clone through the algorithm.
- **Typed failure surface:** `handleAiRequest` / `handleMapRequest` catch every thrown defect and return a typed `ERROR` response — the worker never fabricates a legal decision.
- **Worker isolation:** `./src/workers/**` imports only from `./src/engine/**`; no `./src/app` or `./src/platform` imports.
- **No time reads:** no `Date.now` / `performance.now` / `Math.random` anywhere in `./src/workers/**` (manually reviewed; engine imports are ESLint-guarded).
- **Sort-ban compliance:** every `Array.prototype.sort` call in the workers passes an explicit total-order comparator ending on a stable integer or seeded nonce.
- **Dispatch shape:** the workers dispatch `AI_ROSTER` / `AI_DEPLOY` / `AI_MOVE` / `AI_ATTACK` / `MAP_GEN` requests only. Session 07/08 UI clients construct the request in the browser and `postMessage` to the worker; the response `id` field is the multiplex key.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-05 shipped `./src/workers/**` with the typed structurally-cloneable `WorkerRequest`/`WorkerResponse` protocol, `handleAiRequest`/`handleMapRequest` message handlers, and the compile-time barrier forbidding `MatchState` on AI requests. |
