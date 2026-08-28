import * as React from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import {
  createCollectionRepository,
  preloadMigrationModule,
  type ChangeEventTarget,
  type CollectionRepositoryOptions,
  type StorageLike,
} from "../../../platform/index";
import { createCollectionStore, type CollectionStore } from "../core/index";

/**
 * Resolve the browser's localStorage as a full `StorageLike` (getItem +
 * setItem + removeItem). Some privacy modes throw on the getter itself, so the
 * access is guarded; a null result means the app runs without persistence.
 */
function resolveStorageLike(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    const local = window.localStorage;
    return local ?? null;
  } catch {
    return null;
  }
}

/**
 * Async persistence wiring for the collection surface. The migration module is
 * preloaded once (SESSION-02 handoff) before any repository is created, then
 * the core collection store is booted. If browser storage is absent the store
 * runs over an in-memory adapter so the build zone is still usable this
 * session — the UI reports persistence unavailable via `persistenceUnavailable`
 * rather than silently dropping saves (FR-6).
 */

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export interface CollectionBinding {
  readonly store: StoreApi<CollectionStore>;
  readonly persistenceUnavailable: boolean;
}

const CollectionContext = React.createContext<CollectionBinding | null>(null);

export interface CollectionProviderProps {
  readonly children: React.ReactNode;
  readonly fallback: React.ReactElement;
}

export function CollectionProvider(props: CollectionProviderProps): React.ReactElement {
  const [binding, setBinding] = React.useState<CollectionBinding | null>(null);
  React.useEffect(() => {
    let alive = true;
    void (async (): Promise<void> => {
      await preloadMigrationModule();
      const browser = resolveStorageLike();
      const storage: StorageLike = browser ?? createMemoryStorage();
      const options: CollectionRepositoryOptions =
        typeof window !== "undefined"
          ? { storage, changeSource: window as unknown as ChangeEventTarget }
          : { storage };
      const store = createCollectionStore(createCollectionRepository(options));
      store.getState().boot();
      if (alive) setBinding({ store, persistenceUnavailable: browser === null });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (binding === null) return props.fallback;
  return (
    <CollectionContext.Provider value={binding}>{props.children}</CollectionContext.Provider>
  );
}

export function useCollectionBinding(): CollectionBinding {
  const binding = React.useContext(CollectionContext);
  if (binding === null) {
    throw new Error("useCollectionBinding must be used inside a CollectionProvider");
  }
  return binding;
}

/** Subscribe to a narrow slice of the collection store (FR-6 narrow selectors). */
export function useCollection<T>(selector: (state: CollectionStore) => T): T {
  const { store } = useCollectionBinding();
  return useStore(store, selector);
}
