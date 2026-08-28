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
