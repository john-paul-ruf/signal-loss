# M17 — App state and bridge

> **Path:** `./src/app/store/, ./src/app/bridge/`
> **Imports from:** M12, M14, M15
> **Status:** planned for full v1

## Public API
- Core navigation/preferences/collection stores
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
