# M09 — Match resolution

> **Path:** `./src/engine/match/`
> **Imports from:** M03, M05, M06, M08
> **Status:** planned for full v1

## Public API
- createMatch, resolveMovementPhase, resolveAttackPhase, and resolveRound (the latter composes the same staged implementations)
- legalDeployment, legalMovePlot, legalAttackPlot, exchangePreview, poolFor, and hashState
- MatchState, SquadPlots, Event, MatchLog, and canonical serializer

## Internal Structure

| Area | Path |
|---|---|
| State | `./src/engine/match/state.ts` |
| Plot legality | `./src/engine/match/plot.ts` |
| Movement | `./src/engine/match/movement.ts` |
| Attack | `./src/engine/match/attack.ts` |
| Trace/elimination | `./src/engine/match/end-round.ts` |
| Pipeline | `./src/engine/match/resolve-round.ts` |

## Conventions and Invariants
- resolveRound is pure and snapshot-then-apply.
- Movement uses 64 fixed substeps and a symmetric halt fixed point.
- Damage is accumulated from commit-time snapshots before destruction.
- Event[] is complete enough for animated and reduced-motion playback.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
