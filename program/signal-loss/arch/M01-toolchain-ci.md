# M01 — Toolchain and CI

> **Path:** `root configuration and ./\.github/workflows/`
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
