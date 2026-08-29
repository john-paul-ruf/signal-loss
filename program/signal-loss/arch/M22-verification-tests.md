# M22 — Verification tests

> **Path:** `./tests/`
> **Imports from:** modules under test
> **Status:** partial. Every session shipped and verified its owned test subtree through SESSION-08. Battery `.test.ts` script directories under `./tests/{determinism,playability,behavior,costing}/` remain intentionally empty (real coverage lives under `./tests/harness/**`); build-zone e2e specs were authored in SESSION-07 but remain unrun. A SESSION-07 retry additionally landed unverified composer unit/e2e specs — see Internal Structure. `match-setup-route` added and verified provider, setup-generation, launch-consumption, setup-screen, and setup-browser coverage across its completed four sessions.

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
| App core | `./tests/app/core/` (collection-store, flow-store, navigation-store, preferences-store, shared-components — SESSION-02; `flow-context.test.tsx` — provider/SSR + no-storage structural asserts, `match-setup-route` SESSION-01; `flow-store.test.ts` — complete-launch contract, `match-setup-route` SESSION-03) | SESSION-02 + `match-setup-route` SESSION-01/03 |
| App setup-generation | `./tests/app/setup-generation/` (`mapgen-client.test.ts` — 7 tests; `setup-model.test.ts` — 13 tests) | `match-setup-route` SESSION-02 |
| App build (partial) | `./tests/app/build/` (boot, codex, collection-view — verified; `composer.test.tsx` — residual, unverified, authored but never executed against a green build) | SESSION-07 checkpoints 1–2 + retry 1 residual |
| App match | `./tests/app/match/` (57 SESSION-08 tests plus `match-store.test.ts` and `match-launch.test.tsx` launch-consumption coverage from `match-setup-route` SESSION-03; `deployment-mode.test.tsx` deployment-contract coverage from `fix-deployment-placement` SESSION-01; `fix-match-start` SESSION-01 added `ai-deployment.test.ts` / `command-bar.test.tsx` / `match-start.test.ts` and SESSION-02 added `deployment-placement.test.ts`, also extending `deployment-mode.test.tsx`) | SESSION-08 + `match-setup-route` SESSION-03 + `fix-deployment-placement` SESSION-01 + `fix-match-start` SESSION-01/02 |
| App setup screen | `./tests/app/setup-screen/setup-screen.test.tsx` (route, generation, reveal/deploy guards) | `match-setup-route` SESSION-04 |
| Browser e2e (partial) | `./tests/e2e/build/*.spec.ts` (authored, unrun — includes residual `composer.spec.ts`); `./tests/e2e/match/` (incl. `deployment-placement.spec.ts` — `fix-deployment-placement` SESSION-01, extended by `fix-match-start` SESSION-01 to the real five-squad deployment→movement flow, run in Chromium/Firefox/WebKit); `./tests/e2e/setup/match-setup.spec.ts` (direct route) | SESSION-07 / 08 + `match-setup-route` SESSION-04 + `fix-deployment-placement` SESSION-01 |
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
| 2026-08-28 | `match-setup-route` SESSION-03 retry shipped `./tests/app/core/flow-store.test.ts` and `./tests/app/match/{match-store.test.ts,match-launch.test.tsx}` for the complete launch contract, exact five-roster boot, one-time match consumption, result snapshot, and missing-launch recovery. Verified: 62 targeted core/match tests, typecheck, lint, build. |
| 2026-08-28 | `match-setup-route` SESSION-04 shipped `./tests/app/setup-screen/setup-screen.test.tsx` (3 tests) and `./tests/e2e/setup/match-setup.spec.ts`; the direct `#/setup` regression passed in Chromium, Firefox, and WebKit, alongside typecheck, lint, and build. |
| 2026-08-28 | `fix-deployment-placement` SESSION-01 shipped `./tests/app/match/deployment-mode.test.tsx` (static deployment contract: instruction/count, staged coordinate + unplace, selected/active semantics, and the command-bar disabled/enabled gate — part of the 40-pass focused Vitest run) and `./tests/e2e/match/deployment-placement.spec.ts` (setup→deployment placement, invalid-center `OUT OF SPAWN REGION`, and commit-gating regression; 3 pass across Chromium/Firefox/WebKit; seed `8592953eb8ce193f7fcdc987660b5fab`). |
| 2026-08-29 | `fix-match-start` SESSION-01 added `./tests/app/match/{ai-deployment.test.ts,command-bar.test.tsx,match-start.test.ts}` (per-squad coordinator, store all-`READY_DEPLOY` gate, UI readiness gate — part of a 55-pass focused run) and extended `./tests/e2e/match/deployment-placement.spec.ts` to the real five-squad deployment→`MOVEMENT_PLOT` flow across Chromium/Firefox/WebKit. |
| 2026-08-29 | `fix-match-start` SESSION-02 added `./tests/app/match/deployment-placement.test.ts` and extended `deployment-mode.test.tsx` for engine-backed footprint-overlap rejection (10-pass focused run). |
