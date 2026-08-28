# M19 — UI components

> **Path:** `./src/app/components/`
> **Imports from:** M12, M17
> **Status:** planned for full v1

## Public API
- Shared semantic controls and feedback
- Build-specific cards, dial, hardpoint, legality, and budget components
- Match-specific ledger, exchange, inspector, trace, log, transport, and rules components

## Internal Structure

| Area | Path |
|---|---|
| Shared | `./src/app/components/shared/` |
| Build | `./src/app/components/build/` |
| Setup/result | `./src/app/components/setup/, ./src/app/components/result/` |
| Match | `./src/app/components/match/` |

## Conventions and Invariants
- All interactive states include focus-visible and disabled semantics.
- Public facts are zero or one interaction deep.
- Exact numbers use mono type and no visual-only bar replaces them.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
