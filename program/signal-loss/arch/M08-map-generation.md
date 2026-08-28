# M08 — Map generation

> **Path:** `./src/engine/map/`
> **Imports from:** M02, M03, M04, M05
> **Status:** planned for full v1

## Public API
- generateMap, runPlayabilityGate, and measureArchetype
- GameMap, MapResult, GateReport, SpawnRegion, and trace schedule types
- Seven seeded archetypes and deterministic retry derivation

## Internal Structure

| Area | Path |
|---|---|
| Types | `./src/engine/map/types.ts` |
| Generation | `./src/engine/map/generate.ts` |
| Analysis grid | `./src/engine/map/analysis-grid.ts` |
| Gate | `./src/engine/map/gate.ts` |
| Facade | `./src/engine/map/index.ts` |

## Conventions and Invariants
- Rule geometry stays continuous; the coarse grid has analysis authority only.
- Trace overlays immutable terrain.
- After MAX_REGEN_ATTEMPTS, return a surfaced defect instead of relaxing checks.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-03 -->

## M08 — Map generation

Public API (`./src/engine/map/index.ts`):

```ts
// Types
interface GameMap { seed, acceptedAttempt, archetypeId, bounds, walls,
                    spawns: SpawnQuintet, traceSchedule }
type SpawnQuintet = readonly [SpawnRegion, ×5]
interface SpawnRegion { squadIndex: 0..4, polygon, anchor }
interface WallSegment { id, a, b }               // stable 0-indexed ids
interface TraceStep { round, safeRegion, damage }
interface ArchetypeMetrics { wallDensity, meanSightlineLength, openAreaFraction }
interface MapResult { map: GameMap, rejectedReports: readonly {…}[] }
interface MapGenerationDefect { kind: "MAX_REGEN_EXCEEDED", baseSeed,
                                 archetypeId, attempts: readonly {…}[] }
interface GateReport { passed, checks: readonly GateCheck[] }
interface GateCheck { id: GateCheckId, passed, observed, threshold, message }
type GateCheckId =                    // canonical order:
  | "CONNECTIVITY" | "POCKETS" | "COVER_DISTRIBUTION"
  | "SPAWN_FAIRNESS" | "CHOKEPOINTS" | "TRACE_SURVIVABILITY"
  | "ARCHETYPE_RANGE"
const GATE_CHECK_ORDER: readonly GateCheckId[];

// Generation
type ArchetypeSelector =
  | { kind: "id",  id: ArchetypeId }
  | { kind: "any" }
function generateMap(baseSeed, selector, archetypes, tunables,
                     options?: GenerateMapOptions): MapResult;   // throws MaxRegenExceededError
function resolveArchetype(baseSeed, selector, archetypes): MapArchetype;
class MaxRegenExceededError extends Error { readonly defect: MapGenerationDefect }

// Gate + measurement
function runPlayabilityGate(map: GameMap, ctx: GateContext): GateReport;
interface GateContext { tunables, archetype, cellSize?, wallIndexCellSize?, measureOptions? }
function measureArchetype(walls, bounds, options: MeasureOptions): ArchetypeMetrics;
function measureGameMap(map, options): ArchetypeMetrics;
const DEFAULT_MEASURE_OPTIONS: MeasureOptions;
```

Conventions in effect:

- **Named RNG stream labels** (constant, stable, never renumbered):
  `"walls"`, `"hazards"`, `"spawns"`, `"trace"`, `"cosmetic"`. Each
  subsystem consumes only its own stream; changing wall generation
  does not shift spawn or hazard placement — property tested against
  the `hazard-field` archetype in `generators.test.ts`.
- **"Any" archetype selection** uses the `"archetype.any"` stream on
  the base seed. Archetypes are sorted by numeric code before the
  pick, so authoring order in `./data/*.json` does not affect the
  choice.
- **Regeneration seed derivation**: attempt 1 uses `baseSeed`
  verbatim; attempt `n ≥ 2` uses the string `` `${baseSeed}#regen${n-1}` ``.
  Selected archetype is CACHED across retries (per FR-10 for `any`
  and per session prompt for `id`), so the retry loop varies only
  wall/spawn/trace draws.
- **Rejection reports** are preserved on the accepted `MapResult`
  under `rejectedReports` (empty when the first attempt passes),
  plus attached to `MapGenerationDefect.attempts` on failure. Both
  the accepted map and every rejection are canonically hashable —
  the 100-map repeatability probe compares both across runs.
- **Coarse analysis grid has NO rule authority**: rasterization is
  a conservative AABB-overlap tag (wall touches any cell in its
  bounding box → cell marked blocked/cover). Movement, LOS, and
  damage all continue to use `./src/engine/fx/` continuous
  primitives — the grid never leaks into `./src/engine/match/`.
- **Trace overlays immutable terrain** (AD-1): `TraceStep.safeRegion`
  is polygon geometry evaluated at match time as a point-in-poly
  test; walls in `GameMap.walls` are the SAME array from round 1
  to elimination. `buildTraceSchedule` validates monotone nesting
  at construction time.
- **Gate check order is canonical**: `runPlayabilityGate` re-sorts
  its output into `GATE_CHECK_ORDER` before returning, so
  positional indexing by downstream consumers is stable regardless
  of internal evaluation order.
