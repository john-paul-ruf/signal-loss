# M01 — Toolchain and CI

> **Path:** root configuration files and `./.github/workflows/`
> **Imports from:** —
> **Status:** planned for full v1

## Public API
- npm scripts for typecheck, lint, unit, four batteries, browser tests, and production build
- Vite worker/PWA build configuration
- ESLint architecture and determinism restrictions
- Path-triggered GitHub Actions gates

## Internal Structure

| Area | Path |
|---|---|
| Root configs | `./package.json, ./package-lock.json, ./tsconfig*.json, ./vite.config.ts, ./vitest.config.ts, ./playwright.config.ts, ./eslint.config.js` |
| CI | `./.github/workflows/ci.yml` |

## Conventions and Invariants
- Pin dependency versions with the lockfile.
- CI must run every shipping gate on ./data/** or ./src/engine/** changes.
- Configuration must not require runtime environment variables or network services.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-01 -->

## M01 — Toolchain and CI

Locked npm scripts (must remain in `./package.json` for later sessions):

- `dev`, `build`, `preview`
- `typecheck`
- `lint`
- `test:unit`, `test:determinism`, `test:playability`, `test:behavior`,
  `test:costing`
- `test:e2e`
- `harness`

Battery scripts (`test:determinism`, `test:playability`, `test:behavior`,
`test:costing`) run via `vitest run --dir tests/<battery> --passWithNoTests`
until Session 06 adds their owned tests. `--passWithNoTests` is documented
Vitest behavior — it prints "No test files found" rather than fabricating a
pass count.

ESLint config enforces (via `./eslint.config.js`):

- Engine forbidden primitives (`no-restricted-properties`): every
  implementation-defined Math primitive, `Date.now`, `performance.now`, and
  `Number.toLocaleString`. `Math.sqrt` remains permitted for `isqrt`'s
  seed.
- Engine forbidden globals: `Date` (blocks `new Date()`).
- Engine zero-dep boundary (`no-restricted-imports`): explicit deny list of
  every npm package currently in `./package.json`. Later sessions must add
  new npm deps to this list.
- Engine path boundary (`import/no-restricted-paths`): engine cannot import
  from `./src/app`, `./src/platform`, `./src/workers`, `./src/migrations`.
- Match/map/AI paths ban float literals (`raw=/^-?[0-9]+\.[0-9]+$/`).
- Repo-wide: `dangerouslySetInnerHTML` banned via `no-restricted-syntax`
  and `react/no-danger`.
- Explicit sort comparators required in the engine (bare `.sort()` /
  `.toSorted()` calls fire an error).

