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

<!-- SESSION-04 -->

## SESSION-04 arch delta — M09 match resolution + M10 public projection shipped

### M10 (src/engine/view/**) — public surface, as shipped

```ts
// public-state.ts
interface PublicSquad     { id; commanderDead; commanderDeathRound; poolTotal; poolSpent;
                            eliminatedRound; totals×5 (damage/pool/called/postures) }
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
resolutionRangeOf(construct, catalog): Fx;      // clamp(chassis.resolutionRange + sum(mount.rangeDelta), rangeClamp)
movementAllowanceOf(construct, catalog): Fx;    // dial state's allowance
updateKnownPositions(state, catalog): MatchState;
distanceFx(a, b): Fx;
```

### Conventions and invariants (session-shipped decisions)

- **Movement (arch §5.2):** 64-substep loop, symmetric halt fixed point.
  `resolveMovementPhase` accepts plots in ANY squad order; it indexes by
  `squadId`, not by array position. FR-15 order independence is a
  structural property, not a discipline.
- **Attack (FR-18):** the SAME `computeShot` runs both `exchangePreview`
  and `resolveAttackStage`. No parallel implementation exists.
- **Damage matrix (FR-18):** `applyMatrix(base, called, posture)` returns
  the exact FR-18 outcome; the zero cell (normal into posture) stays
  exactly 0 — the minimum-1 rule only applies to LANDING shots.
- **Range formula:** effective attack range = `chassis.baseRange +
  commander.rangeDelta + dial.rangeModifier + Σ mount.rangeDelta`,
  clamped to `chassis.rangeClamp`. Effective resolution range =
  `chassis.resolutionRange + Σ mount.rangeDelta`, clamped. (AD-2.)
- **Dial vs integrity:** attack damage and trace damage BOTH advance
  `dialIndex`. Destroyed when `dialIndex >= effectiveDialLength`.
  `effectiveDialLength = chassis.dial.length + commander.extraDialStates`.
- **Commander death (FR-17):** `squad.commanderDead` is a permanent flag
  set at applyDestruction. `poolFor` returns pool=1 for the rest of the
  match — never restored, never re-derived from a non-existent
  commander.
- **Trace (FR-20):** current step = highest-index schedule entry with
  `round >= step.round`. Constructs outside `safeRegion` (point-in-poly)
  advance dial by `step.damage`.
- **Simultaneous elimination (AD-4):** placement ordered by
  (start-of-round integrity DESC, start-of-round alive DESC, total damage
  dealt DESC, stable squad index ASC). Snapshot taken at entry to
  `resolveAttackPhase` (movement is damage-free so post-move state ==
  start-of-round for these purposes).
- **Match end (FR-21):** human eliminated → MATCH_COMPLETE with reason
  `HUMAN_ELIMINATED`; single squad standing → `LAST_STANDING`; total wipe
  same round → `SIMULTANEOUS`; winner = last standing (or AD-4 rank-1 in
  a total wipe).
- **Round 1 refill:** performed by `applyDeployments`. Round N ≥ 2
  refill: performed by `advanceRoundAndRefill` at end of round N−1's
  attack phase.
- **Deployment reveal:** simultaneous public — `applyDeployments`
  records EVERY squad's confirmedRound=1 for EVERY construct. Resolution
  loss then takes over from round 2 onward via `updateKnownPositions`.
- **Event canonical order (session-shipped):** DEPLOYMENT_REVEAL,
  POOL_REFILL, MOVED/HALTED (interleaved by construct id / substep),
  POSTURE_REVEAL, SHOT, DEFENSE_INFO, DAMAGE_APPLIED, DIAL_ADVANCED,
  TRACE_DAMAGE, DESTROYED, ELIMINATED, MATCH_COMPLETE. `sortEventsCanonical`
  is the definition of record.
- **Hash of record (FR-29):** `hashState = fnv1a64Hex(canonicalStateString(state))`.
  `canonicalize` rejects non-integer numbers, non-finite numbers, Map/Set,
  functions, symbols, undefined, bigint, and non-plain objects at
  serialization time — invariant breaks surface early.
- **Purity:** no `Math.random`, `Date`, `performance.now`, or `Date.now`
  anywhere under `src/engine/match/**` (enforced by a purity test). No
  RNG dependency (`grep -R "from ["']\\.\\./rng" src/engine/match/**`
  returns empty).
- **Wall index (attack):** built per-call in `attack.ts`
  via `buildWallIndex` with a `BOARD_SIZE / 40` fx cell size. Deterministic
  and sorted-by-id; safe to rebuild each phase.
- **Information contract (FR-24):** `PublicState` is a STRUCTURAL SUBSET
  type — deliberately NOT `Omit<MatchState, ...>` — so a future MatchState
  field cannot silently leak. The included fields are the whitelist.
  Intent is never present, not even as a boolean.
