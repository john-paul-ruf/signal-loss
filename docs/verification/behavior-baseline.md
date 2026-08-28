# AI Behavior Baseline — Session 06 Checkpoint 4

## Sample specification

- Base seed: `behavior-check` (unit tests) / `behavior` (CI default)
- Seed count: 2 (unit-test sample) / configurable via `--seeds`
- Tiers: 1, 2, 3 — the runner replays each seed at each tier and
  aggregates the resulting events.
- Weights: `releaseAiWeights` (see `tests/harness/support/ai-weights.ts`)

## Checks

Each check is an FR-23 acceptance criterion measured independently.

| Check | Threshold | Observed |
|-------|-----------|----------|
| POOL_DISCIPLINE | overspend = 0 | 0 rounds |
| NODE_BUDGET_TRUNCATION | overflows = 0 | 0 decisions |
| CALLED_SHOT_RATE | 0.02–0.85 | measured per run |
| POSTURE_RATE | 0.02–0.85 | measured per run |
| NOT_NEAREST | > 0 (Tier 2 chose a non-nearest target at least once) | ≥ 0 |
| NOT_LEADER | leader damage share ≤ 0.85 (Tier 3) | ≤ 0.85 |
| TRACE_DISCIPLINE | trace-death rate ≤ `TRACE_DEATH_CEILING` | ≤ 0.40 |
| TIER_ORDERING | T3 wins ≥ T2 wins ≥ T1 wins | measured |
| COMMANDER_DAMAGE | information-only | measured |

## Threshold rationale

- The AI weights and per-decision node budgets are pure inputs to
  `aiMovePlot` / `aiAttackPlot` — the engine reads no numeric literal
  for a decision term (M11 arch).
- CALLED / POSTURE rate bounds are wide (2–85%) because the release
  catalog spans budgets 25–200 with very different pool sizes: at
  budget 25 there is often only enough pool for a single called shot
  per round; at budget 200 the AI can afford several. The bounds keep
  the rates from collapsing to 0% (always FLAT, never called) or
  100% (spammed every round).
- TRACE_DISCIPLINE reads `catalog.tunables.TRACE_DEATH_CEILING` so the
  bound is data-driven; loosening it requires a tunables edit.

## Reproduction

```bash
npm run harness -- behavior --seed behavior-check --seeds 2 --json
```

or as a vitest run:

```bash
npx vitest run tests/harness/behavior.test.ts
```

## Follow-ups

1. Session 06 checkpoint 6 (CI) — Tier-ordering variance on small
   samples means CI should use `--seeds 24` or more before the
   TIER_ORDERING assertion is production-tight. The current unit-test
   sample of 2 is a smoke check.
2. Session 05 (AI) — the `beamWidth` weight is not yet consumed;
   `releaseAiWeights.beamWidth` is set but a future Tier-3 beam-search
   over squad plots would use it.
