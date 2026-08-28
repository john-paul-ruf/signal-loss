# M21 — App bootstrap and styles

> **Path:** `exact app-shell files`
> **Imports from:** M20 via route discovery
> **Status:** planned for full v1

## Public API
- React mount and error boundary
- Hash/navigation route discovery for ./src/app/screens/**/route.tsx
- Global Tailwind theme, self-hosted fonts, CSP, PWA manifest, and desktop fallback

## Internal Structure

| Area | Path |
|---|---|
| Document | `./index.html` |
| Mount | `./src/app/main.tsx` |
| Route discovery | `./src/app/route-registry.tsx` |
| Theme | `./src/app/styles.css` |
| Vector icon | `./public/icon.svg` |

## Conventions and Invariants
- These files stabilize in Session 01; later UI sessions add route modules only.
- No CDN script, font, or runtime fetch.
- CSP connect-src remains none.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
