# M02 — Authored content

> **Path:** `./data/`
> **Imports from:** —
> **Status:** planned for full v1

## Public API
- Validated chassis, mount, commander, prebuilt, tunable, and map-archetype records
- Stable numeric wire codes and deterministic catalog hashes
- Release tuning values consumed identically by browser, workers, and harness

## Internal Structure

| Area | Path |
|---|---|
| Catalogs | `./data/catalog.chassis.json, ./data/catalog.mounts.json, ./data/catalog.commanders.json` |
| Prebuilts | `./data/catalog.prebuilts.json` |
| Rules | `./data/tunables.json` |
| Maps | `./data/map.archetypes.json` |

## Conventions and Invariants
- Never reuse or renumber a published numeric code.
- All requirement tunables are data; no shadow constants in logic.
- Mock values are illustrative only; battery results determine release values.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
