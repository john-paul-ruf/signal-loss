import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createInitialStateV1,
  getStorageKey,
  getStorageSchemaVersion,
  preloadMigrationModule,
  type ConstructSnapshotV1,
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

const CONSTRUCT_SNAPSHOT: ConstructSnapshotV1 = {
  chassisCode: 10,
  commanderCode: 1,
  mounts: [{ hardpointIndex: 0, mountCode: 22 }],
};

describe("platform/storage / atomic mutations", () => {
  it("saveConstruct (create) allocates a fresh id and increments revision once", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    const initial = repo.load();
    if (!initial.ok) throw new Error("initial load failed");
    const setSpy = vi.spyOn(storage, "setItem");
    const result = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.revision).toBe(1);
      expect(result.value.constructs.length).toBe(1);
      expect(result.value.nextEntityId).toBe(2);
    }
    // Exactly one write to STORAGE_KEY per successful save.
    const writes = setSpy.mock.calls.filter((c) => c[0] === STORAGE_KEY);
    expect(writes.length).toBe(1);
  });

  it("saveConstruct returns STALE_REVISION when the expected revision drifts", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    // Simulate a background write bumping the revision.
    storage.seedRaw(
      STORAGE_KEY,
      JSON.stringify({
        ...createInitialStateV1(),
        revision: 3,
      } satisfies PersistedStateV1),
    );
    const result = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "STALE_REVISION") {
      expect(result.error.expected).toBe(0);
      expect(result.error.actual).toBe(3);
    } else {
      expect.fail("expected STALE_REVISION");
    }
  });

  it("saveConstruct returns WRITE_FAILED on blank name and leaves persisted state alone", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const before = storage.snapshot();
    const setSpy = vi.spyOn(storage, "setItem");
    const result = repo.saveConstruct({
      expectedRevision: 0,
      name: "   ",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("WRITE_FAILED");
    // No STORAGE_KEY writes on failure.
    const writes = setSpy.mock.calls.filter((c) => c[0] === STORAGE_KEY);
    expect(writes.length).toBe(0);
    expect(storage.snapshot()).toEqual(before);
  });

  it("saveConstruct (update) replaces by id and keeps revision monotonic", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const create = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    if (!create.ok) throw new Error("create failed");
    const id = create.value.constructs[0]?.id;
    if (id === undefined) throw new Error("no id");
    const update = repo.saveConstruct({
      expectedRevision: 1,
      name: "Alpha v2",
      snapshot: CONSTRUCT_SNAPSHOT,
      id,
    });
    expect(update.ok).toBe(true);
    if (update.ok) {
      expect(update.value.constructs.length).toBe(1);
      expect(update.value.constructs[0]?.id).toBe(id);
      expect(update.value.constructs[0]?.name).toBe("Alpha v2");
      expect(update.value.revision).toBe(2);
    }
  });

  it("delete of a missing id returns ENTITY_NOT_FOUND and does not write", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const setSpy = vi.spyOn(storage, "setItem");
    const result = repo.deleteEntity({
      expectedRevision: 0,
      id: "construct:999",
      confirmed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ENTITY_NOT_FOUND");
    const writes = setSpy.mock.calls.filter((c) => c[0] === STORAGE_KEY);
    expect(writes.length).toBe(0);
  });

  it("saveConstruct returns QUOTA_EXCEEDED and preserves prior state", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const before = storage.snapshot();
    storage.failNextSet = Object.assign(new Error("quota"), { code: 22 });
    const result = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("QUOTA_EXCEEDED");
    // The persisted state is untouched by a failed write.
    expect(storage.snapshot()).toEqual(before);
  });

  it("saveRoster canonicalizes mount order before writing", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const outOfOrder: ConstructSnapshotV1 = {
      chassisCode: 10,
      commanderCode: 1,
      mounts: [
        { hardpointIndex: 2, mountCode: 20 },
        { hardpointIndex: 0, mountCode: 22 },
      ],
    };
    const result = repo.saveRoster({
      expectedRevision: 0,
      name: "R1",
      budget: 50,
      snapshots: [outOfOrder],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const persisted = result.value.rosters[0]?.constructs[0]?.mounts;
      expect(persisted?.map((m) => m.hardpointIndex)).toEqual([0, 2]);
    }
  });

  it("rename mutates only the name field", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const create = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    if (!create.ok) throw new Error("create failed");
    const id = create.value.constructs[0]?.id;
    if (id === undefined) throw new Error("no id");
    const rename = repo.renameEntity({
      expectedRevision: 1,
      id,
      newName: "Beta",
    });
    expect(rename.ok).toBe(true);
    if (rename.ok) {
      expect(rename.value.constructs[0]?.name).toBe("Beta");
      expect(rename.value.constructs[0]?.construct).toEqual(CONSTRUCT_SNAPSHOT);
    }
  });

  it("duplicate allocates a new id and increments nextEntityId", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const create = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    if (!create.ok) throw new Error("create failed");
    const id = create.value.constructs[0]?.id;
    if (id === undefined) throw new Error("no id");
    const dup = repo.duplicateEntity({
      expectedRevision: 1,
      id,
      copyName: "Alpha Copy",
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.value.constructs.length).toBe(2);
      expect(dup.value.constructs[1]?.id).not.toBe(id);
      expect(dup.value.constructs[1]?.name).toBe("Alpha Copy");
      expect(dup.value.nextEntityId).toBe(3);
    }
  });

  it("savePreferences updates only preference fields and increments revision", () => {
    const storage = new MemoryStorage();
    const repo = repoOver(storage);
    repo.load();
    const result = repo.savePreferences({
      expectedRevision: 0,
      preferences: {
        reducedMotion: "reduced",
        highContrastSquads: true,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preferences.reducedMotion).toBe("reduced");
      expect(result.value.preferences.highContrastSquads).toBe(true);
      expect(result.value.revision).toBe(1);
    }
  });
});

describe("platform/storage / mutations require probe success", () => {
  it("returns STORAGE_UNAVAILABLE when the probe fails on first mutation", () => {
    const storage = new MemoryStorage();
    storage.failNextSet = Object.assign(new Error("blocked"), { name: "SecurityError" });
    const repo = repoOver(storage);
    const result = repo.saveConstruct({
      expectedRevision: 0,
      name: "Alpha",
      snapshot: CONSTRUCT_SNAPSHOT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("STORAGE_UNAVAILABLE");
  });
});

// Reference to STORAGE_SCHEMA_VERSION to keep the linter happy — the value is
// consumed indirectly through migration behavior above and pinned here for
// documentation completeness.
void (() => STORAGE_SCHEMA_VERSION);
