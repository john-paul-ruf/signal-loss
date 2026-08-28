# M18 — Board renderer

> **Path:** `./src/app/board/`
> **Imports from:** M10, M17
> **Status:** shipped in SESSION-08.

## Public API

```ts
// camera.ts — one linear transform shared by three canvases
fitCamera(bounds, viewport, paddingPx=12): Camera;
worldToScreenX / worldToScreenY / screenToWorldX / screenToWorldY / snapPointerToFx / boundsAabb / worldDistanceOnScreen;

// scene.ts — pure layout, no painting
buildBoardScene(pv, catalog, camera): BoardScene;   // terrain + constructs
buildTerrainScene(pv, round): TerrainScene;         // walls + bounds + spawn + traceStep + nextTraceStep
buildConstructScene(pv, catalog): ConstructScene[]; // per-construct facts (footprint, dial, damage, range, ghost, drift, isCommander)
extractShotLines(events, constructScenes): OverlayScene["shots"];
measureLabel(cam, a, b): { midX, midY, lengthFx, screenLenPx };

// hit-test.ts — arithmetic only, sorted-by-id tiebreak
pickConstruct(cam, constructs, sx, sy, footprintFx): ConstructId | null;
pickExactConstructAt(constructs, wx, wy): ConstructId | null;
pointInPolygonScreen(cam, polygon, sx, sy): boolean;

// squad-visual.ts — five distinct (lightness, glyph, pattern, tag) tuples (NFR-5)
visualFor(SquadId): SquadVisual;
highContrastLightness(v): string;
separabilityTriples(): readonly { squad, lightness, glyph, pattern }[];

// input/ — path editing
appendWaypoint / dropLastWaypoint / simplifyPath (RDP) / pathLengthFx / clampPathToAllowance;
reachOutlineOf(construct, catalog, sides=24): Vec2[];  // outer bound from PUBLIC stats only

// playback/ — reduced-motion parity
toCard(event, index): EventCard;            // every engine event kind has a card representation
everyKindCovered(kind): 1;                  // compile-time exhaustiveness guard
beatDurationMs(event, speed 1|2|4): number; // positive; scales inversely with speed

// layers/ — three stacked canvases with independent redraw triggers
paintTerrain(ctx, scene, cam);                       // redraws on map change
paintField(ctx, scenes, cam, { highContrast });      // redraws on engine revision
paintOverlay(ctx, scene, cam);                       // redraws on pointer / selection / playback cursor

BoardCanvas: React component with three <canvas> layers + AccessibleBoardTree.
AccessibleBoardTree: focusable DOM equivalent for every construct (own / enemy / ghost / destroyed).
```

## Internal Structure

| Area | Path |
|---|---|
| Camera | `./src/app/board/camera.ts` |
| Scene | `./src/app/board/scene.ts` |
| Hit-test | `./src/app/board/hit-test.ts` |
| Squad visual | `./src/app/board/squad-visual.ts` |
| Layers | `./src/app/board/layers/` |
| Input | `./src/app/board/input/` |
| Playback | `./src/app/board/playback/` |
| Accessibility | `./src/app/board/accessible-tree.tsx` |

## Conventions and Invariants

- **Three stacked `<canvas>` layers share one camera transform.** Terrain redraws on map / engine-revision change; field redraws on engine-revision; overlay redraws on pointer / selection / playback cursor. Hit-testing is arithmetic (inverse camera + fx distance), never pixel-read.
- **`snapPointerToFx`** rounds every pointer position to integer fx so drafts stay hash-stable across replays.
- **Pre-render glow and hatch/dither patterns; avoid per-frame `shadowBlur`.**
- **Squad separability (NFR-5):** each of the five squads has a distinct `(lightness, glyph, pattern, tag)` tuple. `separabilityTriples()` proves five distinct triples exist — meeting the color-blind requirement without any color channel.
- **Reduced-motion parity (FR-26):** `toCard(event, i)` covers every event kind — `everyKindCovered(kind): 1` is a TypeScript exhaustive switch that fails to compile if a new kind ships without a card. A runtime test iterates every kind and asserts `title` and `detail` are non-empty.
- **Reach outline is an outer bound.** `reachOutlineOf` samples a circle from chassis footprint + current dial allowance; walls are NOT respected in the outline (deliberate). The engine's `legalMovePlot` refuses wall-crossing paths at commit time.
- **Browser requirements.** Board canvas requires `ResizeObserver` + Canvas 2D; jsdom would need mocks — validated end-to-end via Playwright.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-08 shipped `./src/app/board/**` — camera + three-layer canvas scene + arithmetic hit-testing + squad identity + path input + reach overlay + accessible tree + event-card playback with compile-time exhaustive kind coverage. |
