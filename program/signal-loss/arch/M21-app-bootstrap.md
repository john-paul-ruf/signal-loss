# M21 — App bootstrap and styles

> **Path:** exact app-shell files
> **Imports from:** M20 via route discovery
> **Status:** shipped in SESSION-01. Later UI sessions add route modules only; the single shell exception since is `match-setup-route` SESSION-01's minimal `FlowStoreProvider` mount in `./src/app/main.tsx` (the provider itself is an M17 artifact).

## Public API

- React mount and root error boundary.
- Hash/navigation route discovery for `./src/app/screens/**/route.tsx`.
- Global Tailwind theme, self-hosted fonts, CSP, PWA manifest, and desktop fallback.

Route discovery contract (`./src/app/route-registry.tsx`) — later UI sessions add screens by exporting a `route` constant from `./src/app/screens/**/route.tsx`:

```ts
export interface RouteDefinition {
  readonly id: string;
  readonly path: string; // must start with "#"
  readonly render: () => React.ReactElement;
}
export function navigate(path: string): void;
export function useCurrentRoute(): RouteDefinition;
export function discoverRoutesFromModules(
  modules: Readonly<Record<string, { route?: unknown }>>,
): readonly RouteDefinition[];
export function findRouteByPath(
  path: string,
  available?: readonly RouteDefinition[],
  fallback?: RouteDefinition,
): RouteDefinition;
export function normalizePath(path: string): string;
export const registeredRoutes: readonly RouteDefinition[];
export const bootFallbackRoute: RouteDefinition;
```

Duplicate ids or paths throw at module load. Routes are sorted by lexicographic path. Boot fallback renders when nothing is registered and is designed to be legible below 1280px (NFR-4 statement, not a reflow).

## Internal Structure

| Area | Path |
|---|---|
| Document | `./index.html` |
| Mount | `./src/app/main.tsx` |
| Route discovery | `./src/app/route-registry.tsx` |
| Theme | `./src/app/styles.css` |
| Vector icon | `./public/icon.svg` |
| Vite environment types | `./src/vite-env.d.ts` |

## Conventions and Invariants

- These files stabilize in Session 01; later UI sessions add route modules only, never edit the shell. The one sanctioned shell edit since is `match-setup-route` SESSION-01's `FlowStoreProvider` wrap of `<App />` in `./src/app/main.tsx` (below `ErrorBoundary`, inside `StrictMode`) — an app-lifetime state owner from M17, not a route, theme, or CSP change.
- No CDN script, font, or runtime fetch.
- CSP `connect-src` remains `none`.
- Production HTML injects the strict CSP via a Vite build-only plugin (`./vite.config.ts` → `cspMetaPlugin`) so dev HMR keeps working while the shipped bundle carries `connect-src 'none'`.
- Self-hosted fonts land at `./src/app/styles.css` via `@fontsource` imports under `@import "tailwindcss"` — every design token from `./specs/design.md` lives in the `@theme` block.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-01 shipped `./index.html`, `./src/app/main.tsx`, `./src/app/route-registry.tsx`, `./src/app/styles.css`, `./public/icon.svg`, and the build-time CSP plugin; self-hosted Chakra Petch + IBM Plex Mono fonts. |
| 2026-08-28 | `match-setup-route` SESSION-01 wrapped `<App />` in `FlowStoreProvider` inside `./src/app/main.tsx` (5-line additive mount below `ErrorBoundary`, within `StrictMode`); `./src/app/route-registry.tsx` and the rest of the shell unchanged. Provider defined in M17. |
