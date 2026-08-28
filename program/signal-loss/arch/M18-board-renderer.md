# M18 — Board renderer

> **Path:** `./src/app/board/`
> **Imports from:** M10, M17
> **Status:** planned for full v1

## Public API
- Layered scene renderer, camera transform, arithmetic hit-testing, and pointer controller
- SquadIdentity value object and accessible board mirror
- Playback event transport plus reduced-motion representation inputs

## Internal Structure

| Area | Path |
|---|---|
| Scene | `./src/app/board/scene.ts` |
| Layers | `./src/app/board/layers/` |
| Interaction | `./src/app/board/input/` |
| Accessibility | `./src/app/board/accessible-tree.tsx` |

## Conventions and Invariants
- Terrain redraws only on map change; overlay redraws on pointer events.
- Pre-render glow and hatch/dither patterns; avoid per-frame shadowBlur.
- Squad identity always combines lightness, glyph, pattern, and tag.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
