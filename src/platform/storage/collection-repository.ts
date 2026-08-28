import {
  applyMigration001,
  createInitialStateV1,
  getStorageKey,
  getStorageSchemaVersion,
  validatePersistedStateV1,
  type PersistedStateV1,
  type SchemaIssue,
} from "./migration-runtime";
import type { RepositoryError, RepositoryResult } from "./errors";

/**
 * The port every consumer uses. Adapters (localStorage + memory) satisfy this
 * exact shape so the app store never depends on a browser global.
 *
 * `load` is idempotent for a valid store. `resetCorruptStore` requires an
 * explicit `confirmed: true` witness — the type prevents accidental resets.
 */
export interface CollectionRepository {
  load(): RepositoryResult<PersistedStateV1>;
  resetCorruptStore(confirmed: true): RepositoryResult<PersistedStateV1>;
  subscribeToExternalChange(listener: () => void): () => void;
}

/**
 * The subset of `Storage` (Web IDL) the repository needs. Adapter tests can
 * hand in an in-memory implementation to exercise every failure path without
 * touching a real browser DOM.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Minimal event target the repository listens on for cross-tab writes. In
 * production this is `window`; tests hand in a stub.
 */
export interface ChangeEventTarget {
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}

interface StorageEvent {
  readonly key: string | null;
  readonly newValue: string | null;
  readonly oldValue: string | null;
  readonly storageArea: StorageLike | null;
}

/**
 * A repository options bag — every browser interaction is injected so the
 * adapter is testable in Node. In production, callers pass `window.localStorage`
 * and `window`.
 */
export interface CollectionRepositoryOptions {
  readonly storage: StorageLike;
  readonly changeSource?: ChangeEventTarget;
  readonly storageKey?: string;
}

const PROBE_KEY_SUFFIX = ":__probe__";

/**
 * Detect a browser QuotaExceededError WITHOUT relying on `error.name` alone
 * (fragile across engines). Combines DOMException `.code === 22`,
 * DOMException `.code === 1014` (Firefox legacy), and the modern
 * `QuotaExceededError` name. If any signal fires, treat it as a quota event.
 */
function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; name?: unknown };
  if (record.code === 22 || record.code === 1014) return true;
  if (record.name === "QuotaExceededError" || record.name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }
  return false;
}

/**
 * Probe the storage for write access without leaving side effects. Any
 * synchronous throw during set/remove is treated as STORAGE_UNAVAILABLE — this
 * matches the design.md non-persistence usability mode.
 */
function probeStorage(storage: StorageLike, key: string): { ok: true } | { ok: false; cause: unknown } {
  const probeKey = key + PROBE_KEY_SUFFIX;
  try {
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return { ok: true };
  } catch (cause) {
    return { ok: false, cause };
  }
}

/**
 * Read the currently persisted string. `null` means no record yet, which the
 * migration turns into an initial state. Any throw is STORAGE_UNAVAILABLE.
 */
function readRaw(
  storage: StorageLike,
  key: string,
): RepositoryResult<string | null> {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch (cause) {
    return { ok: false, error: { kind: "STORAGE_UNAVAILABLE", cause } };
  }
}

/**
 * Classify a parsed JSON tree — is it a schema-v1 document, a future
 * schema, or a shape we cannot understand? Follow database.md §7's three
 * layers exactly: JSON → persistence schema → engine rules (engine layer
 * lives outside the repository).
 */
function classifyParsed(
  parsed: unknown,
  raw: string,
): RepositoryResult<PersistedStateV1> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: {
        kind: "INVALID_SCHEMA",
        raw,
        issues: [
          {
            path: "$",
            code: "TYPE",
            message: "Persisted state must be a JSON object.",
          },
        ],
      },
    };
  }
  const record = parsed as { schemaVersion?: unknown };
  const version = record.schemaVersion;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return { ok: false, error: { kind: "UNSUPPORTED_VERSION", version } };
  }
  if (version > getStorageSchemaVersion()) {
    return { ok: false, error: { kind: "UNSUPPORTED_VERSION", version } };
  }
  return runMigration(parsed, raw);
}

function runMigration(
  parsed: unknown,
  raw: string,
): RepositoryResult<PersistedStateV1> {
  const targetVersion = getStorageSchemaVersion();
  let migrationResult: ReturnType<typeof applyMigration001>;
  try {
    migrationResult = applyMigration001(parsed);
  } catch (cause) {
    return {
      ok: false,
      error: {
        kind: "MIGRATION_FAILED",
        from: 1,
        to: targetVersion,
        cause,
      },
    };
  }
  if (migrationResult.ok) {
    // Even after migration, run the pure validator so a future migration that
    // returns a subtly-invalid document does not slip through to callers.
    const validation = validatePersistedStateV1(migrationResult.value);
    if (!validation.ok) {
      return invalidSchema(raw, validation.issues);
    }
    return { ok: true, value: validation.value };
  }
  if (migrationResult.code === "INVALID_SCHEMA") {
    return invalidSchema(raw, migrationResult.issues);
  }
  return {
    ok: false,
    error: {
      kind: "MIGRATION_FAILED",
      from: 1,
      to: targetVersion,
      cause: migrationResult.message,
    },
  };
}

function invalidSchema(raw: string, issues: readonly SchemaIssue[]): RepositoryResult<PersistedStateV1> {
  return { ok: false, error: { kind: "INVALID_SCHEMA", raw, issues } };
}

/**
 * Serialize and write a candidate state as one atomic setItem call. Never
 * runs a validator — callers must have already validated the candidate. Any
 * throw is classified: quota vs. every other write failure.
 */
export function writeCandidate(
  storage: StorageLike,
  key: string,
  candidate: PersistedStateV1,
): RepositoryResult<PersistedStateV1> {
  let serialized: string;
  try {
    serialized = JSON.stringify(candidate);
  } catch (cause) {
    return { ok: false, error: { kind: "WRITE_FAILED", cause } };
  }
  try {
    storage.setItem(key, serialized);
    return { ok: true, value: candidate };
  } catch (cause) {
    if (isQuotaError(cause)) {
      return { ok: false, error: { kind: "QUOTA_EXCEEDED" } };
    }
    return { ok: false, error: { kind: "WRITE_FAILED", cause } };
  }
}

/**
 * Reads the current stored state without probing storage. Reused by both
 * `load` and the future mutation path so parsing/migration classification
 * flows through one code path.
 */
export function readStoredState(
  storage: StorageLike,
  key: string,
): RepositoryResult<PersistedStateV1> {
  const rawResult = readRaw(storage, key);
  if (!rawResult.ok) return rawResult;
  const raw = rawResult.value;
  if (raw === null) {
    return { ok: true, value: createInitialStateV1() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: { kind: "MALFORMED_JSON", raw } };
  }
  return classifyParsed(parsed, raw);
}

interface RepositoryState {
  storage: StorageLike;
  storageKey: string;
  changeSource: ChangeEventTarget | undefined;
  hasProbed: boolean;
  probeError: RepositoryError | null;
}

function ensureProbe(state: RepositoryState): RepositoryError | null {
  if (state.hasProbed) return state.probeError;
  state.hasProbed = true;
  const probe = probeStorage(state.storage, state.storageKey);
  if (probe.ok) {
    state.probeError = null;
    return null;
  }
  state.probeError = { kind: "STORAGE_UNAVAILABLE", cause: probe.cause };
  return state.probeError;
}

/**
 * Build a repository over the given storage adapter. The returned value is a
 * plain object — no class, no `this`, no persistent state beyond the probe
 * cache — so tests can construct a fresh repository per case.
 */
export function createCollectionRepository(
  options: CollectionRepositoryOptions,
): CollectionRepository {
  const state: RepositoryState = {
    storage: options.storage,
    storageKey: options.storageKey ?? getStorageKey(),
    changeSource: options.changeSource,
    hasProbed: false,
    probeError: null,
  };
  return {
    load(): RepositoryResult<PersistedStateV1> {
      const probeError = ensureProbe(state);
      if (probeError !== null) return { ok: false, error: probeError };
      return readStoredState(state.storage, state.storageKey);
    },
    resetCorruptStore(confirmed: true): RepositoryResult<PersistedStateV1> {
      if (confirmed !== true) {
        return {
          ok: false,
          error: {
            kind: "WRITE_FAILED",
            cause: new Error("resetCorruptStore requires confirmed === true"),
          },
        };
      }
      const probeError = ensureProbe(state);
      if (probeError !== null) return { ok: false, error: probeError };
      const fresh = createInitialStateV1();
      return writeCandidate(state.storage, state.storageKey, fresh);
    },
    subscribeToExternalChange(listener: () => void): () => void {
      const source = state.changeSource;
      if (source === undefined) return () => undefined;
      const key = state.storageKey;
      function onStorage(event: StorageEvent): void {
        if (event.key === null || event.key === key) listener();
      }
      source.addEventListener("storage", onStorage);
      return () => source.removeEventListener("storage", onStorage);
    },
  };
}
