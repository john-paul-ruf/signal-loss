# M13 — Persistence schema

> **Path:** `./src/migrations/`
> **Imports from:** —
> **Status:** DB-owned; file byte-identical to Genesis. No Mu session has authored under this path.

## Public API

- `PersistedStateV1` and nested snapshot/preference types
- `migration001`, `createInitialStateV1`, and `validatePersistedStateV1`
- Storage key and schema-version constants

## Internal Structure

| Area | Path |
|---|---|
| Permanent v1 schema | `./src/migrations/001_initial.ts` |

## Conventions and Invariants

- DB owns this path permanently. Mu reads but never writes it.
- Future changes require a new forward migration from DB.
- Migration functions remain pure, synchronous, deterministic, and idempotent.

## Consumer Notes

**Session 02 consumer shim:** `./src/platform/storage/migration-runtime.ts` imports migration values through a dynamic `import()` specifier, and ambient types are declared under `./src/platform/storage/migration-shim.d.ts` (module id `signal-loss/db/migration-v1`) mirroring the DB contract exactly. This is a WORKAROUND for a Session-01 × DB coordination issue: DB is asked to issue a follow-up that rewrites `./src/migrations/001_initial.ts`'s internal validator to use bracket-notation on `Record<string, unknown>` so that `tsconfig.app.json`'s `noPropertyAccessFromIndexSignature: true` (Session 01) stops rejecting the file under static import. Until DB reissues, any consumer needing to statically import the migration must use the shim. DB remains the single source of truth for schema types; no schema change is proposed by Session 02.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; DB delivered `./src/migrations/001_initial.ts`. |
| 2026-08-28 | SESSION-02 added a platform-owned dynamic-import runtime shim to work around the strict-index-signature × static-import conflict; migration file byte-identical. |
