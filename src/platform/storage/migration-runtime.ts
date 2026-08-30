/**
 * Runtime shim over the DB-owned migration module. See `migration-shim.d.ts`
 * for the rationale. Vite discovers the literal eager glob for bundling while
 * the ambient `signal-loss/db/migration-v1` module supplies app-facing types
 * without adding the DB-owned source to the app TypeScript graph.
 */

import type * as MigrationV1 from "signal-loss/db/migration-v1";

const migrationModules = import.meta.glob<typeof MigrationV1>(
  "../../migrations/001_initial.ts",
  { eager: true },
);

let cached: typeof MigrationV1 | null = null;

function assertMigrationModule(
  modulePath: string,
  value: unknown,
): asserts value is typeof MigrationV1 {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Bundled DB migration defect at ${modulePath}: expected a module object.`);
  }

  const candidate = value as Record<string, unknown>;
  const migration = candidate["migration001"];
  if (
    candidate["STORAGE_KEY"] !== "signal-loss:state" ||
    candidate["STORAGE_SCHEMA_VERSION"] !== 1 ||
    typeof candidate["createInitialStateV1"] !== "function" ||
    typeof candidate["validatePersistedStateV1"] !== "function" ||
    typeof migration !== "object" ||
    migration === null ||
    typeof (migration as Record<string, unknown>)["apply"] !== "function"
  ) {
    throw new Error(
      `Bundled DB migration defect at ${modulePath}: required v1 migration exports are missing or invalid.`,
    );
  }
}

async function loadMigration(): Promise<typeof MigrationV1> {
  if (cached !== null) return cached;

  const entries = Object.entries(migrationModules);
  if (entries.length !== 1) {
    throw new Error(
      `Bundled DB migration defect: expected exactly one v1 module, found ${entries.length}.`,
    );
  }
  const entry = entries[0];
  if (entry === undefined) {
    throw new Error("Bundled DB migration defect: the discovered v1 module entry is missing.");
  }
  const [modulePath, module] = entry;
  assertMigrationModule(modulePath, module);
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
