/**
 * Runtime shim over the DB-owned migration module. See `migration-shim.d.ts`
 * for the rationale — this file exists so consumers can call migration
 * symbols through a typed contract even while `tsconfig.app.json` refuses to
 * typecheck the migration source.
 *
 * A dynamic-specifier `import()` prevents TypeScript from statically
 * resolving the migration source into the compilation graph; the ambient
 * `signal-loss/db/migration-v1` module provides the API surface types.
 */

import type * as MigrationV1 from "signal-loss/db/migration-v1";

const MIGRATION_SPECIFIER = "../../migrations/001_initial";

let cached: typeof MigrationV1 | null = null;

async function loadMigration(): Promise<typeof MigrationV1> {
  if (cached !== null) return cached;
  // Non-literal specifier — TypeScript can't statically follow this and so
  // does not typecheck the migration source.
  const dynamicSpecifier: string = MIGRATION_SPECIFIER;
  const module = (await import(/* @vite-ignore */ dynamicSpecifier)) as unknown as typeof MigrationV1;
  cached = module;
  return module;
}

/**
 * Preload the migration module so subsequent sync accessors succeed. The
 * app boot path calls this once before creating a repository; tests can
 * call it in a `beforeAll` block.
 */
export async function preloadMigrationModule(): Promise<typeof MigrationV1> {
  return loadMigration();
}

function assertLoaded(): typeof MigrationV1 {
  if (cached === null) {
    throw new Error(
      "DB migration module not preloaded. Call `preloadMigrationModule()` at app boot before using CollectionRepository.",
    );
  }
  return cached;
}

/** Storage key constant — mirrors the migration's exported literal. */
export function getStorageKey(): "signal-loss:state" {
  return assertLoaded().STORAGE_KEY;
}

export function getStorageSchemaVersion(): 1 {
  return assertLoaded().STORAGE_SCHEMA_VERSION;
}

export function createInitialStateV1(): MigrationV1.PersistedStateV1 {
  return assertLoaded().createInitialStateV1();
}

export function validatePersistedStateV1(
  input: unknown,
): MigrationV1.ValidationResult<MigrationV1.PersistedStateV1> {
  return assertLoaded().validatePersistedStateV1(input);
}

export function applyMigration001(
  input: unknown | null,
): MigrationV1.MigrationResult<MigrationV1.PersistedStateV1> {
  return assertLoaded().migration001.apply(input);
}

export type PersistedStateV1 = MigrationV1.PersistedStateV1;
export type SchemaIssue = MigrationV1.SchemaIssue;
export type PreferencesV1 = MigrationV1.PreferencesV1;
export type SavedConstructV1 = MigrationV1.SavedConstructV1;
export type SavedRosterV1 = MigrationV1.SavedRosterV1;
export type ConstructSnapshotV1 = MigrationV1.ConstructSnapshotV1;
export type MountAssignmentV1 = MigrationV1.MountAssignmentV1;
export type ReducedMotionPreferenceV1 = MigrationV1.ReducedMotionPreferenceV1;
export type SavedConstructIdV1 = MigrationV1.SavedConstructIdV1;
export type SavedRosterIdV1 = MigrationV1.SavedRosterIdV1;
export type PersistedEntityIdV1 = MigrationV1.PersistedEntityIdV1;
