import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createCollectionRepository,
  preloadMigrationModule,
  type ConstructSnapshotV1,
  type StorageLike,
} from "../../../src/platform/index";
import { createCollectionStore } from "../../../src/app/store/core/index";

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  private setSpy = 0;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.setSpy += 1;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItemCallCount(): number {
    return this.setSpy;
  }
}

beforeAll(async () => {
  await preloadMigrationModule();
});

function makeStore(): {
  storage: MemoryStorage;
  store: ReturnType<typeof createCollectionStore>;
} {
  const storage = new MemoryStorage();
  const repository = createCollectionRepository({ storage });
  const store = createCollectionStore(repository);
  store.getState().boot();
  return { storage, store };
}

const snapshot: ConstructSnapshotV1 = {
  chassisCode: 10,
  commanderCode: 1,
  mounts: [{ hardpointIndex: 0, mountCode: 22 }],
};

describe("app/core/collection-store — boot", () => {
  it("hydrates with the initial state on a fresh storage", () => {
    const { store } = makeStore();
    const state = store.getState();
    expect(state.hasBooted).toBe(true);
    expect(state.collection?.revision).toBe(0);
    expect(state.lastError).toBeNull();
    expect(state.persistenceUnavailable).toBe(false);
    expect(state.corrupt).toBe(false);
  });
});

describe("app/core/collection-store — mutations", () => {
  it("save-create allocates an id and increments revision exactly once", () => {
    const { store, storage } = makeStore();
    const initial = storage.setItemCallCount();
    const ok = store.getState().saveConstructCreate("Alpha", snapshot);
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.collection?.revision).toBe(1);
    expect(state.collection?.constructs.length).toBe(1);
    expect(state.collection?.constructs[0]?.name).toBe("Alpha");
    expect(state.collection?.nextEntityId).toBe(2);
    // Exactly one write to storage per successful mutation.
    expect(storage.setItemCallCount() - initial).toBe(1);
  });

  it("save-create fails with an unchanged revision on blank name", () => {
    const { store, storage } = makeStore();
    const initial = storage.setItemCallCount();
    const ok = store.getState().saveConstructCreate("   ", snapshot);
    expect(ok).toBe(false);
    const state = store.getState();
    expect(state.collection?.revision).toBe(0);
    expect(state.lastError?.kind).toBe("WRITE_FAILED");
    expect(storage.setItemCallCount() - initial).toBe(0);
  });

  it("save-update replaces by id and does not allocate a new id", () => {
    const { store } = makeStore();
    store.getState().saveConstructCreate("Alpha", snapshot);
    const originalId = store.getState().collection?.constructs[0]?.id;
    expect(originalId).toBeDefined();
    if (originalId === undefined) return;
    const ok = store.getState().saveConstructUpdate("Alpha v2", originalId, snapshot);
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.collection?.constructs.length).toBe(1);
    expect(state.collection?.constructs[0]?.id).toBe(originalId);
    expect(state.collection?.constructs[0]?.name).toBe("Alpha v2");
    expect(state.collection?.nextEntityId).toBe(2);
    expect(state.collection?.revision).toBe(2);
  });

  it("rename changes only the name; composition and order remain untouched", () => {
    const { store } = makeStore();
    store.getState().saveConstructCreate("Alpha", snapshot);
    const id = store.getState().collection?.constructs[0]?.id;
    if (id === undefined) return;
    const ok = store.getState().renameEntity(id, "Beta");
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.collection?.constructs[0]?.name).toBe("Beta");
    expect(state.collection?.constructs[0]?.construct).toEqual(snapshot);
    expect(state.collection?.revision).toBe(2);
  });

  it("duplicate creates a fresh id and independent copy", () => {
    const { store } = makeStore();
    store.getState().saveConstructCreate("Alpha", snapshot);
    const id = store.getState().collection?.constructs[0]?.id;
    if (id === undefined) return;
    const ok = store.getState().duplicateEntity(id, "Alpha Copy");
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.collection?.constructs.length).toBe(2);
    const clone = state.collection?.constructs[1];
    expect(clone?.id).not.toBe(id);
    expect(clone?.name).toBe("Alpha Copy");
    expect(clone?.construct).toEqual(snapshot);
    expect(state.collection?.nextEntityId).toBe(3);
    expect(state.collection?.revision).toBe(2);
  });

  it("delete removes exactly one record with no cascade", () => {
    const { store } = makeStore();
    store.getState().saveConstructCreate("Alpha", snapshot);
    store.getState().saveConstructCreate("Beta", snapshot);
    const [first, second] = store.getState().collection?.constructs ?? [];
    if (first === undefined || second === undefined) return;
    const ok = store.getState().deleteEntity(first.id);
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.collection?.constructs.length).toBe(1);
    expect(state.collection?.constructs[0]?.id).toBe(second.id);
    expect(state.collection?.revision).toBe(3);
  });

  it("delete of an unknown id returns ENTITY_NOT_FOUND without touching state", () => {
    const { store } = makeStore();
    const before = store.getState().collection;
    const ok = store.getState().deleteEntity("construct:999");
    expect(ok).toBe(false);
    const state = store.getState();
    expect(state.collection).toEqual(before);
    expect(state.lastError?.kind).toBe("ENTITY_NOT_FOUND");
  });

  it("save-roster canonicalizes mount order on the persisted record", () => {
    const { store } = makeStore();
    const rosterSnapshot: ConstructSnapshotV1 = {
      chassisCode: 10,
      commanderCode: 1,
      mounts: [
        { hardpointIndex: 2, mountCode: 20 },
        { hardpointIndex: 0, mountCode: 22 },
      ],
    };
    const ok = store.getState().saveRosterCreate("R1", 50, [rosterSnapshot]);
    expect(ok).toBe(true);
    const saved = store.getState().collection?.rosters[0]?.constructs[0]?.mounts;
    expect(saved?.map((m) => m.hardpointIndex)).toEqual([0, 2]);
  });

  it("preferences write updates and increments revision", () => {
    const { store } = makeStore();
    const ok = store.getState().savePreferences({
      reducedMotion: "reduced",
      highContrastSquads: true,
    });
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.collection?.preferences.reducedMotion).toBe("reduced");
    expect(state.collection?.preferences.highContrastSquads).toBe(true);
    expect(state.collection?.revision).toBe(1);
  });
});

describe("app/core/collection-store — stale revision and external changes", () => {
  it("returns STALE_REVISION and preserves persisted state when another tab bumped the store", () => {
    const storage = new MemoryStorage();
    const repository = createCollectionRepository({ storage });
    const store = createCollectionStore(repository);
    store.getState().boot();
    // Simulate an out-of-band write: mutate storage directly.
    const external = {
      schemaVersion: 1 as const,
      revision: 5,
      nextEntityId: 1,
      constructs: [],
      rosters: [],
      preferences: { reducedMotion: "system" as const, highContrastSquads: false },
    };
    storage.setItem("signal-loss:state", JSON.stringify(external));
    const ok = store.getState().saveConstructCreate("Alpha", snapshot);
    expect(ok).toBe(false);
    const state = store.getState();
    expect(state.lastError?.kind).toBe("STALE_REVISION");
    // In-memory state was NOT bumped — we still remember the old revision until
    // the caller decides how to react.
    expect(state.collection?.revision).toBe(0);
  });

  it("markExternallyChanged reloads state from storage", () => {
    const storage = new MemoryStorage();
    const repository = createCollectionRepository({ storage });
    const store = createCollectionStore(repository);
    store.getState().boot();
    const external = {
      schemaVersion: 1 as const,
      revision: 7,
      nextEntityId: 3,
      constructs: [],
      rosters: [],
      preferences: { reducedMotion: "reduced" as const, highContrastSquads: true },
    };
    storage.setItem("signal-loss:state", JSON.stringify(external));
    store.getState().markExternallyChanged();
    const state = store.getState();
    expect(state.collection?.revision).toBe(7);
    expect(state.collection?.preferences.reducedMotion).toBe("reduced");
  });
});

describe("app/core/collection-store — selectors only notify on relevant change", () => {
  it("does not fire a subscriber whose selection is unchanged", () => {
    const { store } = makeStore();
    const listener = vi.fn();
    // A simple selector approximation: subscribe to the whole state but
    // ignore updates unless a chosen field changed.
    let previous = store.getState().collection?.constructs.length ?? 0;
    const unsubscribe = store.subscribe((state) => {
      const current = state.collection?.constructs.length ?? 0;
      if (current !== previous) {
        previous = current;
        listener();
      }
    });
    // A preference change should NOT fire the constructs-length selector.
    store.getState().savePreferences({
      reducedMotion: "reduced",
      highContrastSquads: false,
    });
    expect(listener).toHaveBeenCalledTimes(0);
    // Adding a construct SHOULD fire it.
    store.getState().saveConstructCreate("Alpha", snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
