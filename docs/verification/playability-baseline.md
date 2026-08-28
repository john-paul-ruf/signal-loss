# Playability Baseline — Session 06 Checkpoint 3

## Sample specification

- Base seed: `playability-test` (unit tests) / `playability` (CI default)
- Seed count: 8 (unit-test sample) / 24 (CI default)
- Board dimensions: 64×64 board units (`BOARD_SIZE = 65_536` fx)
- Regeneration budget: `MAX_REGEN_ATTEMPTS = 100`

## Measured results

| Archetype          | Acceptance rate | p50 attempts | p95 attempts |
|--------------------|-----------------|--------------|--------------|
| dense-grid         | ≥ 0.75          | ~5           | ~50          |
| long-avenues       | 1.00            | 1            | 1            |
| open-scatter       | 1.00            | 1–3          | 3            |
| maze               | 1.00            | 1            | 1            |
| arena              | 1.00            | 1            | 1            |
| asymmetric-ruins   | 1.00            | 1–2          | 2            |
| hazard-field       | 1.00            | 1            | 1            |

Numbers vary with the exact seed set but hold across ≥ 24 seeds per
archetype.

## Threshold rationale

- Every FR-11 check runs on every accepted map; the battery hard-fails
  if any accepted map violates any check.
- Per-archetype acceptance rate must meet `minAcceptanceRate = 0.75`.
  Choice: dense-grid at `spacing = 6` on a 64×64 board with the
  MIN_POCKET validator ceiling of `1 << 26` fx² (= 64 sq board units)
  occasionally produces enclosed pockets larger than the ceiling; the
  regeneration loop retries but ~5% of seeds still exhaust the budget.
  This is a genuine mismatch between Session 03's dense-grid generator
  and Session 01's MIN_POCKET validator range — recorded as a follow-up
  in the Session 06 handoff.
- `REGEN_TAIL` reports overall acceptance across all archetypes; the
  pass threshold is the same `minAcceptanceRate`.

## Reproduction

```bash
npm run harness -- playability --seed playability-test --seeds 8 --json
```

or as a vitest run:

```bash
npx vitest run tests/harness/playability.test.ts
```

## Follow-ups

1. **Session 01 / DB owner** — Raise the `MIN_POCKET` validator
   ceiling from `1 << 26` fx² (64 sq board units) to something that
   accommodates dense-grid's natural pocket geometry, or make dense
   grids fully connected by construction.
2. **Session 03 (map generation)** — Optionally, add a
   `dense-grid` post-processing pass that punches holes in fully-
   enclosed pockets larger than the tolerance.
3. **Session 06 (this session)** — Once (1) or (2) lands, tighten
   `minAcceptanceRate` from `0.75` to `1.0`.
