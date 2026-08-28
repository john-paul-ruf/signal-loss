# M17 — App state and bridge

> **Path:** `./src/app/store/`, `./src/app/bridge/`
> **Imports from:** M12, M14, M15
> **Status:** core stores shipped in SESSION-02; partial build stores in SESSION-07 (checkpoints 1–2 of 5); AI-client bridge + match store shipped in SESSION-08. The map-generation worker client (`./src/app/bridge/mapgen-client.ts`) and the build/setup/result stores from SESSION-07 checkpoints 3–5 remain pending a fresh SESSION-07 retry.

## Public API

### Core stores — `./src/app/store/core/` (SESSION-02, complete)

- `createCollectionStore(repository)` — a Zustand vanilla store carrying loaded `PersistedStateV1`, `lastError`, boot flag, `persistenceUnavailable`, `corrupt` + `corruptRaw`. Actions: `boot`, `refresh`, `saveConstructCreate`, `saveConstructUpdate`, `saveRosterCreate`, `saveRosterUpdate`, `renameEntity`, `duplicateEntity`, `deleteEntity`, `savePreferences`, `resetCorruptStore`, `markExternallyChanged`. Every action returns a boolean success value; a failed write leaves state prior-version intact.
- `createNavigationStore({initialPath?, requestNavigation?})` — `currentPath` + `navigationCount`; `navigate(path)` publishes via the callback and `hashChanged(path)` accepts inbound hash events.
- `createPreferencesStore()` — mirror of `PersistedStateV1.preferences` plus a `resolvedReducedMotion` derived value that resolves persisted preference over the OS media query.
- `createFlowStore()` — non-persisted `pendingLaunch: MatchLaunchConfig`, `lastResult: MatchResultPayload`, `requestedEntity`. `MatchLaunchConfig` and `MatchResultPayload` are handoff CONTRACTS between the setup/result flow (SESSION-07) and the match flow (SESSION-08); those sessions extend the union under their own store subpaths and MUST NOT persist them via `CollectionRepository` (they are transient by design).

### Build stores — `./src/app/store/build/` (SESSION-07 checkpoints 1–2 of 5)

- `catalog.ts` — `resolveCatalog(): Catalog` (memoized): assembles the six release `./data/*.json` docs into a `RawCatalogBundle` and validates via the engine's `loadCatalog`. Fail-loud (all-or-nothing, FR-30). **This is the single app-side catalog source; SESSION-08's match surfaces consume `resolveCatalog()` rather than re-resolving.**
- `app-info.ts` — `APP_VERSION` (from `package.json`).
- `squad-identity.ts` — `SQUAD_LADDER` / `SquadIdentity` (design §1.4 constants).
- `collection-model.ts` — persisted-snapshot ⇄ engine-construct bridge (`snapshotToConstruct`, `constructToSnapshot`, `prebuiltToSnapshots`, `rosterToEngineRoster`), legality/cost derivation (`rosterViolations`, `rosterCostOf`, `constructCostOf`, `commanderOf`, `rosterSummary`), `asBudget`. Engine `validateRoster` remains the sole legality authority (database.md §7).
- `share.ts` — FR-7 import/export adapter over the codec: `importShareString`, `outcomeFromDecode` (pure `DecodeResult → ImportOutcome` map covering the four distinct MALFORMED / UNKNOWN_ENTRY / ILLEGAL / VERSION_UNSUPPORTED treatments; never repairs), `exportRoster`, `exportConstructSnapshot`. `UNKNOWN_ENTRY` and `VERSION_UNSUPPORTED` cannot be produced through the public encoder (it validates codes) — they are unit-tested on the pure mapping, not via crafted strings.
- `collection-context.tsx` — async persistence wiring: `CollectionProvider` (awaits `preloadMigrationModule()` once, then boots the core collection store over browser `localStorage`, falling back to an in-memory adapter with a persistence-unavailable flag), `useCollection` selector hook, `useCollectionBinding`.

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

### Match store — `./src/app/store/match/` (SESSION-08)

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
interface LaunchSnapshot    { humanSquadId; aiSquadIds: [S,S,S,S]; config: MatchConfigDigest; seed }

interface MatchStoreState { launch, catalog, engine, mode, drafts, ai, selection, playback, present, lastError, engineRevision }
interface MatchStoreActions {
  boot(config: MatchLaunchConfig, catalog: Catalog, map: GameMap): boolean;
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

## Internal Structure

| Area | Path |
|---|---|
| Core stores | `./src/app/store/core/` (`collection-store.ts`, `flow-store.ts`, `navigation-store.ts`, `preferences-store.ts`, `index.ts`) |
| Build stores (partial) | `./src/app/store/build/` (`catalog.ts`, `app-info.ts`, `squad-identity.ts`, `collection-model.ts`, `share.ts`, `collection-context.tsx`) |
| Match store | `./src/app/store/match/` |
| AI-client bridge | `./src/app/bridge/ai-client.ts` |
| Map-generation client (pending) | `./src/app/bridge/mapgen-client.ts` — SESSION-07 checkpoint 4 |

## Conventions and Invariants

- **Narrow Zustand selectors.** Private plots stay in human-local match state and never enter AI messages.
- **Do not mirror engine rules in reducers; call the engine.** The build stores route legality through `validateRoster`; the match store routes commitment through `resolveMovementPhase` / `resolveAttackPhase`.
- **Information contract (FR-24):** AI worker requests carry `PublicState` only. The match store's `resolveMovement` / `resolveAttack` build committed `SquadMovePlots` and `SquadAttackPlot` values from the human draft slice + the AI's `READY` slot payload. **Drafts NEVER appear as fields on `MatchState`** — structural asserts in `./tests/app/match/match-store.test.ts` prove the whitelist.
- **Determinism (FR-29):** the AI worker client is a pure request/response passthrough. Two calls with identical `(seed, streamLabel, ...)` produce byte-identical request envelopes and, given the worker's determinism guarantee, byte-identical responses. Cancellation is a caller-side concern only; the eventual worker response is swallowed rather than dropped mid-flight.
- **No timer / no wall clock on playback.** Every playback beat is a discrete engine `Event`. Beat durations are looked up from a static per-kind table scaled by a discrete speed multiplier (1× / 2× / 4×). The store carries no field named `timer`, `deadline`, `elapsed`, `msRemaining`, `startTs`, or `timeout` (asserted). Reduced-motion mode bypasses `setTimeout` entirely — the arrow keys advance the cursor.
- **No engine mutation during playback.** The playback slice's `cursor` advances through the pre-committed event buffer; `engine` remains identically referentially equal (asserted). `playbackFinish` swaps `engine` for the pre-computed `afterSnapshot` in one `set`.
- **Selector isolation.** Pointer-only slice writes (`hoverWaypoint`, `hoverTarget`, `selectConstruct` on the same id) do not touch the drafts, ai, or engine slice — asserted by identity comparisons on the whole match store.
- **No network / no persistence in the match store.** The store writes NOTHING to `localStorage`. The result handoff is a single `signal-loss:match-result` DOM `CustomEvent` whose detail is the derived `MatchResultPayload`; the core flow store subscribes.
- **Launch payload gap (temporary).** `boot(config, catalog, map)` currently seeds all five squads with the human roster because the pending SESSION-07 setup screen has not yet shipped AI-roster generation into the launch payload. The follow-up extends `MatchLaunchConfig` with `aiRosters: [Roster, Roster, Roster, Roster]` and threads through `boot()`.
- **Shared worker factory.** The AI-worker client factory is a parameter — SESSION-07's pending setup screen should share the same factory with the match store to keep one worker pool.
- **`preloadMigrationModule()` at app boot.** Must be called once at app boot before creating any `CollectionRepository` — the `CollectionProvider` awaits it.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-02 shipped `./src/app/store/core/**` (collection, navigation, preferences, and non-persisted flow store) with the `MatchLaunchConfig` / `MatchResultPayload` handoff contracts. |
| 2026-08-28 | SESSION-07 checkpoints 1–2 shipped the build-store bridge (`catalog`, `squad-identity`, `collection-model`, `share`, `collection-context`). Composer / setup+mapgen / result stores remain pending checkpoints 3–5. |
| 2026-08-28 | SESSION-08 shipped `./src/app/bridge/ai-client.ts` (typed multiplexed AI worker client) and `./src/app/store/match/**` (partitioned match store with drafts asserted off of `MatchState`, event-only playback with no wall-clock, and DOM `CustomEvent` result handoff). |
