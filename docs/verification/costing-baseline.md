# Costing Baseline — Session 06 Checkpoint 5

## Sample specification

- Base seed: `costing` (CI default)
- Budgets: full BUDGETS ladder (`25, 50, 75, 100, 125, 150, 175, 200`)
- Enumeration timeout: 400 ms per budget (soft-cap; above this the
  battery reports the partial count with `timedOut=true` and switches
  to tournament sampling for that budget)
- AI Tier: 2 (mid-tier, deterministic per seed)
- Tournament runner: `runMatch` per seed × budget

## Checks

| Check | Threshold | Behaviour |
|-------|-----------|-----------|
| ENUMERATION_TRACTABILITY | information-only | Reports the largest budget at which exhaustive enumeration completed inside the timeout. |
| DOMINANCE_CEILING | top-winner rate ≤ `DOMINANCE_CEILING` (0.60), enforced only at sample size ≥ 10 completed matches | Prevents statistical noise at small sample sizes from flagging false positives. |
| MATCH_LENGTH | p95 rounds ≤ `MAX_EXPECTED_ROUNDS` (24), completed rate ≥ 0.5 | Ensures matches finish inside the expected round budget. |
| SNOWBALL_RATE | information-only | Reports the fraction of completed matches where the winner was also the damage leader at match end. |

## Enumeration Threshold

At the current release catalog scale (7 chassis, 11 mounts, 4
commanders), exhaustive enumeration of every legal single-construct
build completes well inside the 400 ms timeout for every budget. The
tractable ceiling is thus `200` — the full budget ladder. Above the
architecture's ~1e7 working estimate, the battery is designed to
switch to `wilsonSampleSize`-derived tournament sampling; the current
release catalog is small enough that this path is not exercised by CI.

## Threshold Rationale

- `DOMINANCE_MIN_SAMPLE = 10` avoids the small-sample false-positive
  where a two-match sweep by the same squad would flag every seed as
  "dominant" — a purely combinatorial artefact.
- `wilsonSampleSize` returns the sample count required to bound the
  95% Wilson interval width to `epsilon`. Reserved for CP6's larger
  CI sample; the unit-test sample is intentionally small.

## Reproduction

```bash
npm run harness -- costing --seed costing --seeds 24 --json
```

## Follow-ups

1. **Session 06 CI (checkpoint 6)** — run the costing battery with a
   larger seed sample so DOMINANCE_CEILING becomes a hard check
   rather than an information-only one.
2. **Session 05 / AI** — the runner's "snowball" proxy uses damage
   leadership at match end. A future battery iteration could snapshot
   per-round construct counts to compute the exact FR-31 snowball
   condition.
