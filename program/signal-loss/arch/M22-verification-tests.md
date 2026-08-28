# M22 — Verification tests

> **Path:** `./tests/`
> **Imports from:** modules under test
> **Status:** partial. Test subtrees exist for every module shipped through SESSION-03; e2e, harness, and remaining app/board/screen tests remain pending.

## Public API

- Mirrored unit/engine tests, worker tests, app tests, browser flows, accessibility checks, and harness acceptance fixtures.

## Internal Structure

Subtrees present after SESSION-03:

| Area | Path | Status |
|---|---|---|
| Setup | `./tests/setup/` (`route-registry.test.ts`, `eslint-boundary.test.ts`) | shipped in SESSION-01 |
| Engine — Fx | `./tests/engine/fx/` (~65 tests) | shipped in SESSION-01 |
| Engine — RNG | `./tests/engine/rng/` (~27 tests) | shipped in SESSION-01 |
| Engine — Catalog | `./tests/engine/catalog/` (~29 tests) | shipped in SESSION-01 |
| Engine — Build | `./tests/engine/build/` (~38 tests) | shipped in SESSION-01 |
| Engine — Codec | `./tests/engine/codec/` (bitstream, construct, roster) | shipped in SESSION-02 |
| Engine — Map | `./tests/engine/map/` (analysis-grid, gate, generate, generators, measure, spatial-index, trace, types — 112 tests) | shipped in SESSION-03 |
| Platform | `./tests/platform/` (capability, clipboard, collection-repository) | shipped in SESSION-02 |
| App core | `./tests/app/core/` (collection-store, flow-store, navigation-store, preferences-store, shared-components) | shipped in SESSION-02 |
| Fixtures | `./tests/fixtures/catalog/`, `./tests/fixtures/maps/` | shipped in SESSION-01/03 |
| Engine — Match | `./tests/engine/match/` | pending Session 04 |
| Engine — View | `./tests/engine/view/` | pending Session 04 |
| Engine — AI | `./tests/engine/ai/` | pending Session 05 |
| Engine — Facade | `./tests/engine/facade/` | pending Session 05 |
| Workers | `./tests/workers/` | pending Session 05 |
| Harness batteries | `./tests/harness/` | pending Session 06 |
| App build/setup/result | `./tests/app/build/` | pending Session 07 |
| App match | `./tests/app/match/` | pending Session 08 |
| Browser e2e | `./tests/e2e/` | pending Sessions 07 and 08 |

## Conventions and Invariants

- Every session owns only its precise test subtree.
- Determinism assertions compare canonical states and ordered events.
- Browser artifacts go to session-specific `/tmp` paths during concurrent waves.
- Property tests use a small in-test LCG rather than an external fuzzer.
- Programmatic ESLint tests run against `overrideConfigFile: eslint.config.js` so the rules under test are exactly the rules that ship.
- Test fixtures under `./tests/fixtures/` (catalog, maps) are declaredly illustrative — Session 06 authors release balance under `./data/*.json`.
- Session-02 shared-component tests use `renderToStaticMarkup` because the toolchain does not yet include jsdom / testing-library.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-01 shipped `./tests/setup/`, `./tests/engine/fx/`, `./tests/engine/rng/`, `./tests/engine/catalog/`, `./tests/engine/build/`, and the initial `./tests/fixtures/catalog/`. |
| 2026-08-28 | SESSION-02 shipped `./tests/engine/codec/`, `./tests/platform/`, and `./tests/app/core/`. |
| 2026-08-28 | SESSION-03 shipped `./tests/engine/map/` (112 tests including a 100-map × 2-run repeatability probe) and `./tests/fixtures/maps/`. |
