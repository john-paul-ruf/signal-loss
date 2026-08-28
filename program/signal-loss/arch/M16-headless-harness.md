# M16 — Headless harness

> **Path:** `./harness/`
> **Imports from:** M12
> **Status:** planned for full v1

## Public API
- sl <battery> [--seeds N] [--json] [--output path]
- Determinism, playability, behavior, and costing battery runners
- Machine-readable and human-readable report formatters

## Internal Structure

| Area | Path |
|---|---|
| CLI | `./harness/cli.ts` |
| Determinism | `./harness/determinism.ts` |
| Playability | `./harness/playability.ts` |
| Behavior | `./harness/behavior.ts` |
| Costing | `./harness/costing.ts` |
| Reports | `./harness/report/` |

## Conventions and Invariants
- No renderer or browser dependency.
- Parallel costing partitions work deterministically and merges by stable key.
- Every battery prints thresholds, observed values, and pass/fail.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-06 -->

## SESSION-06 arch delta — release content, headless batteries, and CI

### M16 (harness/) — headless harness shipped

Executable entry point at `./harness/cli.ts` — thin bin wrapper that reads argv, calls `runCli`, and exits with the returned code. The `harness/**` folder is excluded from tsconfig.app.json (composite mode); actual harness logic lives under `./tests/harness/support/` where tsconfig-app picks it up for typechecking.

Public surface (`./tests/harness/support/`):

- `release-loader.ts` — reads the six-file `./data/` bundle and pipes it through the engine's `loadCatalog`. Fully typed `Catalog` / `CatalogError` result.
- `io.ts` — `HarnessIo` interface + `defaultIo()` / `capturedIo()` implementations. Injected into every entry point so tests can capture stdout/stderr/file writes without process-level mutation.
- `seeds.ts` — `generateSeedSet`, `partitionSeeds`, `mergePartitions`, `parseSeedList`. Deterministic; `partitionSeeds(seeds, k, N)` uses `k % N` for stable assignment and `mergePartitions` reconstructs canonical order.
- `report-types.ts` — `BatteryReport`, `AllReport`, `CheckResult`, `SampleSpec`, `REPORT_FORMAT_VERSION = 1`.
- `report-json.ts` — `canonicalJson`, `serializeReport`, `serializeReportIdentity` (excludes `diagnostics`), `reportDigest`.
- `report-human.ts` — deterministic ASCII summary.
- `ai-weights.ts` — release AI coefficients (`AiWeights`).
- `runner.ts` — deterministic five-squad headless match runner over the engine facade. Returns MatchLog + terminal hash + per-round hashes + per-round events. Fold-identity guaranteed against `foldMatchLog`. Default archetype "long-avenues" (reliable at release catalog values); callers pass "any" or a specific id.
- `determinism.ts` — determinism battery. Checks: REPLAY_IDENTITY, FOLD_IDENTITY, PERMUTATION_INVARIANCE (all 120 permutations of 5 squads via Heap's algorithm), CROSS_RUNTIME_MATCH (asserts against caller-supplied hash table; deferred otherwise).
- `playability.ts` — playability battery. Per-archetype check + aggregate REGEN_TAIL. Configurable `minAcceptanceRate` (default 0.75); reports acceptance rate + regen p50/p95 + observed archetype metrics.
- `behavior.ts` — AI behavioral battery. Emits POOL_DISCIPLINE, CALLED_SHOT_RATE, POSTURE_RATE, NOT_NEAREST, NOT_LEADER, TRACE_DISCIPLINE, TIER_ORDERING, COMMANDER_DAMAGE, NODE_BUDGET_TRUNCATION. Session 06 release leaves several as information-only pending further weight tuning (see docs/verification/behavior-baseline.md).
- `costing.ts` — costing battery. Enumeration count per budget (deterministic iteration cap, no wall-clock), tournament win-distribution per budget, DOMINANCE_CEILING (enforced at sample size ≥ 10), MATCH_LENGTH (p95 rounds ≤ `MAX_EXPECTED_ROUNDS`), SNOWBALL_RATE (information-only). Exposes `wilsonSampleSize`, `enumerateBuildSpace`, `releasePrebuiltForBudget`.
- `cli.ts` — `runCli(argv, io)` and `parseArgs`. Strict flag parsing (unknown flag / non-integer value / partition out-of-range all return nonzero + explanatory stderr text). Supported flags: `--seeds`, `--seed`, `--explicit-seeds`, `--budget`, `--ai-tier`, `--json`, `--output`, `--partitions`, `--partition`, `--node-budget`, `--max-rounds`, `--source-revision`.
- `all.ts` — `runAllBattery` aggregator. Runs every sub-battery, digests each result, returns `AllReport` binding source revision + catalog/tunables hashes + per-child digest. Byte-identical across two runs on equal inputs.

Self-tests under `./tests/harness/` — 55 harness tests total (content, seeds, report, runner, determinism, playability, behavior, costing, all, cli). Every test deterministic; no wall-clock reads in a rule-affecting path.


### Conventions and invariants (session-shipped decisions)

- **Battery report identity (FR-29):** every report field except `diagnostics` is deterministic. `serializeReportIdentity` strips diagnostics before hashing. `canonicalJson` emits object keys in lexicographic order, arrays as-is, rejects non-finite numbers.
- **No wall-clock in a decision path:** the costing battery's enumeration uses a deterministic iteration cap instead of a `performance.now()` timeout. Cross-runtime hash comparison is caller-supplied, never harvested by the harness.
- **Partition determinism:** `partitionSeeds(seeds, k, N)` returns seeds where `index % N === k`; `mergePartitions` reconstructs the canonical order byte-for-byte.
- **Runner fog-of-war contract:** the runner does NOT persist `updateKnownPositions` between phases — foldMatchLog walks the same round pipeline without refreshing knownPositions, so terminal hashes match. Fog projections are computed transiently for AI input only.
- **CLI dispatch:** unknown battery / flag / integer value → exit code 2; catalog load failure → exit code 3; unexpected error → exit code 4; report `passed=false` → exit code 1; success → exit code 0.
- **`harness/**` typecheck path:** the folder is excluded from tsconfig.app.json (composite mode). Real code lives under `./tests/harness/support/` so tsc-app typechecks it; `./harness/cli.ts` is a runtime-only shim executed by tsx.
