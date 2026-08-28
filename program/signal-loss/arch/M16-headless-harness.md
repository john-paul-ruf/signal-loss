# M16 — Headless harness

> **Path:** `./harness/` + supporting code under `./tests/harness/support/`
> **Imports from:** M12
> **Status:** shipped in SESSION-06 (664 total tests passing at completion; 55 new harness self-tests).

## Public API

- **Executable entry:** `./harness/cli.ts` — thin bin wrapper that reads argv, calls `runCli`, and exits with the returned code.
- **CLI:** `sl <battery> [--seeds N] [--seed S] [--explicit-seeds ...] [--budget B] [--ai-tier T] [--json] [--output path] [--partitions N] [--partition K] [--node-budget N] [--max-rounds N] [--source-revision R]`
- **Batteries:** determinism, playability, behavior, costing, and an `all` aggregator, each over the M12 engine facade.
- **Reports:** machine-readable (`--json`) and human-readable formatters, both deterministic.

Support surface (`./tests/harness/support/`):

- `release-loader.ts` — reads the six-file `./data/` bundle and pipes it through the engine's `loadCatalog`. Fully typed `Catalog` / `CatalogError` result.
- `io.ts` — `HarnessIo` interface + `defaultIo()` / `capturedIo()` implementations. Injected into every entry point so tests capture stdout / stderr / file writes without process-level mutation.
- `seeds.ts` — `generateSeedSet`, `partitionSeeds`, `mergePartitions`, `parseSeedList`. Deterministic; `partitionSeeds(seeds, k, N)` uses `k % N` for stable assignment and `mergePartitions` reconstructs canonical order.
- `report-types.ts` — `BatteryReport`, `AllReport`, `CheckResult`, `SampleSpec`, `REPORT_FORMAT_VERSION = 1`.
- `report-json.ts` — `canonicalJson`, `serializeReport`, `serializeReportIdentity` (excludes `diagnostics`), `reportDigest`.
- `report-human.ts` — deterministic ASCII summary.
- `ai-weights.ts` — release AI coefficients (`AiWeights`).
- `runner.ts` — deterministic five-squad headless match runner over the engine facade. Returns MatchLog + terminal hash + per-round hashes + per-round events. Fold-identity guaranteed against `foldMatchLog`. Default archetype `"long-avenues"` (reliable at release catalog values); callers pass `"any"` or a specific id.
- `determinism.ts` — determinism battery. Checks: `REPLAY_IDENTITY`, `FOLD_IDENTITY`, `PERMUTATION_INVARIANCE` (all 120 permutations of 5 squads via Heap's algorithm), `CROSS_RUNTIME_MATCH` (asserts against caller-supplied hash table; deferred otherwise).
- `playability.ts` — playability battery. Per-archetype check + aggregate `REGEN_TAIL`. Configurable `minAcceptanceRate` (default 0.75); reports acceptance rate + regen p50 / p95 + observed archetype metrics.
- `behavior.ts` — AI behavioral battery. Emits `POOL_DISCIPLINE`, `CALLED_SHOT_RATE`, `POSTURE_RATE`, `NOT_NEAREST`, `NOT_LEADER`, `TRACE_DISCIPLINE`, `TIER_ORDERING`, `COMMANDER_DAMAGE`, `NODE_BUDGET_TRUNCATION`. Several remain information-only at release weights pending further tuning (see `./docs/verification/behavior-baseline.md`).
- `costing.ts` — costing battery. Enumeration count per budget (deterministic iteration cap, no wall-clock), tournament win-distribution per budget, `DOMINANCE_CEILING` (enforced at sample size ≥ 10), `MATCH_LENGTH` (p95 rounds ≤ `MAX_EXPECTED_ROUNDS`), `SNOWBALL_RATE` (information-only). Exposes `wilsonSampleSize`, `enumerateBuildSpace`, `releasePrebuiltForBudget`.
- `cli.ts` — `runCli(argv, io)` and `parseArgs`. Strict flag parsing (unknown flag / non-integer value / partition out-of-range all return nonzero + explanatory stderr text).
- `all.ts` — `runAllBattery` aggregator. Runs every sub-battery, digests each result, returns `AllReport` binding source revision + catalog/tunables hashes + per-child digest. Byte-identical across two runs on equal inputs.

## Internal Structure

| Area | Path |
|---|---|
| CLI shim | `./harness/cli.ts` |
| Support code (typechecked under tsconfig.app.json) | `./tests/harness/support/` |
| Self-tests | `./tests/harness/**` |
| Verification reports | `./docs/verification/**` |

## Conventions and Invariants

- **No renderer / browser dependency.** Node 22 + `tsx` only.
- **Parallel costing partitions work deterministically and merges by stable key.** `partitionSeeds(seeds, k, N)` returns seeds where `index % N === k`; `mergePartitions` reconstructs canonical order byte-for-byte.
- **Every battery prints thresholds, observed values, and pass/fail** in both JSON and human formats.
- **Battery report identity (FR-29):** every report field except `diagnostics` is deterministic. `serializeReportIdentity` strips diagnostics before hashing. `canonicalJson` emits object keys in lexicographic order, arrays as-is, rejects non-finite numbers.
- **No wall-clock in a decision path.** The costing battery's enumeration uses a deterministic iteration cap instead of a `performance.now()` timeout. Cross-runtime hash comparison is caller-supplied, never harvested by the harness.
- **Runner fog-of-war contract:** the runner does NOT persist `updateKnownPositions` between phases — `foldMatchLog` walks the same round pipeline without refreshing `knownPositions`, so terminal hashes match. Fog projections are computed transiently for AI input only.
- **CLI dispatch exit codes:** success → 0; report `passed=false` → 1; unknown battery / flag / integer value → 2; catalog load failure → 3; unexpected error → 4.
- **`./harness/**` typecheck path:** the folder is excluded from `tsconfig.app.json` (composite mode). Real code lives under `./tests/harness/support/` so tsc-app typechecks it; `./harness/cli.ts` is a runtime-only shim executed by tsx.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-06 shipped `./harness/cli.ts` + support under `./tests/harness/support/` with four batteries + `all` aggregator over the engine facade. 55 harness self-tests; determinism / playability / costing pass; behavior emits information-only baselines pending future weight tuning. |
