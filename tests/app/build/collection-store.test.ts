import { beforeAll, describe, expect, it } from "vitest";
import {
  createCollectionRepository,
  preloadMigrationModule,
  type StorageLike,
} from "../../../src/platform/index";
import { createCollectionStore } from "../../../src/app/store/core/index";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import { prebuiltToSnapshots } from "../../../src/app/store/build/collection-model";

/**
 * Integration test over the REAL CollectionRepository + DB-owned migration +
 * core collection store, using an in-memory StorageLike (no browser). Covers
 * repository outcomes the collection surface depends on: boot, local
 * round-trip, delete, no-silent-repair on corruption, and armed reset.
 */
const STORAGE_KEY = "signal-loss:state";

function memoryStorage(seed?: string): StorageLike {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(STORAGE_KEY, seed);
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

beforeAll(async () => {
  await preloadMigrationModule();
});

describe("collection store integration", () => {
  it("boots an empty store to a valid v1 document", () => {
    const store = createCollectionStore(createCollectionRepository({ storage: memoryStorage() }));
    store.getState().boot();
    const state = store.getState();
    expect(state.hasBooted).toBe(true);
    expect(state.corrupt).toBe(false);
    expect(state.collection?.rosters).toEqual([]);
  });

  it("round-trips a saved roster across a fresh store on the same storage", () => {
    const storage = memoryStorage();
    const catalog = resolveCatalog();
    const snapshots = [...prebuiltToSnapshots(catalog.prebuilts[0]!)];

    const first = createCollectionStore(createCollectionRepository({ storage }));
    first.getState().boot();
    expect(first.getState().saveRosterCreate("LONG DARK", 100, snapshots)).toBe(true);
    expect(first.getState().collection?.rosters.length).toBe(1);

    const second = createCollectionStore(createCollectionRepository({ storage }));
    second.getState().boot();
    expect(second.getState().collection?.rosters[0]?.name).toBe("LONG DARK");
  });

  it("deletes exactly one record without cascading", () => {
    const storage = memoryStorage();
    const store = createCollectionStore(createCollectionRepository({ storage }));
    store.getState().boot();
    store.getState().saveRosterCreate("A", 25, []);
    store.getState().saveRosterCreate("B", 25, []);
    const id = store.getState().collection?.rosters[0]?.id;
    expect(id).toBeDefined();
    if (id !== undefined) expect(store.getState().deleteEntity(id)).toBe(true);
    expect(store.getState().collection?.rosters.length).toBe(1);
  });

  it("reports corruption without silently repairing, and armed reset recovers", () => {
    const store = createCollectionStore(
      createCollectionRepository({ storage: memoryStorage("this is not json") }),
    );
    store.getState().boot();
    expect(store.getState().corrupt).toBe(true);
    // No silent repair: the in-memory collection is NOT replaced with empty.
    expect(store.getState().collection).toBeUndefined();
    expect(store.getState().corruptRaw).toBe("this is not json");
    expect(store.getState().resetCorruptStore()).toBe(true);
    expect(store.getState().corrupt).toBe(false);
    expect(store.getState().collection?.rosters).toEqual([]);
  });
});
