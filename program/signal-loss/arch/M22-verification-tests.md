# M22 — Verification tests

> **Path:** `./tests/`
> **Imports from:** modules under test
> **Status:** partial. Every session shipped and verified its owned test subtree through SESSION-08. Battery `.test.ts` script directories under `./tests/{determinism,playability,behavior,costing}/` remain intentionally empty (real coverage lives under `./tests/harness/**`); build-zone e2e specs were authored in SESSION-07 but remain unrun. A SESSION-07 retry additionally landed unverified composer unit/e2e specs — see Internal Structure. The `match-setup-route` cycle added and verified `./tests/app/core/flow-context.test.tsx` (SESSION-01) and `./tests/app/setup-generation/**` (SESSION-02); its SESSION-03 was blocked and SESSION-04 not launched, so no `match-store` / `match-launch` / setup-screen / setup-e2e specs were added this cycle.

## Public API

- Mirrored unit / engine / worker / app / e2e tests, plus accessibility checks and harness acceptance fixtures.

## Internal Structure

Subtrees present after SESSION-08:

| Area | Path | Status |
|---|---|---|
| Setup | `./tests/setup/` (`route-registry.test.ts`, `eslint-boundary.test.ts`) | SESSION-01 |
| Engine — Fx | `./tests/engine/fx/` (~65 tests) | SESSION-01 |
| Engine — RNG | `./tests/engine/rng/` (~27 tests) | SESSION-01 |
| Engine — Catalog | `./tests/engine/catalog/` (~29 tests) | SESSION-01 |
| Engine — Build | `./tests/engine/build/` (~38 tests) | SESSION-01 |
| Engine — Codec | `./tests/engine/codec/` (bitstream, construct, roster) | SESSION-02 |
| Engine — Map | `./tests/engine/map/` (analysis-grid, gate, generate, generators, measure, spatial-index, trace, types — 112 tests) | SESSION-03 |
| Engine — Match | `./tests/engine/match/` (88 new tests including 120-permutation invariance) | SESSION-04 retry 1 |
| Engine — View | `./tests/engine/view/` (public projection, resolution loss) | SESSION-04 retry 1 |
| Engine — AI | `./tests/engine/ai/` (three tiers, budget, opponent-model smoothing) | SESSION-05 |
| Engine — Facade | `./tests/engine/facade/` | SESSION-05 |
| Workers | `./tests/workers/` (structural-clone round-trip, `MatchState`-not-assignable negative fixture) | SESSION-05 |
| Fixtures — AI | `./tests/fixtures/ai/` | SESSION-05 |
| Harness batteries | `./tests/harness/` (55 self-tests; content / seeds / report / runner / determinism / playability / behavior / costing / all / cli) | SESSION-06 |
| Verification reports | `./docs/verification/` | SESSION-06 |
| Platform | `./tests/platform/` (capability, clipboard, collection-repository) | SESSION-02 |
| App core | `./tests/app/core/` (collection-store, flow-store, navigation-store, preferences-store, shared-components — SESSION-02; `flow-context.test.tsx` — provider/SSR + no-storage structural asserts, `match-setup-route` SESSION-01) | SESSION-02 + `match-setup-route` SESSION-01 |
| App setup-generation | `./tests/app/setup-generation/` (`mapgen-client.test.ts` — 7 tests; `setup-model.test.ts` — 13 tests) | `match-setup-route` SESSION-02 |
| App build (partial) | `./tests/app/build/` (boot, codex, collection-view — verified; `composer.test.tsx` — residual, unverified, authored but never executed against a green build) | SESSION-07 checkpoints 1–2 + retry 1 residual |
| App match | `./tests/app/match/` (57 new tests; store partitioning, drafts-not-on-MatchState structural asserts) | SESSION-08 |
| Browser e2e (partial) | `./tests/e2e/build/*.spec.ts` (authored, unrun — includes residual `composer.spec.ts`); `./tests/e2e/match/` | SESSION-07 / 08 |
| Fixtures | `./tests/fixtures/catalog/`, `./tests/fixtures/maps/`, `./tests/fixtures/matches/` | SESSION-01 / 03 / 04 |

## Conventions and Invariants

- Every session owns only its precise test subtree.
- Determinism assertions compare canonical states and ordered events.
- Browser artifacts go to session-specific `/tmp` paths during concurrent waves.
- Property tests use a small in-test LCG rather than an external fuzzer.
- Programmatic ESLint tests run against `overrideConfigFile: eslint.config.js` so the rules under test are exactly the rules that ship.
- Test fixtures under `./tests/fixtures/` (catalog, maps) are declaredly illustrative — SESSION-06 authored release balance under `./data/*.json`.
- SESSION-02 shared-component tests use `renderToStaticMarkup` because the toolchain does not yet include jsdom / testing-library; SESSION-07 / 08 layer full keyboard / focus tests either via Playwright or by adding jsdom + testing-library to devDependencies.
- The full test suite has a pre-existing subprocess timeout flake in `./tests/setup/eslint-boundary.test.ts` and some `./tests/harness/*.test.ts` runs under parallel load; targeted runs pass.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-01 shipped `./tests/setup/`, `./tests/engine/fx/`, `./tests/engine/rng/`, `./tests/engine/catalog/`, `./tests/engine/build/`, and the initial `./tests/fixtures/catalog/`. |
| 2026-08-28 | SESSION-02 shipped `./tests/engine/codec/`, `./tests/platform/`, and `./tests/app/core/`. |
| 2026-08-28 | SESSION-03 shipped `./tests/engine/map/` (112 tests including a 100-map × 2-run repeatability probe) and `./tests/fixtures/maps/`. |
| 2026-08-28 | SESSION-04 retry 1 shipped `./tests/engine/match/**` and `./tests/engine/view/**` (88 new tests with 120-permutation invariance on movement, attack, `resolveRound`, and `foldMatchLog`). |
| 2026-08-28 | SESSION-05 shipped `./tests/engine/ai/**`, `./tests/engine/facade/**`, `./tests/workers/**`, and `./tests/fixtures/ai/**` (74 new tests including a `MatchState`-not-assignable-to-`PublicState` negative fixture). |
| 2026-08-28 | SESSION-06 shipped `./tests/harness/**` (55 harness self-tests over CLI / four batteries / all-aggregator) and `./docs/verification/**` baselines. |
| 2026-08-28 | SESSION-07 checkpoints 1–2 shipped `./tests/app/build/` (boot / codex / collection-view) and authored (unrun) `./tests/e2e/build/*.spec.ts`. |
| 2026-08-28 | SESSION-08 shipped `./tests/app/match/**` (57 new tests including structural asserts that human drafts never appear on `MatchState`). |
| 2026-08-28 | SESSION-07 retry 1 (targeting checkpoint 3) returned no parseable handoff; residual `ed7b664` added `./tests/app/build/composer.test.tsx` and `./tests/e2e/build/composer.spec.ts` unverified — no run result was reported for this retry. |
| 2026-08-28 | `match-setup-route` SESSION-01 shipped `./tests/app/core/flow-context.test.tsx` (provider/SSR coverage + structural no-storage asserts; part of an 8-test provider/core run). |
| 2026-08-28 | `match-setup-route` SESSION-02 shipped `./tests/app/setup-generation/**` (`mapgen-client.test.ts` 7 tests + `setup-model.test.ts` 13 tests = 20; verified alongside 122 build/core consumer tests). |
