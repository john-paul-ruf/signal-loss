# M17 — App state and bridge

> **Path:** `./src/app/store/`, `./src/app/bridge/`
> **Imports from:** M12, M14, M15
> **Status:** core stores shipped and verified in SESSION-02; the app-lifetime `FlowStoreProvider` seam over `createFlowStore()` shipped and verified in `match-setup-route` SESSION-01. Build stores shipped and verified through SESSION-07 checkpoints 1–2 of 5; AI-client bridge + match store shipped and verified in SESSION-08. A SESSION-07 retry landed an unverified composer draft store (`composer.ts`, `composer-context.ts`) — see Conventions below. The typed map-generation client and deterministic setup-preparation service shipped and verified in `match-setup-route` SESSION-02. `match-setup-route` SESSION-03 then shipped the complete transient launch contract and real five-roster match boot, and SESSION-04 shipped the routed setup handoff; both were verified.
>
> Session numbers restart per feature: bare `SESSION-0N` below refers to the original `full-v1` build; this cycle's sessions are written `match-setup-route` SESSION-0N.

## Public API

### Core stores — `./src/app/store/core/` (SESSION-02, complete)

- `createCollectionStore(repository)` — a Zustand vanilla store carrying loaded `PersistedStateV1`, `lastError`, boot flag, `persistenceUnavailable`, `corrupt` + `corruptRaw`. Actions: `boot`, `refresh`, `saveConstructCreate`, `saveConstructUpdate`, `saveRosterCreate`, `saveRosterUpdate`, `renameEntity`, `duplicateEntity`, `deleteEntity`, `savePreferences`, `resetCorruptStore`, `markExternallyChanged`. Every action returns a boolean success value; a failed write leaves state prior-version intact.
- `createNavigationStore({initialPath?, requestNavigation?})` — `currentPath` + `navigationCount`; `navigate(path)` publishes via the callback and `hashChanged(path)` accepts inbound hash events.
- `createPreferencesStore()` — mirror of `PersistedStateV1.preferences` plus a `resolvedReducedMotion` derived value that resolves persisted preference over the OS media query.
- `createFlowStore()` — non-persisted `pendingLaunch: MatchLaunchConfig`, `lastResult: MatchResultPayload`, `requestedEntity`. `MatchLaunchConfig` and `MatchResultPayload` are handoff CONTRACTS between the setup/result flow and the match flow; they are transient by design and MUST NOT be persisted via `CollectionRepository`. `match-setup-route` SESSION-03 extended the contract atomically with every consumer: `CompleteMatchLaunchConfig` carries the saved/prebuilt human source, engine-ready human roster and share string, four generated AI rosters and share strings, accepted map, concrete seed, budget, AI tier, selector, and resolved archetype id. A legacy shape remains only to make pre-launch callers fail with a structured create error; new setup code must write the complete shape.
- **App-lifetime flow provider seam** — `./src/app/store/core/flow-context.tsx` (`match-setup-route` SESSION-01) gives the existing transient `createFlowStore()` a single React owner, exported through the `./src/app/store/core/index.ts` facade (callers never deep-import the context path):
  - `FlowStoreProvider(props: { children; store?: StoreApi<FlowStore> })` — mounts exactly one store per provider (lazy `useRef`) or adopts an injected `store` for tests. `./src/app/main.tsx` wraps `<App />` in it, below the root `ErrorBoundary` and inside `React.StrictMode`, so every hash route shares one transient instance across a hash transition. StrictMode's double render does not leak a second store — the ref guard retains one.
  - `useFlowStore(selector, equal?)` — `useSyncExternalStore` selector hook mirroring `useMatchStore`; re-renders only when the selected slice changes by reference (or `equal`).
  - `useFlowStoreApi()` — imperative store handle. Both hooks throw a named boundary error ("… outside FlowStoreProvider …") when called outside the provider rather than spinning up a second store.
  - The provider touches no browser storage / `CollectionRepository` / migrations (structurally asserted in `./tests/app/core/flow-context.test.tsx`) and left the `FlowStore` shape and both handoff contracts unchanged.

### Build stores — `./src/app/store/build/` (SESSION-07 checkpoints 1–2 of 5)

- `catalog.ts` — `resolveCatalog(): Catalog` (memoized): assembles the six release `./data/*.json` docs into a `RawCatalogBundle` and validates via the engine's `loadCatalog`. Fail-loud (all-or-nothing, FR-30). **This is the single app-side catalog source; SESSION-08's match surfaces consume `resolveCatalog()` rather than re-resolving.**
- `app-info.ts` — `APP_VERSION` (from `package.json`).
- `squad-identity.ts` — `SQUAD_LADDER` / `SquadIdentity` (design §1.4 constants).
- `collection-model.ts` — persisted-snapshot ⇄ engine-construct bridge (`snapshotToConstruct`, `constructToSnapshot`, `prebuiltToSnapshots`, `rosterToEngineRoster`), legality/cost derivation (`rosterViolations`, `rosterCostOf`, `constructCostOf`, `commanderOf`, `rosterSummary`), `asBudget`. Engine `validateRoster` remains the sole legality authority (database.md §7).
- `share.ts` — FR-7 import/export adapter over the codec: `importShareString`, `outcomeFromDecode` (pure `DecodeResult → ImportOutcome` map covering the four distinct MALFORMED / UNKNOWN_ENTRY / ILLEGAL / VERSION_UNSUPPORTED treatments; never repairs), `exportRoster`, `exportConstructSnapshot`. `UNKNOWN_ENTRY` and `VERSION_UNSUPPORTED` cannot be produced through the public encoder (it validates codes) — they are unit-tested on the pure mapping, not via crafted strings.
- `collection-context.tsx` — async persistence wiring: `CollectionProvider` (awaits `preloadMigrationModule()` once, then boots the core collection store over browser `localStorage`, falling back to an in-memory adapter with a persistence-unavailable flag), `useCollection` selector hook, `useCollectionBinding`.

### Composer draft store — `./src/app/store/build/composer.ts`, `composer-context.ts` (residual, unverified)

A SESSION-07 retry aimed at checkpoint 3 returned no parseable handoff; Jikijitsu committed its in-lease work as residual `ed7b664`. It adds a pure `ComposerDraft` model (`chassisCode` / `commanderCode` / `mounts`) with `draftFromConstruct`, `draftToConstruct`, `draftCost`, `draftViolations` (via the engine's `validateConstruct`), `setChassis` / `setCommander` / `setMount` / `removeMount` / `mountAt` / `mountMismatchReason` / `isComposable`, plus a `composer-context.ts` request channel (`requestComposerEdit({rosterId, constructIndex})` / `consumeComposerRequest()`) that `CollectionView`'s new edit button uses to hand off to `#/composer`. No typecheck, lint, or test result was reported for this retry — treat as an unverified starting point, not a shipped surface.

### AI-client bridge — `./src/app/bridge/ai-client.ts` (SESSION-08)

```ts
export type AiClientRequest =
  | Omit<AiDeployRequest, "id" | "version">
  | Omit<AiMoveRequest,   "id" | "version">
  | Omit<AiAttackRequest, "id" | "version">
  | Omit<AiRosterRequest, "id" | "version">;

export type AiCallResult =
  | { kind: "ok"; response: WorkerResponse }
  | { kind: "cancelled"; requestId: number }
  | { kind: "error"; requestId: number; errorKind: WorkerErrorKind | "WORKER_DOWN" | "MESSAGE_MALFORMED"; message: string };

export interface AiWorkerTarget {   // Worker-shaped duck type — real workers, MessagePort, and in-process fakes satisfy it.
  postMessage(msg: WorkerRequest): void;
  addEventListener(kind: "message"|"error", handler): void;
  removeEventListener(kind: "message"|"error", handler): void;
  terminate?(): void;
}
export interface AiClientOptions { poolSize?: number; factory: () => AiWorkerTarget; }
export interface AiClient {
  postAiRequest(request: AiClientRequest): { requestId: number; result: Promise<AiCallResult>; cancel(): void };
  dispose(): void;
  inFlightCount(): number;
}
createAiClient(opts): AiClient;
```

### Match store — `./src/app/store/match/` (SESSION-08, extended by `match-setup-route` SESSION-03)

```ts
type MatchModeId = "DEPLOYMENT"|"MOVEMENT_PLOT"|"MOVEMENT_PLAYBACK"|"ATTACK_PLOT"|"ATTACK_PLAYBACK"|"RESULT";
type AiStatus =
  | { kind: "IDLE" }
  | { kind: "PENDING"; requestId: number; since: number }
  | { kind: "READY_DEPLOY"; placements: readonly Placement[] }
  | { kind: "READY"; plot: SquadMovePlots | SquadAttackPlot; diagnosticsSeed: string }
  | { kind: "ERROR"; errorKind: string; message: string; requestId: number };
interface HumanDraftState {
  deploymentDrafts: Map<number, Vec2>;              // rosterIndex → position
  moveDrafts:       Map<number, readonly Vec2[]>;   // constructId → waypoints
  holdSet:          Set<number>;
  attackDrafts:     Map<number, { targetId: ConstructId; called: boolean }>;
  postureDrafts:    Map<number, Posture>;
}
interface SelectionState  { selectedConstructId; inspectedConstructId; hoveredTargetId; hoveredWaypoint;
                            showEnemyReach; rulesDrawerOpen; rulesDrawerAnchor }
interface PlaybackState   { running; cursor; speed: 1|2|4; events; beforeSnapshot; afterSnapshot;
                            stageKind: "MOVEMENT" | "ATTACK" | null }
interface MatchPresentation { highContrastSquads; showRangeMeasure; reducedMotion }
interface LaunchSnapshot    { humanSquadId; aiSquadIds: [S,S,S,S]; config: MatchConfigDigest; input: CompleteMatchLaunchConfig; seed }

interface MatchStoreState { launch, catalog, engine, mode, drafts, ai, selection, playback, present, lastError, engineRevision }
interface MatchStoreActions {
  boot(config: MatchLaunchConfig, catalog: Catalog, legacyMap?: GameMap): boolean;
  // draft mutations (deployment / movement / attack / posture) never touch engine slice
  applyDeployment():  boolean;   // deploy → transition to MOVEMENT_PLOT with playback events
  resolveMovement():  boolean;   // movement stage → MOVEMENT_PLAYBACK
  resolveAttack():    boolean;   // attack + trace + destruction + elimination + refill → ATTACK_PLAYBACK
  playbackAdvance / stepBy / skip / setRunning / setSpeed / playbackFinish
  selectConstruct / inspectConstruct / hoverTarget / hoverWaypoint / toggleEnemyReach
  openRulesDrawer / closeRulesDrawer
  setHighContrastSquads / setShowRangeMeasure / setReducedMotion
  clearError
}
createMatchStore(): StoreApi<MatchStore>;
buildHumanMovePlot(state, squad, drafts, catalog): SquadMovePlots;
buildHumanAttackPlot(state, squad, drafts): SquadAttackPlot;
countImplicitHolds(state, squad, drafts): number;
everyConstructAccountedFor(state, squad, drafts): boolean;
projectedPoolSpend(state, squad, drafts): { called, postures, total };
```

### Map-generation client — `./src/app/bridge/mapgen-client.ts` (`match-setup-route` SESSION-02)

Typed, cancellable, request-id-multiplexed client over `./src/workers/mapgen.worker.ts`, mirroring `ai-client.ts` transport but with a map-specific surface. The worker's typed error is the product-visible truth — the client never retries or relaxes generation.

```ts
export type MapGenCallResult =
  | { kind: "ok"; response: MapGenResponse }
  | { kind: "cancelled"; requestId: number }
  | { kind: "error"; requestId: number;
      errorKind: WorkerErrorKind | "WORKER_DOWN" | "MESSAGE_MALFORMED"; message: string };

export interface MapWorkerTarget {           // Worker-shaped duck type; real Worker + in-process fakes satisfy it
  postMessage(msg: WorkerRequest): void;
  addEventListener(kind: "message"|"error", handler): void;
  terminate?(): void;
}
export interface MapGenClientOptions { factory: () => MapWorkerTarget; }
export interface MapGenClient {
  request(input: Omit<MapGenRequest, "id"|"version">): { requestId: number; result: Promise<MapGenCallResult>; cancel(): void };
  dispose(): void;
  inFlightCount(): number;
}
createMapGenClient(options): MapGenClient;
browserMapGenWorker(): MapWorkerTarget;      // Vite new Worker(new URL(..., import.meta.url), { type: "module" })
```

- `MAP_MAX_REGEN` arrives verbatim in `errorKind` — regeneration exhaustion stays distinguishable from `WORKER_DOWN` / `MESSAGE_MALFORMED` / protocol errors.
- A missing-id message is treated as a downed worker (drops all outstanding); a well-formed response of an unexpected kind fails that one call as `MESSAGE_MALFORMED`.
- Cancellation swallows the eventual response (`cancelled`); `dispose()` drains outstanding calls as `WORKER_DOWN` and terminates without throwing.
- Vite bundles `mapgen.worker-*.js` from the browser factory (verified in `npm run build`).

### Setup-preparation service — `./src/app/store/build/setup-model.ts` (`match-setup-route` SESSION-02)

Headless, injected preparation service. From one displayed seed it derives ONE accepted map + FOUR legal AI rosters and returns a typed `PreparedSetup` for `match-setup-route` SESSION-04's routed screen. No React, no route, no flow-store write, no persistence, no network. Reaches map generation ONLY through `MapGenClient` and AI roster generation ONLY through `AiClient` (`asRosterOk`) — no direct engine `generateMap` / `generateAiRoster` call.

```ts
export interface SetupDraft { budget: Budget; aiTier: AiTier; selector: ArchetypeSelector; seed: string }
makeSetupDraft(fields): SetupDraft;                 // frozen
selectorForArchetype(choice: ArchetypeId | "any"): ArchetypeSelector;   // keeps "any" as engine selector
validateSetupDraft(draft): readonly ("SEED_EMPTY"|"BUDGET_INVALID"|"AI_TIER_INVALID")[];

export interface CryptoLike { getRandomValues<T extends ArrayBufferView|null>(a: T): T }
createUserSeed(source: CryptoLike | null | undefined): SeedResult;   // ok | ENTROPY_UNAVAILABLE; never Math.random / clock

export const AI_ROSTER_STREAM_LABELS =
  ["ai.squad1.roster","ai.squad2.roster","ai.squad3.roster","ai.squad4.roster"] as const;

export interface PreparedSetup {
  seed: string; budget: Budget; aiTier: AiTier; selector: ArchetypeSelector;
  mapResult: MapResult; aiRosters: readonly [Roster, Roster, Roster, Roster];
}
export interface SetupPreparationFailure {
  stage: "MAP"|"AI_ROSTER"; streamLabel: string | null;
  errorKind: WorkerErrorKind | "WORKER_DOWN" | "MESSAGE_MALFORMED" | "CANCELLED" | "UNEXPECTED_RESPONSE";
  message: string;
}
export type SetupPreparationResult = { kind:"ok"; prepared: PreparedSetup } | { kind:"error"; failure: SetupPreparationFailure };
export interface SetupGenerationClients { map: MapGenClient; ai: AiClient }

prepareSetup(draft, catalog, clients): Promise<SetupPreparationResult>;

export interface SetupGeneration { generationId: number; result: Promise<SetupPreparationResult>; cancel(): void }
export interface SetupGenerationService {
  prepare(draft, catalog): SetupGeneration;   // monotonic generationId; a cancelled stale run resolves CANCELLED
  dispose(): void;                            // disposes BOTH worker clients
  inFlightCount(): number;
}
createSetupGenerationService(clients): SetupGenerationService;
```

- Determinism: equal `(draft, catalog)` yields byte-identical prepared data; every MAP/AI request carries the same visible seed, budget, and catalog. Failure branch is checked map → squad1..4 in fixed order. No path retries with a derived or hidden seed.
- Cancellation/race: `SetupGeneration.generationId` lets a screen disregard an earlier run; a late worker response for a cancelled generation resolves as `CANCELLED`, never as a newer result.
- The `AI_ROSTER` worker request carries no tier field (roster generation is tier-independent), so `SetupDraft.aiTier` is preserved into `PreparedSetup` for match-config use, NOT threaded into roster generation.

### Setup facade — `./src/app/store/build/index.ts` (`match-setup-route` SESSION-02)

Additive re-exports only: all `setup-model` public constructors / validators / seed helper / service / result+error types, plus `createMapGenClient` + `browserMapGenWorker` and the map-client types from `../../bridge/mapgen-client`. Worker internals, pending-call maps, and test fakes are not exported. No existing export changed.

## Internal Structure

| Area | Path |
|---|---|
| Core stores | `./src/app/store/core/` (`collection-store.ts`, `flow-store.ts`, `flow-context.tsx`, `navigation-store.ts`, `preferences-store.ts`, `index.ts`) |
| Build stores (verified) | `./src/app/store/build/` (`catalog.ts`, `app-info.ts`, `squad-identity.ts`, `collection-model.ts`, `share.ts`, `collection-context.tsx`, `setup-model.ts`, `index.ts` setup facade) |
| Composer store (residual, unverified) | `./src/app/store/build/composer.ts`, `./src/app/store/build/composer-context.ts` |
| Match store (verified) | `./src/app/store/match/` (real `[human, ai1, ai2, ai3, ai4]` boot plus defensive complete-launch snapshot) |
| AI-client bridge | `./src/app/bridge/ai-client.ts` |
| Map-generation client (verified) | `./src/app/bridge/mapgen-client.ts` (shipped in `match-setup-route` SESSION-02) |

## Conventions and Invariants

- **Narrow Zustand selectors.** Private plots stay in human-local match state and never enter AI messages.
- **Do not mirror engine rules in reducers; call the engine.** The build stores route legality through `validateRoster`; the match store routes commitment through `resolveMovementPhase` / `resolveAttackPhase`.
- **Information contract (FR-24):** AI worker requests carry `PublicState` only. The match store's `resolveMovement` / `resolveAttack` build committed `SquadMovePlots` and `SquadAttackPlot` values from the human draft slice + the AI's `READY` slot payload. **Drafts NEVER appear as fields on `MatchState`** — structural asserts in `./tests/app/match/match-store.test.ts` prove the whitelist.
- **Determinism (FR-29):** the AI worker client is a pure request/response passthrough. Two calls with identical `(seed, streamLabel, ...)` produce byte-identical request envelopes and, given the worker's determinism guarantee, byte-identical responses. Cancellation is a caller-side concern only; the eventual worker response is swallowed rather than dropped mid-flight.
- **No timer / no wall clock on playback.** Every playback beat is a discrete engine `Event`. Beat durations are looked up from a static per-kind table scaled by a discrete speed multiplier (1× / 2× / 4×). The store carries no field named `timer`, `deadline`, `elapsed`, `msRemaining`, `startTs`, or `timeout` (asserted). Reduced-motion mode bypasses `setTimeout` entirely — the arrow keys advance the cursor.
- **No engine mutation during playback.** The playback slice's `cursor` advances through the pre-committed event buffer; `engine` remains identically referentially equal (asserted). `playbackFinish` swaps `engine` for the pre-computed `afterSnapshot` in one `set`.
- **Selector isolation.** Pointer-only slice writes (`hoverWaypoint`, `hoverTarget`, `selectConstruct` on the same id) do not touch the drafts, ai, or engine slice — asserted by identity comparisons on the whole match store.
- **No network / no persistence in the match store.** The store writes NOTHING to `localStorage`. The result handoff is a single `signal-loss:match-result` DOM `CustomEvent` whose detail is the derived `MatchResultPayload`; the core flow store subscribes.
- **Complete transient launch.** `MatchStore.boot` accepts a complete payload directly, builds exactly `[human, ai1, ai2, ai3, ai4]`, and snapshots a structured clone of that input for result sharing. A legacy payload requires the legacy map parameter and retains the former duplicate-human adaptation solely for existing pre-launch consumers; `MatchSetup` never uses that path. Missing or rejected payloads leave the match unbooted with a truthful error.
- **Route handoff.** The setup screen owns the worker clients for its mounted lifetime, cancels stale generation, and disposes both clients on unmount. On DEPLOY it encodes the human and four AI rosters, writes `CompleteMatchLaunchConfig` to the shared FlowStore, then navigates to `#/match`; `MatchScreen` resolves the catalog and attempts that payload once, otherwise offering a `#/setup` recovery link.
- **`preloadMigrationModule()` at app boot.** Must be called once at app boot before creating any `CollectionRepository` — the `CollectionProvider` awaits it.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-02 shipped `./src/app/store/core/**` (collection, navigation, preferences, and non-persisted flow store) with the `MatchLaunchConfig` / `MatchResultPayload` handoff contracts. |
| 2026-08-28 | SESSION-07 checkpoints 1–2 shipped the build-store bridge (`catalog`, `squad-identity`, `collection-model`, `share`, `collection-context`). Composer / setup+mapgen / result stores remain pending checkpoints 3–5. |
| 2026-08-28 | SESSION-08 shipped `./src/app/bridge/ai-client.ts` (typed multiplexed AI worker client) and `./src/app/store/match/**` (partitioned match store with drafts asserted off of `MatchState`, event-only playback with no wall-clock, and DOM `CustomEvent` result handoff). |
| 2026-08-28 | SESSION-07 retry 1 (targeting checkpoint 3) returned no parseable handoff; residual `ed7b664` added `composer.ts` / `composer-context.ts` unverified. `mapgen-client.ts` and the setup/result stores remain fully unstarted. |
| 2026-08-28 | `match-setup-route` SESSION-01 added the app-lifetime `FlowStoreProvider` seam (`./src/app/store/core/flow-context.tsx`) over the existing transient `createFlowStore()`, with `useFlowStore` / `useFlowStoreApi` hooks and a `./src/app/main.tsx` mount below `ErrorBoundary` inside `StrictMode`. `FlowStore` shape and the `MatchLaunchConfig` / `MatchResultPayload` contracts unchanged. Verified: 8 provider/core tests, typecheck, lint, build. |
| 2026-08-28 | `match-setup-route` SESSION-02 shipped the typed map-worker client (`./src/app/bridge/mapgen-client.ts`), the deterministic cancellable setup-preparation service (`./src/app/store/build/setup-model.ts`), and additive setup-facade re-exports from `./src/app/store/build/index.ts`. Map generation only via `MapGenClient`, AI rosters only via `AiClient`. Verified: 20 setup-generation tests, 122 build/core consumer tests, typecheck, lint, build. This supersedes the prior "`mapgen-client.ts` … fully unstarted" note above. |
| 2026-08-28 | `match-setup-route` SESSION-03 retry shipped the complete transient `MatchLaunchConfig`, the real five-roster `MatchStore.boot`, defensive launch/result snapshots, and one-time `MatchScreen` boot with a truthful missing-launch recovery path. Verified: 62 targeted core/match tests, typecheck, lint, build. |
| 2026-08-28 | `match-setup-route` SESSION-04 shipped `MatchSetup`: a self-registering `#/setup` route, legal human roster selection, visible-seed deterministic generation and review, and DEPLOY handoff to the shared FlowStore. Verified: 3 setup-screen tests, Chromium/Firefox/WebKit direct-route regression, typecheck, lint, build. |
