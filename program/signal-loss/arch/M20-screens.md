# M20 — Screens

> **Path:** `./src/app/screens/`
> **Imports from:** M12, M14, M17–M19
> **Status:** planned for full v1

## Public API
- Route modules for boot, build collection/composer, codex, setup, result, and match modes
- Screen-level flow orchestration using engine/store/component APIs

## Internal Structure

| Area | Path |
|---|---|
| Entry/build | `./src/app/screens/boot/, ./src/app/screens/build/, ./src/app/screens/codex/` |
| Setup/result | `./src/app/screens/setup/, ./src/app/screens/result/` |
| Match | `./src/app/screens/match/` |

## Conventions and Invariants
- Each route self-registers through route discovery; do not edit the bootstrap registry.
- Screens 05–08 and rules share one persistent match shell.
- Under 1280×720 show the desktop requirement instead of degrading the layout.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
