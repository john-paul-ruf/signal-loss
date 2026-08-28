# M20 — Screens

> **Path:** `./src/app/screens/`
> **Imports from:** M12, M14, M17–M19
> **Status:** planned for full v1

## Public API
- Route modules for boot, build collection/composer, codex, setup, result, and match modes
- Screen-level flow orchestration using engine/store/component APIs

## Internal Structure

| Area | Path |
|---|---|
| Entry/build | `./src/app/screens/boot/, ./src/app/screens/build/, ./src/app/screens/codex/` |
| Setup/result | `./src/app/screens/setup/, ./src/app/screens/result/` |
| Match | `./src/app/screens/match/` |

## Conventions and Invariants
- Each route self-registers through route discovery; do not edit the bootstrap registry.
- Screens 05–08 and rules share one persistent match shell.
- Under 1280×720 show the desktop requirement instead of degrading the layout.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-07 -->

### SESSION-07 arch delta — build-zone surfaces (checkpoints 1–2 of 5 landed)

Session 07 is partially delivered: checkpoints 1 (boot + codex) and 2 (collection
#### M20 (screens) — self-registering routes

- `screens/boot/` → route `#/` (id `boot`): real catalog counts/hashes, storage
  probe, app version; below 1280×720 the desktop statement replaces the entry
  navigation (NFR-4) instead of reflowing.
- `screens/codex/` → route `#/codex` (id `codex`): sortable chassis/mount tables
  with `aria-sort` + keyboard sort + stable-ID tiebreak (`sort.ts`), expandable
  dial disclosure, curve charts, commander table, permanent FR-1 contract line.
- `screens/build/` → route `#/build` (id `build-collection`): three-region
  collection (pinned read-only prebuilts with DUPLICATE-TO-EDIT fork, saved
  rosters, detail with budget meter / legality banner / share block / persistent
  import panel), armed delete, storage banners (unavailable/quota/stale/version/
  corrupt with armed reset + raw copy).

#### Cross-session notes for Session 08 integration

- The composer route is expected at `#/composer` (linked from boot & collection
  nav) — pending checkpoint 3. Setup `#/setup` and result `#/result` pending 4–5.
- Shared `sl-*` components (`Banner`, `Button`, …) from `components/shared` ship
  **without a stylesheet** — they are structurally/aria correct but visually
  unstyled. Build-zone screens use `Banner` for its live-region semantics and
  supply their own Tailwind layout. A shared `components/shared` CSS is a
  Session-02-lease follow-up both UI halves need for full visual parity.

<!-- SESSION-08 -->

## SESSION-08 arch delta — Match shell, board, plotting, playback shipped

### M20 (src/app/screens/match/**) — public surface, as shipped

```ts
route.tsx: id "match", path "#/match".
MatchScreen: creates a MatchStore instance per mount, provides context, switches modes.
DeploymentMode: board + spawn-region click placement, HUD progress + reason.
MovementMode: board + waypoint clicks / HOLD (H) / Backspace / Esc / 1-9 select; engine legalMovePlot is authority.
AttackMode: board + AttackLedger with inline ExchangeCards; pointer picks nearest enemy as target.
PlaybackMode: full-motion or reduced-motion cards (arrow keys); event-only.
ResultMode: derives MatchResultPayload and dispatches signal-loss:match-result event for the flow store.
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

### Handoff notes for Session 09 / future

- The launch payload currently seeds all five squads from the human roster.
  Session 07's setup screen extends `MatchLaunchConfig` to carry `aiRosters`
  and wires the match store's `boot()` to consume them. Until then the
  match plays five identical rosters — mechanically valid, catalog-honest,
  but not the FR-9 AI-reveal loop.
- The AI worker client factory is a parameter; production match screen
  wires a Vite `new URL("../workers/ai.worker.ts", import.meta.url)`
  Worker. Session 07's setup screen can share the same factory.
- The reach envelope in `input/reach.ts` uses circle sampling from
  chassis footprint + current dial allowance. Walls are NOT respected
  in the outline (deliberate — this is an outer bound; the engine's
  `legalMovePlot` refuses wall-crossing paths at commit time).
- The match store's DOM CustomEvent handoff to the core flow store is
  a lightweight decoupling; Session 07's result screen can either
  subscribe or replace it with a direct store injection.
