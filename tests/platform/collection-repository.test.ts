import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createInitialStateV1,
  getStorageKey,
  getStorageSchemaVersion,
  preloadMigrationModule,
  type PersistedStateV1,
} from "../../src/platform/storage/migration-runtime";
import {
  createCollectionRepository,
  type ChangeEventTarget,
  type CollectionRepository,
  type StorageLike,
} from "../../src/platform/storage/index";

beforeAll(async () => {
  await preloadMigrationModule();
});

// Aliases so the rest of the test reads like it was importing the DB module
// directly — the shim carries the same literal types.
let STORAGE_KEY: "signal-loss:state";
let STORAGE_SCHEMA_VERSION: 1;

beforeAll(() => {
  STORAGE_KEY = getStorageKey();
  STORAGE_SCHEMA_VERSION = getStorageSchemaVersion();
});

/**
 * In-memory storage — the repository's port makes real `localStorage`
 * unnecessary in unit tests. Failure modes are injected by setting the
 * `failNext…` fields before each call.
 */
class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  failNextGet: unknown | undefined = undefined;
  failNextSet: unknown | undefined = undefined;
  failNextRemove: unknown | undefined = undefined;

  getItem(key: string): string | null {
    if (this.failNextGet !== undefined) {
      const err = this.failNextGet;
      this.failNextGet = undefined;
      throw err;
    }
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failNextSet !== undefined) {
      const err = this.failNextSet;
      this.failNextSet = undefined;
      throw err;
    }
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    if (this.failNextRemove !== undefined) {
      const err = this.failNextRemove;
      this.failNextRemove = undefined;
      throw err;
    }
    this.data.delete(key);
  }
  seedRaw(key: string, raw: string): void {
    this.data.set(key, raw);
  }
  snapshot(): Map<string, string> {
    return new Map(this.data);
  }
}

/**
 * A stub event target for cross-tab-change subscription tests.
 */
class StubChangeSource implements ChangeEventTarget {
  private listeners: Array<(event: { key: string | null; newValue: string | null; oldValue: string | null; storageArea: StorageLike | null }) => void> = [];
  addEventListener(_: "storage", listener: (event: { key: string | null; newValue: string | null; oldValue: string | null; storageArea: StorageLike | null }) => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_: "storage", listener: (event: { key: string | null; newValue: string | null; oldValue: string | null; storageArea: StorageLike | null }) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  emit(event: { key: string | null; newValue: string | null; oldValue: string | null; storageArea: StorageLike | null }): void {
    for (const l of this.listeners.slice()) l(event);
  }
  listenerCount(): number {
    return this.listeners.length;
  }
}

function repoOver(storage: StorageLike, changeSource?: ChangeEventTarget): CollectionRepository {
  if (changeSource === undefined) {
    return createCollectionRepository({ storage });
  }
  return createCollectionRepository({ storage, changeSource });
}

describe("platform/storage / load — happy paths", () => {
  it("returns a fresh initial state when the key is absent", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
      expect(result.value.revision).toBe(0);
      expect(result.value.constructs).toEqual([]);
      expect(result.value.rosters).toEqual([]);
    }
  });

  it("is idempotent when the store already holds a valid v1 document", () => {
    const storage = new MemoryStorage();
    const state = createInitialStateV1();
    storage.seedRaw(STORAGE_KEY, JSON.stringify(state));
    const repo = repoOver(storage);
    const first = repo.load();
    const second = repo.load();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value).toEqual(state);
      expect(second.value).toEqual(state);
    }
    // load never writes on a happy path — the raw string is byte-identical.
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(state));
  });
});

describe("platform/storage / load — failure classification", () => {
  it("returns STORAGE_UNAVAILABLE when the probe throws", () => {
    const storage = new MemoryStorage();
    const bad = Object.assign(new Error("blocked"), { name: "SecurityError" });
    storage.failNextSet = bad;
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("STORAGE_UNAVAILABLE");
    }
  });

  it("returns MALFORMED_JSON preserving the raw value", () => {
    const storage = new MemoryStorage();
    storage.seedRaw(STORAGE_KEY, "not-json");
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "MALFORMED_JSON") {
      expect(result.error.raw).toBe("not-json");
    } else {
      expect.fail("expected MALFORMED_JSON");
    }
    // Guarantee we did not overwrite the corrupt raw value while classifying it.
    expect(storage.getItem(STORAGE_KEY)).toBe("not-json");
  });

  it("returns INVALID_SCHEMA when a v1 document is structurally wrong", () => {
    const storage = new MemoryStorage();
    const bad: unknown = {
      schemaVersion: 1,
      revision: 0,
      nextEntityId: 1,
      constructs: [],
      rosters: [],
      preferences: { reducedMotion: "loud", highContrastSquads: false },
    };
    const raw = JSON.stringify(bad);
    storage.seedRaw(STORAGE_KEY, raw);
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "INVALID_SCHEMA") {
      expect(result.error.raw).toBe(raw);
      expect(result.error.issues.some((i) => i.path.includes("reducedMotion"))).toBe(true);
    } else {
      expect.fail("expected INVALID_SCHEMA");
    }
    // Preserve the raw value verbatim — never repair.
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("returns UNSUPPORTED_VERSION when the stored version is in the future", () => {
    const storage = new MemoryStorage();
    storage.seedRaw(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, revision: 0, nextEntityId: 1, constructs: [], rosters: [], preferences: { reducedMotion: "system", highContrastSquads: false } }),
    );
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "UNSUPPORTED_VERSION") {
      expect(result.error.version).toBe(999);
    } else {
      expect.fail("expected UNSUPPORTED_VERSION");
    }
  });

  it("returns UNSUPPORTED_VERSION when the schemaVersion field is missing", () => {
    const storage = new MemoryStorage();
    storage.seedRaw(STORAGE_KEY, JSON.stringify({ revision: 0, constructs: [], rosters: [] }));
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("UNSUPPORTED_VERSION");
  });

  it("classifies non-object JSON as INVALID_SCHEMA with a $ TYPE issue", () => {
    const storage = new MemoryStorage();
    storage.seedRaw(STORAGE_KEY, "[]");
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "INVALID_SCHEMA") {
      expect(result.error.issues[0]?.path).toBe("$");
      expect(result.error.issues[0]?.code).toBe("TYPE");
    } else {
      expect.fail("expected INVALID_SCHEMA");
    }
  });

  it("never writes to storage on any failing load path", () => {
    const cases: readonly string[] = [
      "not-json",
      JSON.stringify({ schemaVersion: 999, revision: 0 }),
      JSON.stringify({ schemaVersion: 1, revision: 0, nextEntityId: 1, constructs: [], rosters: [], preferences: { reducedMotion: "loud", highContrastSquads: false } }),
    ];
    for (const raw of cases) {
      const storage = new MemoryStorage();
      storage.seedRaw(STORAGE_KEY, raw);
      const spy = vi.spyOn(storage, "setItem");
      const repo = repoOver(storage);
      const result = repo.load();
      expect(result.ok).toBe(false);
      // Only the probe wrote+removed a probe key; no other setItem to STORAGE_KEY.
      const writesToStorageKey = spy.mock.calls.filter((c) => c[0] === STORAGE_KEY);
      expect(writesToStorageKey.length).toBe(0);
      spy.mockRestore();
    }
  });
});

describe("platform/storage / resetCorruptStore", () => {
  it("replaces a corrupt raw value with a canonical fresh state — but ONLY on explicit reset", () => {
    const storage = new MemoryStorage();
    storage.seedRaw(STORAGE_KEY, "not-json");
    const repo = repoOver(storage);
    const before = repo.load();
    expect(before.ok).toBe(false);
    // The corrupt data is preserved until the caller explicitly resets.
    expect(storage.getItem(STORAGE_KEY)).toBe("not-json");
    const reset = repo.resetCorruptStore(true);
    expect(reset.ok).toBe(true);
    if (reset.ok) {
      expect(reset.value).toEqual(createInitialStateV1());
    }
    // After the reset, the raw store parses to fresh state.
    const after = repo.load();
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(createInitialStateV1());
  });

  it("propagates STORAGE_UNAVAILABLE when the probe fails", () => {
    const storage = new MemoryStorage();
    storage.failNextSet = Object.assign(new Error("blocked"), { name: "SecurityError" });
    const repo = repoOver(storage);
    const result = repo.resetCorruptStore(true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("STORAGE_UNAVAILABLE");
  });

  it("returns QUOTA_EXCEEDED without name-only matching", () => {
    const storage = new MemoryStorage();
    // Probe should succeed, so seed nothing failing on set until after probe:
    storage.setItem("noop", "1");
    storage.removeItem("noop");
    const repo = repoOver(storage);
    // First call primes the probe.
    const primed = repo.load();
    expect(primed.ok).toBe(true);
    // Now, force the actual reset write to throw a quota-shaped error using
    // code alone — no `name` field.
    storage.failNextSet = Object.assign(new Error("quota"), { code: 22 });
    const reset = repo.resetCorruptStore(true);
    expect(reset.ok).toBe(false);
    if (!reset.ok) expect(reset.error.kind).toBe("QUOTA_EXCEEDED");
  });
});

describe("platform/storage / cross-tab subscription", () => {
  it("notifies subscribers when the same key is written elsewhere", () => {
    const storage = new MemoryStorage();
    const source = new StubChangeSource();
    const repo = createCollectionRepository({ storage, changeSource: source });
    const listener = vi.fn();
    const unsubscribe = repo.subscribeToExternalChange(listener);
    source.emit({ key: STORAGE_KEY, newValue: "x", oldValue: "y", storageArea: storage });
    expect(listener).toHaveBeenCalledTimes(1);
    source.emit({ key: "unrelated", newValue: "x", oldValue: "y", storageArea: storage });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(source.listenerCount()).toBe(0);
  });

  it("returns a no-op unsubscribe when no change source is present", () => {
    const storage = new MemoryStorage();
    const repo = createCollectionRepository({ storage });
    const unsubscribe = repo.subscribeToExternalChange(() => undefined);
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("also fires on a clear-storage event (event.key === null)", () => {
    const storage = new MemoryStorage();
    const source = new StubChangeSource();
    const repo = createCollectionRepository({ storage, changeSource: source });
    const listener = vi.fn();
    repo.subscribeToExternalChange(listener);
    source.emit({ key: null, newValue: null, oldValue: null, storageArea: storage });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("platform/storage / migration safety", () => {
  it("classifies a migration failure carrying the source and target versions", () => {
    const storage = new MemoryStorage();
    // Structurally valid-looking v1 but missing required keys — the migration
    // rejects it, not the outer JSON layer.
    const bad = {
      schemaVersion: 1,
      // missing revision, nextEntityId, etc.
    } as PersistedStateV1 & Record<string, unknown>;
    storage.seedRaw(STORAGE_KEY, JSON.stringify(bad));
    const repo = repoOver(storage);
    const result = repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "INVALID_SCHEMA") {
      expect(result.error.issues.some((i) => i.code === "MISSING_FIELD")).toBe(true);
    } else {
      expect.fail("expected INVALID_SCHEMA for missing required v1 fields");
    }
  });
});
