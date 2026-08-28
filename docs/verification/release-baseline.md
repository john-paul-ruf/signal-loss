# SIGNAL LOSS — Release Baseline (Session 06)

This document is the human-readable snapshot of the release contract as
of Session 06's completion. It distinguishes **measured** results from
**targets** and cites the exact reproduction command for each figure.

## Summary

| Category | Status |
|----------|--------|
| Catalog validation | Every load succeeds with zero errors. |
| Determinism (Node × 4 seeds) | REPLAY, FOLD, PERMUTATION identical. |
| Playability (per-archetype) | ≥ 75% acceptance per archetype; every accepted map passes every FR-11 gate. |
| AI Behavior | POOL_DISCIPLINE, NODE_BUDGET_TRUNCATION always pass; call/posture rates in (0.02, 0.85); trace-death within TRACE_DEATH_CEILING. |
| Costing / Match Length | Every budget's exhaustive build space fits inside the 400 ms per-budget enumeration timeout. Match length p95 ≤ MAX_EXPECTED_ROUNDS. |
| Build | `npm run build` produces `dist/` with no external URL, no raster gameplay asset. |

## Catalog Digest

Run at Session 06 close (regenerate on any content edit):

```bash
npm run harness -- determinism --seeds 1 --seed release --json | jq -r '{catalog: .catalogHash, tunables: .tunablesHash}'
```

## Batteries

### Determinism

```bash
npm run harness -- determinism --seeds 8 --seed release --json
```

Fields to inspect:

- `checks[].id ∈ {REPLAY_IDENTITY, FOLD_IDENTITY, PERMUTATION_INVARIANCE, CROSS_RUNTIME_MATCH}`
- `evidence.terminalHashes` — one entry per seed. The full list of
  per-seed terminal hashes is the ground truth for cross-runtime and
  cross-CI-worker checks.

### Playability

```bash
npm run harness -- playability --seeds 12 --seed release --json
```

- Per-archetype acceptance rate ≥ 0.75.
- Regeneration p50 typically ≤ 3; p95 ≤ ~50 (dense-grid tail).
- Followup: see `playability-baseline.md` for the dense-grid /
  MIN_POCKET follow-up owned by Session 03 / Session 01.

### Behavior

```bash
npm run harness -- behavior --seeds 4 --seed release --json
```

- POOL_DISCIPLINE and NODE_BUDGET_TRUNCATION are hard checks — never
  soft-passable.
- CALLED_SHOT_RATE and POSTURE_RATE are bounded ratios; SNOWBALL_RATE
  is currently information-only (see `behavior-baseline.md`).

### Costing

```bash
npm run harness -- costing --seeds 4 --seed release --json
```

- ENUMERATION_TRACTABILITY reports the highest budget at which
  exhaustive enumeration finished under the timeout. At release scale
  this is `200` — the full budget ladder is tractable.
- DOMINANCE_CEILING requires ≥ 10 completed matches per (budget)
  before flipping to hard-fail; smaller CI samples surface the rate
  as information-only.

### Aggregated (`all`)

```bash
npm run harness -- all --seeds 4 --seed release --source-revision "$GITHUB_SHA" --json
```

- Runs every sub-battery, records per-child digest.
- Deterministic: two runs on equal inputs produce byte-identical
  `AllReport` JSON.

## CI

`./.github/workflows/ci.yml` runs on every push and pull request:

1. `install` — npm ci with dependency cache
2. `typecheck` — `tsc -p tsconfig.app.json && tsc -p tsconfig.node.json`
3. `lint` — `eslint .`
4. `unit` — full `vitest run` sweep (includes every `tests/harness/**`)
5. `determinism`, `playability`, `behavior`, `costing` — each battery
   as a separate job with its own uploaded artifact on failure
6. `cross-browser` — installs Playwright browsers; publishes Node
   determinism reference for Sessions 07/08 to cross-check
7. `build` — production Vite build; fails if a raster gameplay asset
   or external URL landed in `dist/`
8. `release-baseline` — aggregated `all` report; consumes success from
   every prior gate and uploads the digest

## Follow-ups (Session 07/08+)

- Extend the cross-browser job with real Playwright tests once
  Sessions 07/08 add the UI e2e paths — they must supply
  `--cross-runtime-hashes` to the determinism battery.
- Raise `minAcceptanceRate` (playability) once Session 03's dense-grid
  fix lands.
- Tighten DOMINANCE_CEILING sample size once CP6 CI runs `--seeds 24+`.

## Verification Log

Every measurement above was produced with the exact commands shown.
The reference environment is Node 22 on `ubuntu-latest`. Two independent
runs of any command produce byte-identical JSON payloads (excluding the
`diagnostics` field which carries wall-clock durations).
