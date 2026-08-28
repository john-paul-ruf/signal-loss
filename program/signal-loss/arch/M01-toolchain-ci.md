# M01 — Toolchain and CI

> **Path:** root configuration files and `./.github/workflows/`
> **Imports from:** —
> **Status:** root configs and ESLint boundary shipped in SESSION-01; battery test bodies and `./.github/workflows/ci.yml` pending Session 06.

## Public API

Locked npm scripts (present in `./package.json`; later sessions must not rename them):

- `dev`, `build`, `preview`
- `typecheck`
- `lint`
- `test:unit`, `test:determinism`, `test:playability`, `test:behavior`, `test:costing`
- `test:e2e`
- `harness`

Battery scripts (`test:determinism`, `test:playability`, `test:behavior`, `test:costing`) currently run via `vitest run --dir tests/<battery> --passWithNoTests` and print "No test files found" until Session 06 authors their owned tests and removes the flag from the batteries it owns.

Additional public surfaces:

- Vite worker / PWA build configuration.
- ESLint architecture and determinism restrictions.
- Path-triggered GitHub Actions gates (planned for Session 06).

## Internal Structure

| Area | Path |
|---|---|
| Root configs | `./package.json`, `./package-lock.json`, `./tsconfig*.json`, `./vite.config.ts`, `./vitest.config.ts`, `./playwright.config.ts`, `./eslint.config.js` |
| CI | `./.github/workflows/ci.yml` (not yet created) |

## Conventions and Invariants

- Pin dependency versions with the lockfile.
- CI must run every shipping gate on `./data/**` or `./src/engine/**` changes.
- Configuration must not require runtime environment variables or network services.
- ESLint `./eslint.config.js` enforces (added in SESSION-01):
  - **Engine forbidden primitives** (`no-restricted-properties`): every implementation-defined Math primitive, `Date.now`, `performance.now`, `Number.toLocaleString`. `Math.sqrt` remains permitted for `isqrt`'s seed.
  - **Engine forbidden globals**: `Date` (blocks `new Date()`).
  - **Engine zero-dep boundary** (`no-restricted-imports`): explicit deny list of every npm package currently in `./package.json`. Later sessions must add new npm deps to this list.
  - **Engine path boundary** (`import/no-restricted-paths`): engine cannot import from `./src/app`, `./src/platform`, `./src/workers`, `./src/migrations`.
  - **Match/map/AI paths** ban float literals (`raw=/^-?[0-9]+\.[0-9]+$/`).
  - **Repo-wide**: `dangerouslySetInnerHTML` banned via `no-restricted-syntax` and `react/no-danger`.
  - **Engine sort discipline**: explicit comparators required; bare `.sort()` / `.toSorted()` calls fire an error.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-01 shipped root configs, locked npm scripts, and the ESLint engine-boundary/determinism rule set. `./.github/workflows/ci.yml` deferred to Session 06. |
