/**
 * Browser capability probes. Every probe:
 *   - Is pure, taking dependency-injected inputs so tests never touch a real
 *     `window`.
 *   - Returns a plain value (no throwing, no null-typed defaults).
 *   - Resolves user preference (persisted) before OS/media-query default.
 *
 * The reduced-motion contract, in order of decreasing authority:
 *   1. persisted preference of "reduced" or "full"
 *   2. `(prefers-reduced-motion: reduce)` media query
 *   3. false (motion allowed)
 */

import type { ReducedMotionPreferenceV1 } from "./storage/index";

/** The exact viewport contract (NFR-4): 1280×720 minimum. */
export const MIN_VIEWPORT_WIDTH = 1280;
export const MIN_VIEWPORT_HEIGHT = 720;

/** Injectable media-query resolver. In production, this is `window.matchMedia`. */
export interface MatchMediaLike {
  (query: string): { readonly matches: boolean };
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * True if the viewport meets both minimum dimensions. Below either → the
 * app shows the desktop-only gate (design.md §5.0).
 */
export function meetsDesktopViewport(size: ViewportSize): boolean {
  return size.width >= MIN_VIEWPORT_WIDTH && size.height >= MIN_VIEWPORT_HEIGHT;
}

/**
 * Read the current viewport size defensively. If no window global is
 * available (SSR / test), returns `{ width: 0, height: 0 }` — the caller
 * uses `meetsDesktopViewport` to interpret this as "gate the app".
 */
export function readViewportSize(): ViewportSize {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return {
    width: Math.max(0, window.innerWidth ?? 0),
    height: Math.max(0, window.innerHeight ?? 0),
  };
}

/**
 * Resolve reduced-motion preference. Persisted preference wins; media query
 * is fallback; final fallback is motion-on.
 */
export function resolveReducedMotion(
  persisted: ReducedMotionPreferenceV1,
  matchMedia: MatchMediaLike | null,
): boolean {
  if (persisted === "reduced") return true;
  if (persisted === "full") return false;
  if (matchMedia === null) return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Resolve the browser's `matchMedia` if available. Non-DOM environments
 * return null.
 */
export function resolveMatchMedia(): MatchMediaLike | null {
  if (typeof window === "undefined") return null;
  const record = window as { matchMedia?: MatchMediaLike };
  const mm = record.matchMedia;
  if (typeof mm !== "function") return null;
  return (query: string) => mm.call(window, query);
}

/**
 * Storage capability probe. Called ONCE by the boot path; the result is
 * carried in the app store so retries don't repeatedly perform the
 * side-effectful setItem/removeItem probe.
 */
export interface StorageProbeResult {
  readonly available: boolean;
  readonly cause?: unknown;
}

export interface StorageProbeInput {
  readonly key: string;
  readonly storage: {
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  } | null;
}

export function probeStorageAvailability(input: StorageProbeInput): StorageProbeResult {
  const { storage, key } = input;
  if (storage === null) return { available: false };
  const probeKey = key + ":__probe__";
  try {
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return { available: true };
  } catch (cause) {
    return { available: false, cause };
  }
}

/**
 * Resolve the browser's localStorage safely. In environments where accessing
 * `window.localStorage` throws (some privacy modes throw on the getter itself),
 * we catch and return null so the caller falls back to non-persisted mode.
 */
export function resolveBrowserStorage(): StorageProbeInput["storage"] {
  if (typeof window === "undefined") return null;
  try {
    const local = window.localStorage;
    if (local === undefined || local === null) return null;
    return local;
  } catch {
    return null;
  }
}
