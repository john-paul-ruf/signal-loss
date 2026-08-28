import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Navigation store — hash-based routing model kept in memory. Screens
 * subscribe to the current path via a narrow selector; screen mounting
 * itself is done by the react tree, not by this store.
 *
 * The store never touches `window` directly — the browser adapter passes
 * the current hash in and calls `navigate` to publish.
 */
export interface NavigationState {
  readonly currentPath: string;
  readonly navigationCount: number;
}

export interface NavigationActions {
  navigate(path: string): void;
  hashChanged(path: string): void;
}

export type NavigationStore = NavigationState & NavigationActions;

/**
 * Callbacks the store publishes when navigation is requested. In production
 * the browser adapter maps `navigate` to `window.location.hash = ...`.
 */
export interface NavigationOptions {
  readonly initialPath?: string;
  readonly requestNavigation?: (path: string) => void;
}

export function createNavigationStore(
  options: NavigationOptions = {},
): StoreApi<NavigationStore> {
  const initial = options.initialPath ?? "#/";
  const request = options.requestNavigation;
  return createStore<NavigationStore>((set, get) => ({
    currentPath: initial,
    navigationCount: 0,
    navigate(path: string): void {
      const normalized = normalizeHashPath(path);
      if (request !== undefined) request(normalized);
      if (normalized !== get().currentPath) {
        set({ currentPath: normalized, navigationCount: get().navigationCount + 1 });
      }
    },
    hashChanged(path: string): void {
      const normalized = normalizeHashPath(path);
      if (normalized !== get().currentPath) {
        set({ currentPath: normalized, navigationCount: get().navigationCount + 1 });
      }
    },
  }));
}

/** Canonicalize any incoming path into `#/…`. Public so tests can pin it. */
export function normalizeHashPath(path: string): string {
  if (path.length === 0) return "#/";
  if (path.startsWith("#")) return path;
  if (path.startsWith("/")) return `#${path}`;
  return `#/${path}`;
}
