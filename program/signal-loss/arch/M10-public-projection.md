# M10 — Public projection

> **Path:** `./src/engine/view/`
> **Imports from:** M03, M09
> **Status:** shipped in SESSION-04.

## Public API

```ts
// public-state.ts — the whitelist projection
interface PublicSquad     { id; commanderDead; commanderDeathRound; poolTotal; poolSpent;
                            eliminatedRound; totals×5 (damage / pool / called / postures) }
interface PublicConstruct { id; squadId; chassisCode; commanderCode; mounts; dialIndex;
                            destroyed; destroyedRound; damageDealt; damageTaken;
                            roundsAlive; calledShotsFired; posturesHeld }
interface KnownConstruct  { base: PublicConstruct; position: Vec2; confirmedRound;
                            confirmed: boolean; driftRadius: Fx }
interface PublicState     { observer: SquadId; config; round; phase; map;
                            squads: readonly [PublicSquad × 5];
                            constructs: readonly KnownConstruct[];    // sorted by id
                            eliminationOrder; winner: SquadId | null }

publicView(state, observer, catalog): PublicState;

// resolution-loss.ts
resolutionRangeOf(construct, catalog): Fx;      // clamp(chassis.resolutionRange + Σ mount.rangeDelta, rangeClamp)
movementAllowanceOf(construct, catalog): Fx;    // dial state's allowance
updateKnownPositions(state, catalog): MatchState;
distanceFx(a, b): Fx;
```

## Internal Structure

| Area | Path |
|---|---|
| Projection | `./src/engine/view/public-state.ts` |
| Resolution loss | `./src/engine/view/resolution-loss.ts` |
| Facade | `./src/engine/view/index.ts` |

## Conventions and Invariants

- **Information contract (FR-24):** `PublicState` is a STRUCTURAL SUBSET type — deliberately NOT `Omit<MatchState, ...>` — so a future `MatchState` field cannot silently leak. The listed fields ARE the whitelist. Intent is never present, not even as a boolean. `HumanDraftPlots` never appears on any projection.
- **Fog affects position confidence only.** Stats, dials, commander identity, pools, trace schedule, and map stay public. Own-squad constructs always have `confirmed: true` and the true position; enemy positions are gated by `resolutionRangeOf` and ghosted with `driftRadius` while stale.
- **Own squads always confirmed.** AI receives the same projection contract — no tier, no view helper, ever returns `MatchState`.
- **`resolutionRangeOf` clamps to `chassis.rangeClamp` deliberately.** Release chassis tuning under `./data/*.json` must keep every `resolutionRange` inside its clamp (SESSION-06 verified).
- **From round 2 onward, `updateKnownPositions` refreshes fog.** Round 1 fog is pre-populated by `applyDeployments` (see M09).

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-04 retry 1 shipped `./src/engine/view/**` with `PublicState` as a whitelist type, per-observer `knownPositions` + drift ghosts, and the round-2+ resolution-loss update. Included in the 88 new SESSION-04 match/view tests. |
