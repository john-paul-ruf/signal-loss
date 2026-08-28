# M17 — App state and bridge

> **Path:** `./src/app/store/, ./src/app/bridge/`
> **Imports from:** M12, M14, M15
> **Status:** core stores shipped in SESSION-02 (`./src/app/store/core/**`). Build stores (`./src/app/store/build/`), match store (`./src/app/store/match/`), and worker clients (`./src/app/bridge/`) remain pending Sessions 07 and 08.

## Public API

- Core navigation/preferences/collection stores plus non-persisted `MatchLaunchConfig` and `MatchResultPayload` flow handoff (SHIPPED).
- Build/setup and match stores partitioned into session-owned subdirectories (PENDING).
- Typed Promise-based worker clients with cancellation by request ID (PENDING).

Core store surface (`./src/app/store/core/index.ts`, shipped in SESSION-02):

- `createCollectionStore(repository)` — a Zustand vanilla store carrying loaded `PersistedStateV1`, `lastError`, boot flag, `persistenceUnavailable`, `corrupt` + `corruptRaw`. Actions: `boot`, `refresh`, `saveConstructCreate`, `saveConstructUpdate`, `saveRosterCreate`, `saveRosterUpdate`, `renameEntity`, `duplicateEntity`, `deleteEntity`, `savePreferences`, `resetCorruptStore`, `markExternallyChanged`. Every action returns a boolean success value; a failed write leaves state prior-version intact.
- `createNavigationStore({initialPath?, requestNavigation?})` — `currentPath` + `navigationCount`; `navigate(path)` publishes via the callback and `hashChanged(path)` accepts inbound hash events.
- `createPreferencesStore()` — mirror of `PersistedStateV1.preferences` plus a `resolvedReducedMotion` derived value that resolves persisted preference over the OS media query.
- `createFlowStore()` — non-persisted `pendingLaunch: MatchLaunchConfig`, `lastResult: MatchResultPayload`, `requestedEntity`. `MatchLaunchConfig` and `MatchResultPayload` are handoff CONTRACTS between Session 07 (setup/result) and Session 08 (match); those sessions extend the union under their own store subpaths and MUST NOT persist them via `CollectionRepository` (they are transient by design).

## Internal Structure

| Area | Path |
|---|---|
| Core stores | `./src/app/store/core/` (`collection-store.ts`, `flow-store.ts`, `navigation-store.ts`, `preferences-store.ts`, `index.ts`) |
| Build stores | `./src/app/store/build/` (pending Session 07) |
| Match store | `./src/app/store/match/` (pending Session 08) |
| Worker clients | `./src/app/bridge/` (pending Sessions 07 and 08) |

## Conventions and Invariants

- Use narrow Zustand selectors.
- Private plots stay in human-local match state and never enter AI messages.
- Do not mirror engine rules in reducers; call the engine.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-02 shipped `./src/app/store/core/**` (collection, navigation, preferences, and non-persisted flow store) with the `MatchLaunchConfig`/`MatchResultPayload` handoff contracts. Build stores, match store, and bridge remain pending. |

<!-- SESSION-07 -->

### SESSION-07 arch delta — build-zone surfaces (checkpoints 1–2 of 5 landed)

Session 07 is partially delivered: checkpoints 1 (boot + codex) and 2 (collection
+ persistence + share) are committed and verified; checkpoints 3–5 (composer,
setup+mapgen, result+e2e) remain. The modules below are the public surface added
so far.

#### M17 (app state / bridge) — `src/app/store/build/`

- `catalog.ts` — `resolveCatalog(): Catalog` (memoized): assembles the six release
  `./data/*.json` docs into a `RawCatalogBundle` and validates via the engine's
  `loadCatalog`. Fail-loud (all-or-nothing, FR-30). This is the single app-side
  catalog source; **Session 08's match surfaces should consume `resolveCatalog()`
  rather than re-resolving.**
- `app-info.ts` — `APP_VERSION` (from `package.json`).
- `squad-identity.ts` — `SQUAD_LADDER` / `SquadIdentity` (design §1.4 constants).
- `collection-model.ts` — persisted-snapshot ⇄ engine-construct bridge
  (`snapshotToConstruct`, `constructToSnapshot`, `prebuiltToSnapshots`,
  `rosterToEngineRoster`), legality/cost derivation (`rosterViolations`,
  `rosterCostOf`, `constructCostOf`, `commanderOf`, `rosterSummary`), `asBudget`.
  Engine `validateRoster` remains the sole legality authority (database.md §7).
- `share.ts` — FR-7 import/export adapter over the codec: `importShareString`,
  `outcomeFromDecode` (pure `DecodeResult → ImportOutcome` map covering the four
  distinct MALFORMED/UNKNOWN_ENTRY/ILLEGAL/VERSION_UNSUPPORTED treatments; never
  repairs), `exportRoster`, `exportConstructSnapshot`.
- `collection-context.tsx` — async persistence wiring: `CollectionProvider`
  (awaits `preloadMigrationModule()` once, then boots the core collection store
  over browser `localStorage`, falling back to an in-memory adapter with a
  persistence-unavailable flag), `useCollection` selector hook, `useCollectionBinding`.


<!-- SESSION-08 -->

## SESSION-08 arch delta — Match shell, board, plotting, playback shipped

### M17 (src/app/bridge/**, src/app/store/match/**) — public surface, as shipped

```ts
// src/app/bridge/ai-client.ts
export type AiClientRequest =
  | Omit<AiDeployRequest, "id" | "version">
  | Omit<AiMoveRequest,   "id" | "version">
  | Omit<AiAttackRequest, "id" | "version">
  | Omit<AiRosterRequest, "id" | "version">;

export type AiCallResult =
  | { kind: "ok"; response: WorkerResponse }
  | { kind: "cancelled"; requestId: number }
  | { kind: "error"; requestId: number; errorKind: WorkerErrorKind | "WORKER_DOWN" | "MESSAGE_MALFORMED"; message: string };

export interface AiWorkerTarget {                    // Worker-shaped duck type — real workers, MessagePort, and in-process fakes satisfy it.
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

// src/app/store/match/index.ts
type MatchModeId = "DEPLOYMENT"|"MOVEMENT_PLOT"|"MOVEMENT_PLAYBACK"|"ATTACK_PLOT"|"ATTACK_PLAYBACK"|"RESULT";
type AiStatus =
  | { kind: "IDLE" }
  | { kind: "PENDING"; requestId: number; since: number }
  | { kind: "READY_DEPLOY"; placements: readonly Placement[] }
  | { kind: "READY"; plot: SquadMovePlots | SquadAttackPlot; diagnosticsSeed: string }
  | { kind: "ERROR"; errorKind: string; message: string; requestId: number };
interface HumanDraftState {
  deploymentDrafts: Map<number, Vec2>; // rosterIndex → position
  moveDrafts:       Map<number, readonly Vec2[]>; // constructId → waypoints
  holdSet:          Set<number>;
  attackDrafts:     Map<number, { targetId: ConstructId; called: boolean }>;
  postureDrafts:    Map<number, Posture>;
}
interface SelectionState {
  selectedConstructId: ConstructId | null;
  inspectedConstructId: ConstructId | null;
  hoveredTargetId:  ConstructId | null;
  hoveredWaypoint:  Vec2 | null;
  showEnemyReach:   boolean;
  rulesDrawerOpen:  boolean;
  rulesDrawerAnchor: string | null;
}
interface PlaybackState {
  running: boolean; cursor: number; speed: 1|2|4;
  events: readonly Event[];
  beforeSnapshot: MatchState | null;
  afterSnapshot:  MatchState | null;
  stageKind: "MOVEMENT" | "ATTACK" | null;
}
interface MatchPresentation { highContrastSquads: boolean; showRangeMeasure: boolean; reducedMotion: boolean }
interface LaunchSnapshot { humanSquadId: SquadId; aiSquadIds: [S,S,S,S]; config: MatchConfigDigest; seed: string }

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


### Conventions and invariants (session-shipped decisions)

- **Information contract (FR-24):** AI worker requests carry `PublicState` only. The
  match store's `resolveMovement`/`resolveAttack` build committed `SquadMovePlots` and
  `SquadAttackPlot` values from the human draft slice + the AI's READY slot payload.
  Drafts NEVER appear as fields on `MatchState`. Structural asserts in
  `tests/app/match/match-store.test.ts` prove the whitelist.
- **Determinism (FR-29):** the AI worker client is a pure request/response
  passthrough. Two calls with identical `(seed, streamLabel, ...)` produce
  byte-identical request envelopes and, given the worker's determinism guarantee,
  byte-identical responses. Cancellation is a caller-side concern only; the
  eventual worker response is swallowed rather than dropped mid-flight.
- **No timer / no wall clock:** every playback beat is a discrete engine `Event`.
  Beat durations are looked up from a static per-kind table scaled by a
  discrete speed multiplier (1×/2×/4×). The store carries no field named
  `timer`, `deadline`, `elapsed`, `msRemaining`, `startTs`, or `timeout`
  (asserted). Reduced-motion mode bypasses `setTimeout` entirely — the arrow
  keys advance the cursor.
- **No engine mutation during playback:** the playback slice's `cursor`
  advances through the pre-committed event buffer; `engine` remains
  identically referentially equal (asserted). `playbackFinish` swaps
  `engine` for the pre-computed `afterSnapshot` in one set.
- **Selector isolation:** pointer-only slice writes (hoverWaypoint,
  hoverTarget, selectConstruct on the same id) do not touch the drafts,
  ai, or engine slice. Asserted by identity comparisons on the whole
  match store.
- **Board rendering:** three stacked <canvas> layers share one camera
  transform. Terrain redraws on map / engine-revision change; field
  redraws on engine-revision; overlay redraws on pointer / selection /
  playback cursor. Hit-testing is arithmetic (inverse camera + fx
  distance), never pixel-read. `snapPointerToFx` rounds every pointer
  position to integer fx so drafts stay hash-stable across replays.
- **Squad separability:** each of the five squads has a distinct
  (lightness, glyph, pattern, tag) tuple. `separabilityTriples()` proves
  five distinct triples exist — meeting NFR-5's color-blind requirement
  without any color channel.
- **Reduced-motion parity (FR-26):** `toCard(event, i)` covers every
  event kind — `everyKindCovered(kind): 1` is a TypeScript exhaustive
  switch that fails to compile if a new kind ships without a card. A
  runtime test iterates every kind and asserts `title` and `detail`
  are non-empty.
- **Rules drawer (FR-27):** opens with `?` or `F1` from every match
  mode; closes with `Escape`. FocusTrap restores focus to the opener on
  close. Glossary terms deep-link via `openRulesDrawer(anchor)` — the
  drawer scrolls the anchor into view and focuses it on next render.
- **No network / no persistence:** the match store writes NOTHING to
  `localStorage`. The result handoff is a single `signal-loss:match-result`
  DOM CustomEvent whose detail is the derived `MatchResultPayload`; the
  core flow store subscribes.
- **Confirm-commit modal (design.md §5.6):** movement commit surfaces
  a ConfirmModal listing implicit HOLDs (constructs without a plotted
  path or explicit HOLD). Ctrl+Enter opens the modal; the destructive
  action is a second, explicit click.

