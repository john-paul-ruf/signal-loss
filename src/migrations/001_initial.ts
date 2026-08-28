/**
 * Permanent persistence schema ownership: DB/Genesis.
 *
 * This module contains no browser I/O. The CollectionRepository owns localStorage
 * access and calls this pure migration before it reads or writes persisted state.
 */

export const STORAGE_KEY = "signal-loss:state" as const;
export const STORAGE_SCHEMA_VERSION = 1 as const;

const MAX_CATALOG_CODE = 0xfff;
const MAX_COMMANDER_CODE = 0xf;
const MAX_HARDPOINT_INDEX = 0xf;
const VALID_BUDGETS = new Set([25, 50, 75, 100, 125, 150, 175, 200]);
const ENTITY_ID_PATTERN = /^(construct|roster):([1-9][0-9]*)$/u;

export type SavedConstructIdV1 = `construct:${number}`;
export type SavedRosterIdV1 = `roster:${number}`;
export type PersistedEntityIdV1 = SavedConstructIdV1 | SavedRosterIdV1;
export type ReducedMotionPreferenceV1 = "system" | "reduced" | "full";

export interface MountAssignmentV1 {
  /** Zero-based hardpoint index; assignments are stored in ascending index order. */
  hardpointIndex: number;
  /** Stable numeric code from the authored catalog. */
  mountCode: number;
}

export interface ConstructSnapshotV1 {
  /** Stable numeric code from the authored catalog. */
  chassisCode: number;
  /** Null means untagged; otherwise this is a stable commander-type code. */
  commanderCode: number | null;
  mounts: MountAssignmentV1[];
}

export interface SavedConstructV1 {
  id: SavedConstructIdV1;
  name: string;
  construct: ConstructSnapshotV1;
}

export interface SavedRosterV1 {
  id: SavedRosterIdV1;
  name: string;
  budget: number;
  /** Owned snapshots: a roster never references a SavedConstructV1 by id. */
  constructs: ConstructSnapshotV1[];
}

export interface PreferencesV1 {
  reducedMotion: ReducedMotionPreferenceV1;
  highContrastSquads: boolean;
}

export interface PersistedStateV1 {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  /** Increments exactly once after each successful logical write. */
  revision: number;
  /** Next global numeric suffix for construct and roster ids. */
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

export function createInitialStateV1(): PersistedStateV1 {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    revision: 0,
    nextEntityId: 1,
    constructs: [],
    rosters: [],
    preferences: {
      reducedMotion: "system",
      highContrastSquads: false,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function addTypeIssue(issues: SchemaIssue[], path: string, expected: string): void {
  issues.push({ path, code: "TYPE", message: `Expected ${expected}.` });
}

function validateExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  issues: SchemaIssue[],
): void {
  const expected = new Set(expectedKeys);

  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      issues.push({
        path: `${path}.${key}`,
        code: "MISSING_FIELD",
        message: "Required field is missing.",
      });
    }
  }

  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      issues.push({
        path: `${path}.${key}`,
        code: "EXTRA_FIELD",
        message: "Field is not part of persistence schema v1.",
      });
    }
  }
}

function isSafeIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateName(value: unknown, path: string, issues: SchemaIssue[]): void {
  if (typeof value !== "string") {
    addTypeIssue(issues, path, "a string");
    return;
  }

  if (value.trim().length === 0) {
    issues.push({ path, code: "FORMAT", message: "Name must contain a non-whitespace character." });
  }
}

function validateEntityId(
  value: unknown,
  expectedKind: "construct" | "roster",
  path: string,
  issues: SchemaIssue[],
): number | null {
  if (typeof value !== "string") {
    addTypeIssue(issues, path, "an entity id string");
    return null;
  }

  const match = ENTITY_ID_PATTERN.exec(value);
  if (match === null || match[1] !== expectedKind) {
    issues.push({
      path,
      code: "FORMAT",
      message: `Expected ${expectedKind}:<positive-safe-integer>.`,
    });
    return null;
  }

  const suffix = Number(match[2]);
  if (!Number.isSafeInteger(suffix) || suffix < 1) {
    issues.push({ path, code: "RANGE", message: "Entity id suffix is outside the safe range." });
    return null;
  }

  return suffix;
}

function validateMountAssignment(
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): number | null {
  const record = asRecord(value);
  if (record === null) {
    addTypeIssue(issues, path, "a mount-assignment object");
    return null;
  }

  validateExactKeys(record, ["hardpointIndex", "mountCode"], path, issues);

  if (!isSafeIntegerInRange(record.hardpointIndex, 0, MAX_HARDPOINT_INDEX)) {
    issues.push({
      path: `${path}.hardpointIndex`,
      code: "RANGE",
      message: `Hardpoint index must be an integer from 0 to ${MAX_HARDPOINT_INDEX}.`,
    });
  }

  if (!isSafeIntegerInRange(record.mountCode, 1, MAX_CATALOG_CODE)) {
    issues.push({
      path: `${path}.mountCode`,
      code: "RANGE",
      message: `Mount code must be an integer from 1 to ${MAX_CATALOG_CODE}.`,
    });
  }

  return typeof record.hardpointIndex === "number" ? record.hardpointIndex : null;
}

function validateConstructSnapshot(value: unknown, path: string, issues: SchemaIssue[]): void {
  const record = asRecord(value);
  if (record === null) {
    addTypeIssue(issues, path, "a construct snapshot object");
    return;
  }

  validateExactKeys(record, ["chassisCode", "commanderCode", "mounts"], path, issues);

  if (!isSafeIntegerInRange(record.chassisCode, 1, MAX_CATALOG_CODE)) {
    issues.push({
      path: `${path}.chassisCode`,
      code: "RANGE",
      message: `Chassis code must be an integer from 1 to ${MAX_CATALOG_CODE}.`,
    });
  }

  if (
    record.commanderCode !== null &&
    !isSafeIntegerInRange(record.commanderCode, 1, MAX_COMMANDER_CODE)
  ) {
    issues.push({
      path: `${path}.commanderCode`,
      code: "RANGE",
      message: `Commander code must be null or an integer from 1 to ${MAX_COMMANDER_CODE}.`,
    });
  }

  if (!Array.isArray(record.mounts)) {
    addTypeIssue(issues, `${path}.mounts`, "an array");
    return;
  }

  const seenHardpoints = new Set<number>();
  let previousHardpoint = -1;

  record.mounts.forEach((mount, index) => {
    const mountPath = `${path}.mounts[${index}]`;
    const hardpointIndex = validateMountAssignment(mount, mountPath, issues);
    if (hardpointIndex === null) {
      return;
    }

    if (seenHardpoints.has(hardpointIndex)) {
      issues.push({
        path: `${mountPath}.hardpointIndex`,
        code: "DUPLICATE",
        message: "A hardpoint may appear only once in a construct snapshot.",
      });
    }

    if (hardpointIndex <= previousHardpoint) {
      issues.push({
        path: `${mountPath}.hardpointIndex`,
        code: "ORDER",
        message: "Mount assignments must be sorted by ascending hardpoint index.",
      });
    }

    seenHardpoints.add(hardpointIndex);
    previousHardpoint = hardpointIndex;
  });
}

function validatePreferences(value: unknown, path: string, issues: SchemaIssue[]): void {
  const record = asRecord(value);
  if (record === null) {
    addTypeIssue(issues, path, "a preferences object");
    return;
  }

  validateExactKeys(record, ["reducedMotion", "highContrastSquads"], path, issues);

  if (
    record.reducedMotion !== "system" &&
    record.reducedMotion !== "reduced" &&
    record.reducedMotion !== "full"
  ) {
    issues.push({
      path: `${path}.reducedMotion`,
      code: "FORMAT",
      message: "Reduced-motion preference must be system, reduced, or full.",
    });
  }

  if (typeof record.highContrastSquads !== "boolean") {
    addTypeIssue(issues, `${path}.highContrastSquads`, "a boolean");
  }
}

export function validatePersistedStateV1(input: unknown): ValidationResult<PersistedStateV1> {
  const issues: SchemaIssue[] = [];
  const root = asRecord(input);

  if (root === null) {
    return {
      ok: false,
      issues: [{ path: "$", code: "TYPE", message: "Expected a persisted-state object." }],
    };
  }

  validateExactKeys(
    root,
    ["schemaVersion", "revision", "nextEntityId", "constructs", "rosters", "preferences"],
    "$",
    issues,
  );

  if (root.schemaVersion !== STORAGE_SCHEMA_VERSION) {
    issues.push({
      path: "$.schemaVersion",
      code: "FORMAT",
      message: `Expected schema version ${STORAGE_SCHEMA_VERSION}.`,
    });
  }

  if (!isSafeIntegerInRange(root.revision, 0, Number.MAX_SAFE_INTEGER)) {
    issues.push({
      path: "$.revision",
      code: "RANGE",
      message: "Revision must be a non-negative safe integer.",
    });
  }

  if (!isSafeIntegerInRange(root.nextEntityId, 1, Number.MAX_SAFE_INTEGER)) {
    issues.push({
      path: "$.nextEntityId",
      code: "RANGE",
      message: "nextEntityId must be a positive safe integer.",
    });
  }

  const seenIds = new Set<string>();
  let largestIdSuffix = 0;

  if (!Array.isArray(root.constructs)) {
    addTypeIssue(issues, "$.constructs", "an array");
  } else {
    root.constructs.forEach((value, index) => {
      const path = `$.constructs[${index}]`;
      const record = asRecord(value);
      if (record === null) {
        addTypeIssue(issues, path, "a saved-construct object");
        return;
      }

      validateExactKeys(record, ["id", "name", "construct"], path, issues);
      const suffix = validateEntityId(record.id, "construct", `${path}.id`, issues);
      if (suffix !== null) {
        largestIdSuffix = Math.max(largestIdSuffix, suffix);
      }
      if (typeof record.id === "string") {
        if (seenIds.has(record.id)) {
          issues.push({ path: `${path}.id`, code: "DUPLICATE", message: "Entity id is duplicated." });
        }
        seenIds.add(record.id);
      }
      validateName(record.name, `${path}.name`, issues);
      validateConstructSnapshot(record.construct, `${path}.construct`, issues);
    });
  }

  if (!Array.isArray(root.rosters)) {
    addTypeIssue(issues, "$.rosters", "an array");
  } else {
    root.rosters.forEach((value, index) => {
      const path = `$.rosters[${index}]`;
      const record = asRecord(value);
      if (record === null) {
        addTypeIssue(issues, path, "a saved-roster object");
        return;
      }

      validateExactKeys(record, ["id", "name", "budget", "constructs"], path, issues);
      const suffix = validateEntityId(record.id, "roster", `${path}.id`, issues);
      if (suffix !== null) {
        largestIdSuffix = Math.max(largestIdSuffix, suffix);
      }
      if (typeof record.id === "string") {
        if (seenIds.has(record.id)) {
          issues.push({ path: `${path}.id`, code: "DUPLICATE", message: "Entity id is duplicated." });
        }
        seenIds.add(record.id);
      }
      validateName(record.name, `${path}.name`, issues);

      if (typeof record.budget !== "number" || !VALID_BUDGETS.has(record.budget)) {
        issues.push({
          path: `${path}.budget`,
          code: "RANGE",
          message: "Budget must be one of 25, 50, 75, 100, 125, 150, 175, or 200.",
        });
      }

      if (!Array.isArray(record.constructs)) {
        addTypeIssue(issues, `${path}.constructs`, "an array");
      } else {
        record.constructs.forEach((construct, constructIndex) => {
          validateConstructSnapshot(
            construct,
            `${path}.constructs[${constructIndex}]`,
            issues,
          );
        });
      }
    });
  }

  validatePreferences(root.preferences, "$.preferences", issues);

  if (
    typeof root.nextEntityId === "number" &&
    Number.isSafeInteger(root.nextEntityId) &&
    root.nextEntityId <= largestIdSuffix
  ) {
    issues.push({
      path: "$.nextEntityId",
      code: "RANGE",
      message: "nextEntityId must be greater than every allocated entity id suffix.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: input as PersistedStateV1 };
}

/**
 * Migration 001 is both the empty-store bootstrap and the idempotent v1 validator.
 * An unversioned non-null object is rejected rather than guessed at or silently reset.
 */
export const migration001: StorageMigration<PersistedStateV1> = {
  id: "001_initial",
  fromVersion: 0,
  toVersion: STORAGE_SCHEMA_VERSION,
  apply(input: unknown | null): MigrationResult<PersistedStateV1> {
    if (input === null) {
      return { ok: true, value: createInitialStateV1(), changed: true };
    }

    const record = asRecord(input);
    if (record === null || record.schemaVersion !== STORAGE_SCHEMA_VERSION) {
      return {
        ok: false,
        code: "UNSUPPORTED_SOURCE",
        message: "Migration 001 accepts only an absent store or an existing schema-v1 document.",
        issues: [],
      };
    }

    const validation = validatePersistedStateV1(input);
    if (!validation.ok) {
      return {
        ok: false,
        code: "INVALID_SCHEMA",
        message: "The schema-v1 document failed structural validation.",
        issues: validation.issues,
      };
    }

    return { ok: true, value: validation.value, changed: false };
  },
};
