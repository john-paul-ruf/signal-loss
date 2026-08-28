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
