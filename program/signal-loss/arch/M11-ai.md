# M11 — AI

> **Path:** `./src/engine/ai/`
> **Imports from:** M03, M04, M06, M08, M10
> **Status:** planned for full v1

## Public API
- generateAiRoster, aiDeploy, aiMovePlot, and aiAttackPlot
- Tiered policies bounded by deterministic node counts
- Derived-stat evaluator and per-opponent posture-frequency model

## Internal Structure

| Area | Path |
|---|---|
| Legal candidates | `./src/engine/ai/candidates.ts` |
| Evaluation | `./src/engine/ai/evaluate.ts` |
| Opponent model | `./src/engine/ai/model.ts` |
| Search | `./src/engine/ai/search.ts` |
| Policies | `./src/engine/ai/policy.ts` |

## Conventions and Invariants
- PublicState is the only world input.
- Tiers differ only in search and modelling quality, never rules or information.
- End every tie with seeded stream plus stable ID, never execution time.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
