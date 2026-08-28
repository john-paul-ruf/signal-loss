/**
 * React context wrapping a MatchStore instance so components can read
 * slices via `useMatchStore`. Isolating the context here keeps the
 * store creation-free at import time — the shell provides one instance
 * per route mount, disposed at unmount.
 */

import * as React from "react";
import type { StoreApi } from "zustand/vanilla";
import type { MatchStore } from "./match-store";

const MatchStoreContext = React.createContext<StoreApi<MatchStore> | null>(null);

export interface MatchStoreProviderProps {
  readonly store: StoreApi<MatchStore>;
  readonly children: React.ReactNode;
}

export function MatchStoreProvider(
  props: MatchStoreProviderProps,
): React.ReactElement {
  return (
    <MatchStoreContext.Provider value={props.store}>
      {props.children}
    </MatchStoreContext.Provider>
  );
}

function useMatchStoreApi(): StoreApi<MatchStore> {
  const value = React.useContext(MatchStoreContext);
  if (value === null) {
    throw new Error(
      "useMatchStore called outside MatchStoreProvider — the shell is missing.",
    );
  }
  return value;
}

/**
 * Minimal `useSyncExternalStore` wrapper. React re-renders only if the
 * selected slice value changes by reference (or by `equal` if given).
 */
export function useMatchStore<T>(
  selector: (state: MatchStore) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useMatchStoreApi();
  const getSnapshot = React.useCallback((): T => selector(store.getState()), [selector, store]);
  const subscribe = React.useCallback(
    (onChange: () => void): (() => void) => store.subscribe(onChange),
    [store],
  );
  const value = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const cache = React.useRef<{ has: boolean; value: T }>({ has: false, value } as { has: boolean; value: T });
  if (!cache.current.has) {
    cache.current = { has: true, value };
    return value;
  }
  if (equal(cache.current.value, value)) {
    return cache.current.value;
  }
  cache.current = { has: true, value };
  return value;
}

/**
 * Escape hatch — most callers should use `useMatchStore(selector)`.
 * Suitable for imperative actions.
 */
export function useMatchStoreActions(): MatchStore {
  const store = useMatchStoreApi();
  const [state, setState] = React.useState<MatchStore>(store.getState);
  React.useEffect(() => store.subscribe((s) => setState(s)), [store]);
  return state;
}
