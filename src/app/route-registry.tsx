import * as React from "react";

/**
 * A screen registers itself by exporting `route` from `./screens/**\/route.tsx`.
 * `id` is stable — used for React keys and telemetry-safe identification.
 * `path` is a hash fragment beginning with `#` (this app runs entirely
 * client-side, so hash routing avoids server-side rewrites — NFR-7).
 */
export interface RouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly render: () => React.ReactElement;
}

interface RouteModule {
  readonly route?: unknown;
}

const FALLBACK_ID = "boot-fallback";
const FALLBACK_PATH = "#/";

const routeModules = import.meta.glob<RouteModule>("./screens/**/route.tsx", {
  eager: true,
});

/**
 * Validate that a module's `route` export satisfies the `RouteDefinition`
 * contract. Errors are informative enough to point at the offending file.
 */
function assertRouteDefinition(
  modulePath: string,
  value: unknown,
): asserts value is RouteDefinition {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      `Route module ${modulePath} must export \`route\` as an object; got ${typeof value}.`,
    );
  }
  const candidate = value as Record<string, unknown>;
  const id = candidate["id"];
  const path = candidate["path"];
  const render = candidate["render"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Route module ${modulePath} is missing a non-empty string \`id\`.`);
  }
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`Route module ${modulePath} is missing a non-empty string \`path\`.`);
  }
  if (!path.startsWith("#")) {
    throw new Error(
      `Route module ${modulePath} \`path\` must start with '#'; got ${JSON.stringify(path)}.`,
    );
  }
  if (typeof render !== "function") {
    throw new Error(`Route module ${modulePath} is missing a \`render\` function.`);
  }
}

/**
 * Pure route-discovery: sort by path lexicographically (stable), reject
 * duplicate ids or paths, and reject malformed exports. Exposed for tests so
 * later sessions can add screens without touching this file.
 */
export function discoverRoutesFromModules(
  modules: Readonly<Record<string, RouteModule>>,
): readonly RouteDefinition[] {
  const routes: RouteDefinition[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const entries = Object.entries(modules).slice().sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const [modulePath, module] of entries) {
    const candidate = module.route;
    assertRouteDefinition(modulePath, candidate);
    if (seenIds.has(candidate.id)) {
      throw new Error(
        `Duplicate route id ${JSON.stringify(candidate.id)} at ${modulePath}.`,
      );
    }
    if (seenPaths.has(candidate.path)) {
      throw new Error(
        `Duplicate route path ${JSON.stringify(candidate.path)} at ${modulePath}.`,
      );
    }
    seenIds.add(candidate.id);
    seenPaths.add(candidate.path);
    routes.push(candidate);
  }
  routes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return routes;
}

function BootFallback(): React.ReactElement {
  return (
    <main className="boot-fallback" role="main" aria-labelledby="boot-fallback-title">
      <div className="boot-fallback__wordmark" aria-hidden="true">
        <span className="boot-fallback__glyph" />
        <span className="boot-fallback__brand">SIGNAL LOSS</span>
      </div>
      <h1 id="boot-fallback-title" className="boot-fallback__title">
        SIGNAL LOSS
      </h1>
      <p className="boot-fallback__contract">
        DETERMINISTIC · NO ROLLS · NO TIMERS · INTENT IS THE ONLY UNKNOWN
      </p>
      <p className="boot-fallback__body">
        The application shell is stable; feature screens are added by later
        sessions. Nothing to load yet.
      </p>
      <p className="boot-fallback__notice">
        DESKTOP ONLY · 1280×720 MINIMUM · MOUSE + KEYBOARD
      </p>
    </main>
  );
}

const fallbackRoute: RouteDefinition = {
  id: FALLBACK_ID,
  path: FALLBACK_PATH,
  render: BootFallback,
};

const discoveredRoutes = discoverRoutesFromModules(routeModules);

/**
 * Normalize any incoming path into the canonical hash form `#/…`.
 */
export function normalizePath(path: string): string {
  if (path.length === 0) return FALLBACK_PATH;
  if (path.startsWith("#")) return path;
  if (path.startsWith("/")) return `#${path}`;
  return `#/${path}`;
}

/**
 * Deterministic route resolution: exact-path match against the ordered set,
 * else the first registered route, else the boot fallback.
 */
export function findRouteByPath(
  path: string,
  available: readonly RouteDefinition[] = discoveredRoutes,
  fallback: RouteDefinition = fallbackRoute,
): RouteDefinition {
  const target = normalizePath(path);
  for (const route of available) {
    if (route.path === target) return route;
  }
  const first = available[0];
  if (first !== undefined) return first;
  return fallback;
}

/**
 * Imperative navigation: only meaningful in the browser. In tests / SSR (no
 * window), the call is a safe no-op.
 */
export function navigate(path: string): void {
  const target = normalizePath(path);
  if (typeof window === "undefined") return;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

/**
 * React hook that returns the current route, re-rendering when the hash
 * changes. Used by the root component so navigation is a plain hash change.
 */
export function useCurrentRoute(): RouteDefinition {
  const [hash, setHash] = React.useState<string>(() => {
    if (typeof window === "undefined") return FALLBACK_PATH;
    return window.location.hash.length > 0 ? window.location.hash : FALLBACK_PATH;
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onHashChange(): void {
      setHash(window.location.hash.length > 0 ? window.location.hash : FALLBACK_PATH);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return findRouteByPath(hash);
}

/**
 * Read-only view of the currently discovered routes. Later sessions must not
 * mutate this; new routes appear only by adding a `screens/**\/route.tsx`
 * module.
 */
export const registeredRoutes: readonly RouteDefinition[] = discoveredRoutes;

/**
 * The always-available fallback route, exported so tests can pin the exact
 * boot-time UI without spinning up React.
 */
export const bootFallbackRoute: RouteDefinition = fallbackRoute;
