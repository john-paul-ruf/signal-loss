/**
 * WORKAROUND for a Session-01 × DB coordination issue:
 *
 * `tsconfig.app.json` (Session-01 lease) enables
 * `noPropertyAccessFromIndexSignature`. The DB-owned
 * `./src/migrations/001_initial.ts` dot-accesses `Record<string, unknown>`
 * in its internal validator (line 225 onward), which the flag rejects with
 * ~35 TS4111 errors when any Session-02 file transitively imports the
 * migration.
 *
 * SESSION-02 cannot write to `./src/migrations/**` (permanently DB-owned per
 * Custom Rule 1) or to `./tsconfig.app.json` (Session-01 lease). The clean
 * fix belongs at one of those two seams; see the SESSION-02 handoff notes
 * for a follow-up ticket.
 *
 * As a strictly-local workaround, this `.d.ts` re-declares the migration
 * module through a repo-scoped module specifier. Callers import from that
 * specifier via `./migration-runtime.ts`, which uses a dynamic import so
 * TypeScript does not typecheck the migration source.
 */

declare module "signal-loss/db/migration-v1" {
  export const STORAGE_KEY: "signal-loss:state";
  export const STORAGE_SCHEMA_VERSION: 1;

  export type ReducedMotionPreferenceV1 = "system" | "reduced" | "full";

  export interface MountAssignmentV1 {
    hardpointIndex: number;
    mountCode: number;
  }

  export interface ConstructSnapshotV1 {
    chassisCode: number;
    commanderCode: number | null;
    mounts: MountAssignmentV1[];
  }

  export type SavedConstructIdV1 = `construct:${number}`;
  export type SavedRosterIdV1 = `roster:${number}`;
  export type PersistedEntityIdV1 = SavedConstructIdV1 | SavedRosterIdV1;

  export interface SavedConstructV1 {
    id: SavedConstructIdV1;
    name: string;
    construct: ConstructSnapshotV1;
  }

  export interface SavedRosterV1 {
    id: SavedRosterIdV1;
    name: string;
    budget: number;
    constructs: ConstructSnapshotV1[];
  }

  export interface PreferencesV1 {
    reducedMotion: ReducedMotionPreferenceV1;
    highContrastSquads: boolean;
  }

  export interface PersistedStateV1 {
    schemaVersion: 1;
    revision: number;
    nextEntityId: number;
    constructs: SavedConstructV1[];
    rosters: SavedRosterV1[];
    preferences: PreferencesV1;
  }

  export type SchemaIssueCode =
    | "TYPE"
    | "EXTRA_FIELD"
    | "MISSING_FIELD"
    | "RANGE"
    | "FORMAT"
    | "DUPLICATE"
    | "ORDER";

  export interface SchemaIssue {
    path: string;
    code: SchemaIssueCode;
    message: string;
  }

  export type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; issues: SchemaIssue[] };

  export type MigrationResult<T> =
    | { ok: true; value: T; changed: boolean }
    | {
        ok: false;
        code: "UNSUPPORTED_SOURCE" | "INVALID_SCHEMA";
        message: string;
        issues: SchemaIssue[];
      };

  export interface StorageMigration<T> {
    readonly id: string;
    readonly fromVersion: 0;
    readonly toVersion: 1;
    apply(input: unknown | null): MigrationResult<T>;
  }

  export function createInitialStateV1(): PersistedStateV1;
  export function validatePersistedStateV1(input: unknown): ValidationResult<PersistedStateV1>;
  export const migration001: StorageMigration<PersistedStateV1>;
}
