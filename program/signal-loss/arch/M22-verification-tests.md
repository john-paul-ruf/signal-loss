# M22 — Verification tests

> **Path:** `./tests/`
> **Imports from:** modules under test
> **Status:** planned for full v1

## Public API
- Mirrored unit/engine tests, worker tests, app tests, browser flows, accessibility checks, and harness acceptance fixtures

## Internal Structure

| Area | Path |
|---|---|
| Engine | `./tests/engine/` |
| Platform/app | `./tests/platform/, ./tests/app/` |
| Browser | `./tests/e2e/` |
| Harness | `./tests/harness/` |
| Fixtures | `./tests/fixtures/` |

## Conventions and Invariants
- Every session owns only its precise test subtree.
- Determinism assertions compare canonical states and ordered events.
- Browser artifacts go to session-specific /tmp paths during concurrent waves.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-01 -->

## M22 — Verification tests

New subdirectories under `./tests/`:

- `tests/setup/` — bootstrap smoke:
  - `route-registry.test.ts` — pure discovery / normalize / find contracts.
  - `eslint-boundary.test.ts` — programmatic ESLint invocation against
    virtual fixtures verifying every engine boundary rule actually fires.
- `tests/engine/fx/` — scalar, vector, geometry (65 tests).
- `tests/engine/rng/` — pcg32, streams (27 tests).
- `tests/engine/catalog/` — load, canonical (29 tests).
- `tests/engine/build/` — validate, enumerate (38 tests).
- `tests/fixtures/catalog/valid-minimal.ts` — declaredly illustrative,
  not a release balance claim. Session 06 authors `./data/*.json`.

Test discipline in effect:

- Every session owns only its precise test subtree (contract preserved).
- Property tests use a small in-test LCG rather than an external fuzzer.
- Programmatic ESLint tests run against `overrideConfigFile:
  eslint.config.js` so the rules under test are exactly the rules that
  ship.
