# M02 — Authored content

> **Path:** `./data/`
> **Imports from:** —
> **Status:** release bundle shipped in SESSION-06 (catalog hash `18a634daecb23aef`, tunables hash `81071539e5673d96`); the static app-side AI input `ai.weights.json` was added in `fix-match-start` SESSION-01.

## Public API

- Validated chassis, mount, commander, prebuilt, tunable, and map-archetype records under `./data/*.json`.
- Stable numeric wire codes and deterministic catalog hashes consumed identically by browser, workers, and harness.
- Release tuning values driving M05 catalog validation, M08 map generation, M09 match resolution, and M11 AI.

## Internal Structure

| Area | Path |
|---|---|
| Catalogs | `./data/catalog.chassis.json`, `./data/catalog.mounts.json`, `./data/catalog.commanders.json` |
| Prebuilts | `./data/catalog.prebuilts.json` |
| Rules | `./data/tunables.json` |
| Maps | `./data/map.archetypes.json` |
| AI input | `./data/ai.weights.json` |

## Release Content (as shipped)

- **`catalog.chassis.json`** — 4 hardpoint types (primary / auxiliary / defensive / utility) + 7 chassis covering all three curve families: degrade (HARDLINE / BASTION / JUGGERNAUT), spike (SURGE / PHANTOM), inversion (CASCADE / MIRAGE). Stable numeric codes 10..16. Every `resolutionRange` validated to lie inside its own `rangeClamp`.
- **`catalog.mounts.json`** — 11 mounts across all 5 families: ice (ice-wall, ice-barrier), daemon (daemon-lash, daemon-swarm), spike (spike-driver, spike-maul), spoofer (spoofer-mesh, spoofer-echo), wipe (wipe-charge, wipe-purge, wipe-strobe). Stable codes 20..30.
- **`catalog.commanders.json`** — 4 commander types: CIPHER (movement, base 1), SYSOP (defense, base 1), BULWARK (integrity, base 1, `extraDialStates=2`), OVERCLOCK (fragile high-pool, base 2). Stable codes 1..4.
- **`catalog.prebuilts.json`** — 8 legal prebuilts, one per budget (25 / 50 / 75 / 100 / 125 / 150 / 175 / 200). Every chassis, every mount family, and every commander type appears at least once across the set; every prebuilt validates through `validateCatalogPrebuilts`.
- **`tunables.json`** — all 25 requirement tunables. Board size 64×64 (`BOARD_SIZE = 65_536` fx); `MOVE_SUBSTEPS = 64`; `MAX_REGEN_ATTEMPTS = 100` (validator ceiling); remaining values chosen as permissive initial ranges pending later tuning.
- **`map.archetypes.json`** — the 7 declared archetypes. Ranges intentionally wide so gate rejections are captured by FR-11 checks rather than by `ARCHETYPE_RANGE` bounds.
- **`ai.weights.json`** (`fix-match-start` SESSION-01) — the static release AI coefficients (`weights: AiWeights`) plus a small `deploymentNodeBudget`, bundled for the app's in-browser AI worker path. Unlike the catalog/tunables it is NOT engine rule state and is NOT validated by `loadCatalog`; it is validated at the app boundary by M17's `resolveMatchAiConfig` (`ai-config.ts`). It duplicates the release AI weights rather than importing the test-harness fixture, because production has no app-side source for them.

## Conventions and Invariants

- Never reuse or renumber a published numeric code.
- All requirement tunables are data; no shadow constants in logic.
- Mock values are illustrative only; release values are authored under this module and tuned via SESSION-06's shipping batteries.
- **Coverage invariants** (asserted at load time by `./tests/harness/content.test.ts`): every curve family present, every mount family present, every commander doctrine present, every required archetype id present, `MOVE_SUBSTEPS === 64`, `RANGE_MIN ≤ RANGE_MAX`, `resolutionRange` inside `rangeClamp` for every chassis.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-06 shipped the release bundle at `./data/*.json`: 7 chassis / 11 mounts / 4 commanders / 8 prebuilts / all 25 tunables / 7 archetypes; catalog hash `18a634daecb23aef`, tunables hash `81071539e5673d96`. |
| 2026-08-29 | `fix-match-start` SESSION-01 added `./data/ai.weights.json` — the static release AI coefficients + `deploymentNodeBudget` for the app's browser AI worker path, validated at the app boundary by M17's `resolveMatchAiConfig`, not by engine catalog validation. |
