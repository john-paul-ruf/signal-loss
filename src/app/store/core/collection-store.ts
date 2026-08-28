import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  CollectionRepository,
  PersistedStateV1,
  RepositoryError,
} from "../../../platform/index";

/**
 * The collection store — persistence-facing state read once at boot and
 * kept in memory. All normal reads hit `state.collection`; a mutation goes
 * through the repository, then writes back on success.
 *
 * We keep the raw `state` PLUS a `lastError` so failed writes surface to
 * the UI. Errors are not toasted from here — the app store layer decides
 * how to present.
 */
export interface CollectionStoreState {
  /**
   * Loaded persisted state. Undefined until the first `load()` succeeds; a
   * failed load leaves this undefined so consumers guard the boot path.
   */
  readonly collection: PersistedStateV1 | undefined;
  /** The most recent repository error, or null if the last op succeeded. */
  readonly lastError: RepositoryError | null;
  /** True if the boot load has been attempted. */
  readonly hasBooted: boolean;
  /** True if we are running without persistence (STORAGE_UNAVAILABLE). */
  readonly persistenceUnavailable: boolean;
  /** True if the store was found in a corrupt state; the UI shows recovery. */
  readonly corrupt: boolean;
  /** Raw corrupt string, preserved verbatim for the recovery surface. */
  readonly corruptRaw: string | null;
}

export interface CollectionActions {
  boot(): void;
  refresh(): void;
  saveConstructUpdate(
    name: string,
    id: PersistedStateV1["constructs"][number]["id"],
    snapshot: PersistedStateV1["constructs"][number]["construct"],
  ): boolean;
  saveConstructCreate(
    name: string,
    snapshot: PersistedStateV1["constructs"][number]["construct"],
  ): boolean;
  saveRosterUpdate(
    name: string,
    id: PersistedStateV1["rosters"][number]["id"],
    budget: number,
    snapshots: readonly PersistedStateV1["constructs"][number]["construct"][],
  ): boolean;
  saveRosterCreate(
    name: string,
    budget: number,
    snapshots: readonly PersistedStateV1["constructs"][number]["construct"][],
  ): boolean;
  renameEntity(id: PersistedStateV1["constructs"][number]["id"] | PersistedStateV1["rosters"][number]["id"], newName: string): boolean;
  duplicateEntity(id: PersistedStateV1["constructs"][number]["id"] | PersistedStateV1["rosters"][number]["id"], copyName: string): boolean;
  deleteEntity(id: PersistedStateV1["constructs"][number]["id"] | PersistedStateV1["rosters"][number]["id"]): boolean;
  savePreferences(preferences: PersistedStateV1["preferences"]): boolean;
  resetCorruptStore(): boolean;
  markExternallyChanged(): void;
}

export type CollectionStore = CollectionStoreState & CollectionActions;

const INITIAL_STATE: CollectionStoreState = {
  collection: undefined,
  lastError: null,
  hasBooted: false,
  persistenceUnavailable: false,
  corrupt: false,
  corruptRaw: null,
};

/**
 * Build a Zustand vanilla store bound to a repository. The store never
 * touches the browser directly — everything flows through the injected
 * repository so tests can construct one with a memory adapter.
 *
 * `markExternallyChanged` is invoked by the subscribeToExternalChange
 * plumbing so a background write (another tab) invalidates in-memory state
 * and the UI can prompt reload.
 */
export function createCollectionStore(
  repository: CollectionRepository,
): StoreApi<CollectionStore> {
  return createStore<CollectionStore>((set, get) => ({
    ...INITIAL_STATE,
    boot(): void {
      if (get().hasBooted) return;
      const result = repository.load();
      applyLoadResult(set, result);
      set({ hasBooted: true });
    },
    refresh(): void {
      const result = repository.load();
      applyLoadResult(set, result);
    },
    saveConstructUpdate(name, id, snapshot): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.saveConstruct({
        expectedRevision: revision,
        name,
        snapshot,
        id,
      });
      return applyMutationResult(set, result);
    },
    saveConstructCreate(name, snapshot): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.saveConstruct({
        expectedRevision: revision,
        name,
        snapshot,
      });
      return applyMutationResult(set, result);
    },
    saveRosterUpdate(name, id, budget, snapshots): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.saveRoster({
        expectedRevision: revision,
        name,
        id,
        budget,
        snapshots,
      });
      return applyMutationResult(set, result);
    },
    saveRosterCreate(name, budget, snapshots): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.saveRoster({
        expectedRevision: revision,
        name,
        budget,
        snapshots,
      });
      return applyMutationResult(set, result);
    },
    renameEntity(id, newName): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.renameEntity({
        expectedRevision: revision,
        id,
        newName,
      });
      return applyMutationResult(set, result);
    },
    duplicateEntity(id, copyName): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.duplicateEntity({
        expectedRevision: revision,
        id,
        copyName,
      });
      return applyMutationResult(set, result);
    },
    deleteEntity(id): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.deleteEntity({
        expectedRevision: revision,
        id,
        confirmed: true,
      });
      return applyMutationResult(set, result);
    },
    savePreferences(preferences): boolean {
      const revision = get().collection?.revision;
      if (revision === undefined) return false;
      const result = repository.savePreferences({
        expectedRevision: revision,
        preferences,
      });
      return applyMutationResult(set, result);
    },
    resetCorruptStore(): boolean {
      const result = repository.resetCorruptStore(true);
      if (result.ok) {
        set({
          collection: result.value,
          lastError: null,
          corrupt: false,
          corruptRaw: null,
          persistenceUnavailable: false,
        });
        return true;
      }
      const error: RepositoryError = result.error;
      set({ lastError: error });
      return false;
    },
    markExternallyChanged(): void {
      // Refresh so cached state and the store are back in sync.
      const result = repository.load();
      applyLoadResult(set, result);
    },
  }));
}

type SetFn = StoreApi<CollectionStore>["setState"];

function applyLoadResult(
  set: SetFn,
  result: ReturnType<CollectionRepository["load"]>,
): void {
  if (result.ok) {
    set({
      collection: result.value,
      lastError: null,
      corrupt: false,
      corruptRaw: null,
      persistenceUnavailable: false,
    });
    return;
  }
  const error = result.error;
  const persistenceUnavailable = error.kind === "STORAGE_UNAVAILABLE";
  const isCorrupt =
    error.kind === "MALFORMED_JSON" ||
    error.kind === "INVALID_SCHEMA" ||
    error.kind === "UNSUPPORTED_VERSION" ||
    error.kind === "MIGRATION_FAILED";
  const corruptRaw = "raw" in error ? error.raw : null;
  set({
    lastError: error,
    persistenceUnavailable,
    corrupt: isCorrupt,
    corruptRaw: isCorrupt ? corruptRaw : null,
  });
}

function applyMutationResult(
  set: SetFn,
  result: ReturnType<CollectionRepository["saveConstruct"]>,
): boolean {
  if (result.ok) {
    set({ collection: result.value, lastError: null });
    return true;
  }
  set({ lastError: result.error });
  return false;
}
