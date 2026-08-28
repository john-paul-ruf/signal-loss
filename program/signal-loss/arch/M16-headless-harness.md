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
