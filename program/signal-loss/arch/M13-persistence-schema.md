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

<!-- SESSION-02 -->

## M13 — Persistence schema

**Consumer note (not a schema change):** Session 02 imports migration values
through `./src/platform/storage/migration-runtime.ts`, which uses a dynamic
`import()` specifier. This is the workaround for a Session-01 × DB
coordination issue documented in the SESSION-02 handoff — DB is asked to
issue a follow-up that rewrites `./src/migrations/001_initial.ts`'s internal
validator to use bracket-notation on `Record<string, unknown>`, so
`tsconfig.app.json`'s `noPropertyAccessFromIndexSignature: true` (Session 01)
stops rejecting the file when it is statically imported. Types are declared
via ambient module `signal-loss/db/migration-v1` in
`./src/platform/storage/migration-shim.d.ts` and mirror the DB contract
exactly; DB remains the single source of truth for the schema types.

No schema change is proposed by this session.

