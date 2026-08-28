# M17 — App state and bridge

> **Path:** `./src/app/store/, ./src/app/bridge/`
> **Imports from:** M12, M14, M15
> **Status:** planned for full v1

## Public API
- Core navigation/preferences/collection stores plus non-persisted MatchLaunchConfig and MatchResultPayload flow handoff
- Build/setup and match stores partitioned into session-owned subdirectories
- Typed Promise-based worker clients with cancellation by request ID

## Internal Structure

| Area | Path |
|---|---|
| Core stores | `./src/app/store/core/` |
| Build stores | `./src/app/store/build/` |
| Match store | `./src/app/store/match/` |
| Worker clients | `./src/app/bridge/` |

## Conventions and Invariants
- Use narrow Zustand selectors.
- Private plots stay in human-local match state and never enter AI messages.
- Do not mirror engine rules in reducers; call the engine.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-02 -->

## M17 — App state and bridge

Core stores (`./src/app/store/core/index.ts`):

- `createCollectionStore(repository)` — a Zustand vanilla store carrying
  loaded PersistedStateV1, lastError, boot flag, persistenceUnavailable,
  corrupt+corruptRaw. Actions: `boot`, `refresh`, `saveConstructCreate`,
  `saveConstructUpdate`, `saveRosterCreate`, `saveRosterUpdate`,
  `renameEntity`, `duplicateEntity`, `deleteEntity`, `savePreferences`,
  `resetCorruptStore`, `markExternallyChanged`. Every action returns a
  boolean success value; a failed write leaves state prior-version intact.
- `createNavigationStore({initialPath?, requestNavigation?})` — currentPath +
  navigationCount; `navigate(path)` publishes via the callback and
  `hashChanged(path)` accepts inbound hash events.
- `createPreferencesStore()` — mirror of `PersistedStateV1.preferences` +
  a `resolvedReducedMotion` derived value that resolves persisted preference
  over the OS media query.
- `createFlowStore()` — non-persisted `pendingLaunch: MatchLaunchConfig`,
  `lastResult: MatchResultPayload`, `requestedEntity`. Flow types are the
  handoff CONTRACT between setup (Session 07) and match (Session 08); those
  sessions extend the union under their own store subpaths.

