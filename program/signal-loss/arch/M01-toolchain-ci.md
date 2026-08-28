# M01 — Toolchain and CI

> **Path:** root configuration files and `./.github/workflows/`
> **Imports from:** —
> **Status:** root configs + ESLint boundary shipped in SESSION-01; blocking CI + release baseline shipped in SESSION-06.

## Public API

Locked npm scripts (present in `./package.json`; later sessions must not rename them):

- `dev`, `build`, `preview`
- `typecheck`
- `lint`
- `test:unit`, `test:determinism`, `test:playability`, `test:behavior`, `test:costing`
- `test:e2e`
- `harness`

Additional public surfaces:

- Vite worker / PWA build configuration.
- ESLint architecture and determinism restrictions.
- Path-triggered GitHub Actions gates at `./.github/workflows/ci.yml`.

## Internal Structure

| Area | Path |
|---|---|
| Root configs | `./package.json`, `./package-lock.json`, `./tsconfig*.json`, `./vite.config.ts`, `./vitest.config.ts`, `./playwright.config.ts`, `./eslint.config.js` |
| CI | `./.github/workflows/ci.yml` |

## Conventions and Invariants

- Pin dependency versions with the lockfile.
- CI runs every shipping gate on `./data/**` or `./src/engine/**` changes.
- Configuration must not require runtime environment variables or network services.
- ESLint `./eslint.config.js` enforces (SESSION-01):
  - **Engine forbidden primitives** (`no-restricted-properties`): every implementation-defined `Math` primitive, `Date.now`, `performance.now`, `Number.toLocaleString`. `Math.sqrt` remains permitted for `isqrt`'s seed.
  - **Engine forbidden globals**: `Date` (blocks `new Date()`).
  - **Engine zero-dep boundary** (`no-restricted-imports`): explicit deny list of every npm package currently in `./package.json`. Later sessions must add new npm deps to this list.
  - **Engine path boundary** (`import/no-restricted-paths`): engine cannot import from `./src/app`, `./src/platform`, `./src/workers`, `./src/migrations`.
  - **Match / map / AI paths** ban float literals (`raw=/^-?[0-9]+\.[0-9]+$/`).
  - **Repo-wide**: `dangerouslySetInnerHTML` banned via `no-restricted-syntax` and `react/no-danger`.
  - **Engine sort discipline**: explicit comparators required; bare `.sort()` / `.toSorted()` calls fire an error.

## CI Jobs (as shipped)

`./.github/workflows/ci.yml` runs nine jobs in dependency order: install → typecheck / lint / unit / determinism / playability / behavior / costing / cross-browser / build → release-baseline. Every battery uploads its JSON report as an artifact. The `build` job asserts no raster gameplay asset and no external URL landed in `dist/`. The `release-baseline` job runs `harness -- all --source-revision $GITHUB_SHA` and uploads the aggregated report. The `cross-browser` job installs Playwright browsers and produces a Node-side determinism reference; Session 07/08 will feed browser-side hashes into the same battery via `--cross-runtime-hashes` once they add their tests.

## Known Gaps

- Battery scripts (`test:determinism`, `test:playability`, `test:behavior`, `test:costing`) currently run via `vitest run --dir tests/<battery> --passWithNoTests` and print "No test files found" because their target directories are empty. The real battery integration tests execute under `./tests/harness/**` through the unit suite and the harness CLI. The `--passWithNoTests` flag should be removed from the battery scripts SESSION-06 owns as tests are added to those directories.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-01 shipped root configs, locked npm scripts, and the ESLint engine-boundary / determinism rule set. `./.github/workflows/ci.yml` deferred. |
| 2026-08-28 | SESSION-06 shipped `./.github/workflows/ci.yml` — nine-job blocking CI with battery-report artifacts, `dist/` asset audit, and a release-baseline aggregator job binding source revision + catalog / tunables hashes. |
