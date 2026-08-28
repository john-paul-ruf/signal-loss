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

