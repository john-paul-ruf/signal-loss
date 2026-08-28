# M19 — UI components

> **Path:** `./src/app/components/`
> **Imports from:** M12, M17
> **Status:** shared primitives shipped in SESSION-02 (`./src/app/components/shared/**`). Build, setup, result, and match component subtrees remain pending Sessions 07 and 08.

## Public API

- Shared semantic controls and feedback (SHIPPED).
- Build-specific cards, dial, hardpoint, legality, and budget components (PENDING).
- Match-specific ledger, exchange, inspector, trace, log, transport, and rules components (PENDING).

Shared surface (`./src/app/components/shared/index.ts`, shipped in SESSION-02):

- `Button` (variants: primary, ghost, danger)
- `Toggle` (ARIA switch)
- `SegmentedControl` (radiogroup with arrow keys, Home/End)
- `BudgetStepper` (increment/decrement over a fixed enum, `<output aria-live>`)
- `TextInput` / `TextArea` (label, hint, `role="alert"` error)
- `StatRow` (label + mono numeric + optional unit + emphasis)
- `Banner` (info/warn/bad/ok, polite or assertive)
- `ToastRegion` (`role="log"` polite live region)
- `ConfirmModal` (armed destructive; verbatim label; `FocusTrap`)
- `FocusTrap` (traps Tab/Shift-Tab; restores focus on unmount; Escape callback)
- `TermTooltip` (glossary; `role="tooltip"` + `aria-describedby`)
- `SeedField` (text input + generate button)
- `DesktopGate` (viewport < 1280×720 shows `role="alertdialog"` blocker)
- `SectionErrorBoundary` (scoped variant of `main.tsx`'s root boundary)

## Internal Structure

| Area | Path |
|---|---|
| Shared | `./src/app/components/shared/` |
| Build | `./src/app/components/build/` (pending Session 07) |
| Setup/result | `./src/app/components/setup/`, `./src/app/components/result/` (pending Session 07) |
| Match | `./src/app/components/match/` (pending Session 08) |

## Conventions and Invariants

- All interactive states include focus-visible and disabled semantics.
- Public facts are zero or one interaction deep.
- Exact numbers use mono type and no visual-only bar replaces them.
- Shared-component tests currently use `react-dom/server` `renderToStaticMarkup` because the toolchain does not yet include jsdom / testing-library. Interactive keyboard tests are deferred to Sessions 07/08, which are recommended to add jsdom + testing-library to devDependencies for design.md §5.5 armed-destructive pattern coverage.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-02 shipped 13 shared semantic components with server-rendered role/ARIA/disabled-state/label coverage. Build, setup, result, and match subtrees remain pending. |

<!-- SESSION-07 -->

### SESSION-07 arch delta — build-zone surfaces (checkpoints 1–2 of 5 landed)

Session 07 is partially delivered: checkpoints 1 (boot + codex) and 2 (collection
#### M19 (UI components) — `src/app/components/build/`

- `CurveChart`, `DialPips`, `DialStatGrid`, `HardpointBadges` — shared build-zone
  display primitives (curve meaning/dial position never colour-only, NFR-5).
- `format.ts` — `fxUnits` (fixed-point → decimal display), `signed`,
  `dialStateRange`, `baseMovement`.


<!-- SESSION-08 -->

## SESSION-08 arch delta — Match shell, board, plotting, playback shipped

### M19 (src/app/components/match/**) — public surface, as shipped

```ts
MatchShell({ boardSlot }): persistent chrome; F1 opens the rules drawer, Escape closes.
PhaseHeader: round + phase (FR-13, always visible).
TraceTimeline: full schedule from round 1 (FR-20).
PoolLedger: FR-17 breakdown with waste warning and PROJECTED tag.
SquadRail: ledger row per own construct; rail state = UNPLOTTED / HOLD / plotted-N.
InspectorPanel: full stats + dial for any construct, own/enemy/ghost/destroyed (FR-24).
RoundLog: complete plain-language transcript (design.md §5.8).
CommandBar: mode-appropriate commit button, Ctrl+Enter, confirm modal listing implicit HOLDs.
RulesDrawer: outcome matrix + pool formula (substituted) + trace schedule + glossary.
ExchangeCard: 2×2 FR-18 matrix from the engine's exchangePreview.
AttackLedger: one row per living own construct with target/called/posture controls + inline exchange card.
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

