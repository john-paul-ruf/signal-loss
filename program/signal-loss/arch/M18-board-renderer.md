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

<!-- SESSION-08 -->

## SESSION-08 arch delta — Match shell, board, plotting, playback shipped

### M18 (src/app/board/**) — public surface, as shipped

```ts
// camera.ts — one linear transform shared by three canvases
fitCamera(bounds, viewport, paddingPx=12): Camera;
worldToScreenX/Y, screenToWorldX/Y, snapPointerToFx, boundsAabb, worldDistanceOnScreen;

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

// squad-visual.ts — five distinct (lightness, glyph, pattern, tag) tuples
visualFor(SquadId): SquadVisual;
highContrastLightness(v): string;
separabilityTriples(): readonly { squad, lightness, glyph, pattern }[];

// input/ — path editing
appendWaypoint / dropLastWaypoint / simplifyPath (RDP) / pathLengthFx / clampPathToAllowance;
reachOutlineOf(construct, catalog, sides=24): Vec2[];  // outer bound from PUBLIC stats only

// playback/ — reduced-motion parity
toCard(event, index): EventCard;                    // every engine event kind has a card representation
everyKindCovered(kind): 1;                          // compile-time exhaustiveness guard
beatDurationMs(event, speed 1|2|4): number;         // positive; scales inversely with speed

// layers/ — three stacked canvases with independent redraw triggers
paintTerrain(ctx, scene, cam);                       // redraws on map change
paintField(ctx, scenes, cam, { highContrast });      // redraws on engine revision
paintOverlay(ctx, scene, cam);                       // redraws on pointer / selection / playback cursor

BoardCanvas: React component with three <canvas> layers + AccessibleBoardTree.
AccessibleBoardTree: focusable DOM equivalent for every construct (own / enemy / ghost / destroyed).
```


### Conventions and invariants (session-shipped decisions)

- **Information contract (FR-24):** AI worker requests carry `PublicState` only. The
  match store's `resolveMovement`/`resolveAttack` build committed `SquadMovePlots` and
  `SquadAttackPlot` values from the human draft slice + the AI's READY slot payload.
  Drafts NEVER appear as fields on `MatchState`. Structural asserts in
  `tests/app/match/match-store.test.ts` prove the whitelist.
- **Determinism (FR-29):** the AI worker client is a pure request/response
  passthrough. Two calls with identical `(seed, streamLabel, ...)` produce
  byte-identical request envelopes and, given the worker's determinism guarantee,
  byte-identical responses. Cancellation is a caller-side concern only; the
  eventual worker response is swallowed rather than dropped mid-flight.
- **No timer / no wall clock:** every playback beat is a discrete engine `Event`.
  Beat durations are looked up from a static per-kind table scaled by a
  discrete speed multiplier (1×/2×/4×). The store carries no field named
  `timer`, `deadline`, `elapsed`, `msRemaining`, `startTs`, or `timeout`
  (asserted). Reduced-motion mode bypasses `setTimeout` entirely — the arrow
  keys advance the cursor.
- **No engine mutation during playback:** the playback slice's `cursor`
  advances through the pre-committed event buffer; `engine` remains
  identically referentially equal (asserted). `playbackFinish` swaps
  `engine` for the pre-computed `afterSnapshot` in one set.
- **Selector isolation:** pointer-only slice writes (hoverWaypoint,
  hoverTarget, selectConstruct on the same id) do not touch the drafts,
  ai, or engine slice. Asserted by identity comparisons on the whole
  match store.
- **Board rendering:** three stacked <canvas> layers share one camera
  transform. Terrain redraws on map / engine-revision change; field
  redraws on engine-revision; overlay redraws on pointer / selection /
  playback cursor. Hit-testing is arithmetic (inverse camera + fx
  distance), never pixel-read. `snapPointerToFx` rounds every pointer
  position to integer fx so drafts stay hash-stable across replays.
- **Squad separability:** each of the five squads has a distinct
  (lightness, glyph, pattern, tag) tuple. `separabilityTriples()` proves
  five distinct triples exist — meeting NFR-5's color-blind requirement
  without any color channel.
- **Reduced-motion parity (FR-26):** `toCard(event, i)` covers every
  event kind — `everyKindCovered(kind): 1` is a TypeScript exhaustive
  switch that fails to compile if a new kind ships without a card. A
  runtime test iterates every kind and asserts `title` and `detail`
  are non-empty.
- **Rules drawer (FR-27):** opens with `?` or `F1` from every match
  mode; closes with `Escape`. FocusTrap restores focus to the opener on
  close. Glossary terms deep-link via `openRulesDrawer(anchor)` — the
  drawer scrolls the anchor into view and focuses it on next render.
- **No network / no persistence:** the match store writes NOTHING to
  `localStorage`. The result handoff is a single `signal-loss:match-result`
  DOM CustomEvent whose detail is the derived `MatchResultPayload`; the
  core flow store subscribes.
- **Confirm-commit modal (design.md §5.6):** movement commit surfaces
  a ConfirmModal listing implicit HOLDs (constructs without a plotted
  path or explicit HOLD). Ctrl+Enter opens the modal; the destructive
  action is a second, explicit click.

