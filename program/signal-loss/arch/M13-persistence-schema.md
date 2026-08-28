# M13 — Persistence schema

> **Path:** `./src/migrations/`
> **Imports from:** —
> **Status:** planned for full v1

## Public API
- PersistedStateV1 and nested snapshot/preference types
- migration001, createInitialStateV1, and validatePersistedStateV1
- Storage key and schema-version constants

## Internal Structure

| Area | Path |
|---|---|
| Permanent v1 schema | `./src/migrations/001_initial.ts` |

## Conventions and Invariants
- DB owns this path permanently. Mu reads but never writes it.
- Future changes require a new forward migration from DB.
- Migration functions remain pure, synchronous, deterministic, and idempotent.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
