/**
 * App-lifetime React owner for the transient {@link FlowStore}. The store
 * itself stays creation-free at import time (see `./flow-store.ts`); this
 * provider mounts exactly one instance so every hash route — setup and
 * match added by later sessions — reads the same in-flight launch/result
 * value across a hash transition.
 *
 * The store is ephemeral by contract: it never writes to `localStorage`,
 * and this seam adds no launch fields — the backward-incompatible contract
 * change lands atomically with its consumers in a later session.
 */

import * as React from "react";
import type { StoreApi } from "zustand/vanilla";
import { createFlowStore, type FlowStore } from "./flow-store";

const FlowStoreContext = React.createContext<StoreApi<FlowStore> | null>(null);

export interface FlowStoreProviderProps {
  readonly children: React.ReactNode;
  /** Injected store for tests; production mounts a fresh instance per provider. */
  readonly store?: StoreApi<FlowStore>;
}

export function FlowStoreProvider(
  props: FlowStoreProviderProps,
): React.ReactElement {
  const createdRef = React.useRef<StoreApi<FlowStore> | null>(null);
  if (props.store === undefined && createdRef.current === null) {
    createdRef.current = createFlowStore();
  }
  const store = props.store ?? createdRef.current;
  return (
    <FlowStoreContext.Provider value={store}>
      {props.children}
    </FlowStoreContext.Provider>
  );
}

/**
 * Imperative escape hatch — the raw store handle for actions and tests.
 * Throws when called outside {@link FlowStoreProvider}; never silently
 * spins up a second store.
 */
export function useFlowStoreApi(): StoreApi<FlowStore> {
  const value = React.useContext(FlowStoreContext);
  if (value === null) {
    throw new Error(
      "useFlowStore called outside FlowStoreProvider — wrap the app tree in <FlowStoreProvider>.",
    );
  }
  return value;
}

/**
 * Minimal `useSyncExternalStore` wrapper. React re-renders only when the
 * selected slice changes by reference (or by `equal` if given).
 */
export function useFlowStore<T>(
  selector: (state: FlowStore) => T,
  equal: (left: T, right: T) => boolean = Object.is,
): T {
  const store = useFlowStoreApi();
  const getSnapshot = React.useCallback(
    (): T => selector(store.getState()),
    [selector, store],
  );
  const subscribe = React.useCallback(
    (onChange: () => void): (() => void) => store.subscribe(onChange),
    [store],
  );
  const value = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const cache = React.useRef<{ has: boolean; value: T }>({
    has: false,
    value,
  } as { has: boolean; value: T });
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
