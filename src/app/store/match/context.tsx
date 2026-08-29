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
 * One memoized snapshot. Keyed by selector, equality function, and store
 * state identity so a selector that derives a fresh array/object (e.g.
 * `selectHumanConstructs`) still yields a stable reference across renders
 * of one unchanged store state — the identity contract
 * `useSyncExternalStore` requires.
 */
interface SnapshotCache<T> {
  readonly selector: (state: MatchStore) => T;
  readonly equal: (left: T, right: T) => boolean;
  readonly state: MatchStore;
  readonly value: T;
}

/**
 * Minimal `useSyncExternalStore` wrapper. React re-renders only if the
 * selected slice value changes by reference (or by `equal` if given).
 *
 * The `getSnapshot` passed to React must be referentially stable for an
 * unchanged store state, so the cache lives inside the getter (not after
 * it). A derived selector returning a new array each call would otherwise
 * make React see a changed snapshot every render and loop.
 */
export function useMatchStore<T>(
  selector: (state: MatchStore) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useMatchStoreApi();
  const cache = React.useRef<SnapshotCache<T> | null>(null);
  const getSnapshot = React.useCallback((): T => {
    const state = store.getState();
    const prior = cache.current;
    if (
      prior !== null &&
      prior.selector === selector &&
      prior.equal === equal &&
      prior.state === state
    ) {
      return prior.value;
    }
    const next = selector(state);
    if (
      prior !== null &&
      prior.selector === selector &&
      prior.equal === equal &&
      equal(prior.value, next)
    ) {
      // Value is unchanged by the caller's equality — keep the prior
      // reference but advance the cached state so identity stays stable.
      cache.current = { selector, equal, state, value: prior.value };
      return prior.value;
    }
    cache.current = { selector, equal, state, value: next };
    return next;
  }, [store, selector, equal]);
  const subscribe = React.useCallback(
    (onChange: () => void): (() => void) => store.subscribe(onChange),
    [store],
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
