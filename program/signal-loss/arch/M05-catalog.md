# M05 — Catalog

> **Path:** `./src/engine/catalog/`
> **Imports from:** M03
> **Status:** planned for full v1

## Public API
- Catalog, Chassis, Mount, CommanderType, Dial, DialState, HardpointType, and Tunables
- loadCatalog(raw): Result<Catalog, CatalogError[]>
- Stable string-id and numeric-code lookup tables plus catalog/tunables hashes

## Internal Structure

| Area | Path |
|---|---|
| Types | `./src/engine/catalog/schema.ts` |
| Validation | `./src/engine/catalog/validate.ts` |
| Loading | `./src/engine/catalog/load.ts` |
| Facade | `./src/engine/catalog/index.ts` |

## Conventions and Invariants
- Load atomically and report every path-specific issue.
- Reject duplicate/missing codes, invalid curve declarations, impossible ports, and malformed tunables.
- No schema-validation dependency is permitted inside the engine.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
