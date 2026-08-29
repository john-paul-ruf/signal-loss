# M09 — Match resolution

> **Path:** `./src/engine/match/`
> **Imports from:** M03, M05, M06, M08
> **Status:** shipped in SESSION-04.

## Public API

Facade over the module. `MatchState` is plain, structurally cloneable, with sorted-by-id arrays; every canonical hash is FNV-1a-64 hex.

```ts
// state.ts — plain values, no classes, cloneable across postMessage
type SquadId     = number & { readonly [brand]: "SquadId" };      // 0..4
type ConstructId = number & { readonly [brand]: "ConstructId" };  // stable integer
const SQUAD_COUNT = 5;
const SQUAD_IDS: readonly SquadId[]; // [0,1,2,3,4]

type MatchPhase = "DEPLOYMENT" | "MOVEMENT_PLOT" | "ATTACK_PLOT" | "COMPLETE";

interface MatchConfigDigest { seed; budget; aiTier; catalogHash; tunablesHash; }
interface MatchConfig       { seed; budget; aiTier; catalog; map; rosters[5]; }
interface Placement         { rosterIndex; position: Vec2; }

interface MatchConstruct {
  id: ConstructId; squadId: SquadId;
  chassisCode; commanderCode; mounts;
  position: Vec2;
  dialIndex: number;                     // both attack and trace advance; destroyed when >= effective length
  destroyed: boolean; destroyedRound: number | null;
  damageDealt; damageTaken; roundsAlive; calledShotsFired; posturesHeld;
}
interface SquadState {
  id: SquadId;
  commanderDead: boolean; commanderDeathRound: number | null;   // PERMANENT flag on trip
  poolTotal; poolSpent;
  eliminatedRound: number | null;
  totalDamageDealt/Taken; totalPoolGranted/Spent/Wasted; totalCalledShots; totalPostures;
}
interface KnownPositionEntry { observer: SquadId; subject: ConstructId; position: Vec2; confirmedRound: number; }
interface EliminationEntry   { squadId: SquadId; round: number; placement: 1|2|3|4|5; }

interface MatchState {
  config: MatchConfigDigest;
  constructs: readonly MatchConstruct[];           // sorted by id
  eliminationOrder: readonly EliminationEntry[];
  knownPositions: readonly KnownPositionEntry[];   // sorted (observer, subject)
  map: GameMap;
  phase: MatchPhase;
  round: number;                                    // 0 during DEPLOYMENT; 1+ after applyDeployments
  squads: readonly [SquadState × 5];
  winner: SquadId | null;
}

createMatch(config): Result<MatchState, Violation[]>;

// deployment.ts
legalDeployment(state, squadId, placements, catalog): Violation[];
applyDeployments(state, [placements×5], catalog): Result<MatchState, Violation[]>;
applyDeploymentsWithEvents(state, [placements×5], catalog): Result<{state, events}, Violation[]>;

// plot.ts — legality and effective-dial helpers
interface MovePlot          { constructId: ConstructId; path: readonly Vec2[]; }
interface AttackPlot        { constructId: ConstructId; targetId: ConstructId; called: boolean; }
type Posture                = "FLAT" | "POSTURE";
interface PostureAssignment { constructId: ConstructId; posture: Posture; }
interface SquadMovePlots    { squadId; moves: readonly MovePlot[]; }
interface SquadAttackPlot   { squadId; attacks; postures; }
interface SquadPlots        { squadId; moves; attacks; postures; }
interface HumanDraftPlots   { squadId; moveDrafts; attackDrafts; postureDrafts; } // UI-only, never on MatchState

legalMovePlot(state, constructId, path, catalog): Result<MovePlot, Violation[]>;
legalAttackPlot(state, squadId, plot): Violation[];
currentDialState(construct, catalog): DialState | undefined;
effectiveDialLength(construct, catalog): number;

// events.ts — canonical order below is definition of record
type Event = DEPLOYMENT_REVEAL | POOL_REFILL | MOVED | HALTED | POSTURE_REVEAL
           | SHOT | DEFENSE_INFO | DAMAGE_APPLIED | DIAL_ADVANCED
           | TRACE_DAMAGE | DESTROYED | ELIMINATED | MATCH_COMPLETE;
sortEventsCanonical(events): readonly Event[];

// canonical.ts — hash of record for FR-29
canonicalize(value, path?): string;
canonicalStateString(state): string;
fnv1a64Hex(input): string;
hashState(state): string;

// movement.ts / attack.ts / end-round.ts / pool.ts
resolveMovementPhase(state, [SquadMovePlots × 5], catalog):
  Result<{ state, events: readonly Event[] }, Violation[]>;

poolFor(state, squadId, catalog): PoolBreakdown;
countAlive(state, squadId): number;

computeShot(attacker, target, called, targetPosture, catalog, wallIndex): ShotOutcome;
applyMatrix(baseDamage, called, targetPosture): number;
effectiveAttackRange(construct, catalog): Fx;
effectiveDamage(construct, catalog): number;
exchangePreview(state, attackerId, targetId, called, catalog): ExchangeCard | null;
resolveAttackStage(state, [SquadAttackPlot × 5], catalog):
  Result<{state, events, attackerDamageDealt}, Violation[]>;

applyTrace(state, catalog): { state, events };
applyDestruction(state, catalog, attackDamageByCid): { state, events };
snapshotStartOfRound(state, catalog): StartOfRoundSnapshot;
checkElimination(state, snapshot): { state, events };
advanceRoundAndRefill(state, catalog): { state, events };

// resolve-round.ts — the composition
resolveAttackPhase(state, [SquadAttackPlot × 5], catalog): Result<{state, events}, Violation[]>;
resolveRound(state, [SquadPlots × 5], catalog): Result<{state, events}, Violation[]>;

// replay.ts
const MATCH_LOG_VERSION = 1;
interface MatchLog {
  formatVersion; seed; budget; archetype; aiTier;
  catalogHash; tunablesHash;
  rosterShareStrings: readonly [string × 5];                    // SL1
  deployments: readonly [readonly Placement[] × 5];
  plots: readonly (readonly [SquadPlots × 5])[];
}
makeMatchLog(input): MatchLog;
foldMatchLog(log, catalog, map): MatchLogResult;
```

## Internal Structure

| Area | Path |
|---|---|
| State | `./src/engine/match/state.ts` |
| Deployment | `./src/engine/match/deployment.ts` |
| Plot legality | `./src/engine/match/plot.ts` |
| Events + canonical sort | `./src/engine/match/events.ts` |
| Canonical hash | `./src/engine/match/canonical.ts` |
| Movement | `./src/engine/match/movement.ts` |
| Pool | `./src/engine/match/pool.ts` |
| Attack | `./src/engine/match/attack.ts` |
| Trace / destruction / elimination | `./src/engine/match/end-round.ts` |
| Pipeline | `./src/engine/match/resolve-round.ts` |
| Replay | `./src/engine/match/replay.ts` |

## Conventions and Invariants

- **Purity:** no `Math.random`, `Date`, `Date.now`, or `performance.now` under `./src/engine/match/**` (enforced by a purity test). No RNG dependency: `grep -R "from ['\"]\.\./rng" src/engine/match/**` returns empty. The resolution pipeline is snapshot-then-apply and rule-affecting sorts have explicit total comparators ending on stable-id tiebreaks.
- **Movement (arch §5.2, FR-15):** 64 fixed substeps and a symmetric halt fixed point. `resolveMovementPhase` accepts plots in ANY squad order — it indexes by `squadId`, not by array position. FR-15 order independence is a structural property, not a discipline.
- **Attack (FR-18):** the SAME `computeShot` runs both `exchangePreview` and `resolveAttackStage` — one implementation. `applyMatrix(base, called, posture)` returns the exact FR-18 outcome; the zero cell (normal into posture) stays exactly 0 — the minimum-1 rule applies only to LANDING shots.
- **Range formula (AD-2):** effective attack range = `chassis.baseRange + commander.rangeDelta + dial.rangeModifier + Σ mount.rangeDelta`, clamped to `chassis.rangeClamp`. Effective resolution range = `chassis.resolutionRange + Σ mount.rangeDelta`, clamped.
- **Dial vs integrity:** attack damage and trace damage BOTH advance `dialIndex`. Destroyed when `dialIndex >= effectiveDialLength`; `effectiveDialLength = chassis.dial.length + commander.extraDialStates`.
- **Commander death (FR-17):** `squad.commanderDead` is a permanent flag set at `applyDestruction`. `poolFor` returns pool=1 for the rest of the match — never restored, never re-derived from a non-existent commander.
- **Trace (FR-20):** current step = highest-index schedule entry with `round ≥ step.round`. Constructs outside `safeRegion` (point-in-poly) advance dial by `step.damage`.
- **Simultaneous elimination (AD-4):** placement ordered by (start-of-round integrity DESC, start-of-round alive DESC, total damage dealt DESC, stable squad index ASC). Snapshot taken at entry to `resolveAttackPhase` (movement is damage-free so post-move state == start-of-round for these purposes).
- **Match end (FR-21):** human eliminated → `MATCH_COMPLETE` with reason `HUMAN_ELIMINATED`; single squad standing → `LAST_STANDING`; total wipe same round → `SIMULTANEOUS`; winner = last standing (or AD-4 rank-1 in a total wipe).
- **Refills:** Round 1 refill is performed by `applyDeployments`. Round N≥2 refill is performed by `advanceRoundAndRefill` at end of round N−1's attack phase.
- **Deployment reveal:** simultaneous public — `applyDeployments` records EVERY squad's `confirmedRound=1` for EVERY construct. From round 2 onward, resolution loss takes over via M10's `updateKnownPositions`. `applyDeploymentsWithEvents` returns `DEPLOYMENT_REVEAL + POOL_REFILL` for the round-1 log; plain `applyDeployments` returns just the state.
- **Event canonical order:** DEPLOYMENT_REVEAL, POOL_REFILL, MOVED/HALTED (interleaved by construct id / substep), POSTURE_REVEAL, SHOT, DEFENSE_INFO, DAMAGE_APPLIED, DIAL_ADVANCED, TRACE_DAMAGE, DESTROYED, ELIMINATED, MATCH_COMPLETE. `sortEventsCanonical` is definition of record; `Event[]` is complete enough for animated and reduced-motion playback.
- **Hash of record (FR-29):** `hashState = fnv1a64Hex(canonicalStateString(state))`. `canonicalize` rejects non-integer numbers, non-finite numbers, Map/Set, functions, symbols, undefined, bigint, and non-plain objects at serialization time — invariant breaks surface early.
- **Wall index (attack):** rebuilt per-call in `attack.ts` via `buildWallIndex` with a `BOARD_SIZE / 40` fx cell size. Deterministic and sorted-by-id; safe to rebuild each phase.
- **Test-fixture caveat:** `makeCloseSoloMatch` is only for tests. Production UI must respect the FR-12 spawn-region constraint at deployment time — the engine deliberately allows post-deployment positions anywhere in bounds.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-04 retry 1 shipped `./src/engine/match/**` with plain cloneable `MatchState`, deployment reveal, 64-substep symmetric movement, one-implementation exchange preview + resolve, permanent `commanderDead` flag, trace/destruction/AD-4-tiebroken elimination, `resolveRound` composition, canonical FNV-1a-64 state hashing, `MatchLog v1` fold with fail-loud catalog/tunables hash guards. 88 new match/view tests including 120-permutation invariance on movement, attack, `resolveRound`, and `foldMatchLog`. |

<!-- SESSION-02 -->
### M09 — Match resolution delta

- `MovedEvent` now requires `plottedPath: readonly Vec2[]`, the exact engine-normalized polyline used during resolution. This is presentation-only event data: it is not copied into `MatchState`, does not participate in rule computation, and does not alter canonical state hashes.

