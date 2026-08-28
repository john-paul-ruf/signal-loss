# M10 — Public projection

> **Path:** `./src/engine/view/`
> **Imports from:** M03, M09
> **Status:** planned for full v1

## Public API
- publicView(state, squadId): PublicState
- resolutionRangeOf and known-position updates
- PublicState structurally excludes every uncommitted plot

## Internal Structure

| Area | Path |
|---|---|
| Projection | `./src/engine/view/public-state.ts` |
| Resolution loss | `./src/engine/view/resolution-loss.ts` |
| Facade | `./src/engine/view/index.ts` |

## Conventions and Invariants
- Fog affects position confidence only.
- Stats, dials, commander identity, pools, trace schedule, and map stay public.
- Own squads always have confirmed positions; AI receives the same projection contract.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
