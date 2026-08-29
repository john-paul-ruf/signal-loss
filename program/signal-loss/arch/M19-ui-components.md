# M19 — UI components

> **Path:** `./src/app/components/`
> **Imports from:** M12, M17
> **Status:** shared primitives shipped and verified in SESSION-02; build-zone display primitives shipped and verified in SESSION-07 checkpoints 1–2; match components shipped and verified in SESSION-08. A SESSION-07 retry landed one unverified composer component (`CommanderDeltaGrid.tsx`) — see Build display primitives below. The setup component subtree is now owned by the `match-setup-route` cycle (SESSION-04, not launched this cycle); the result component subtree remains unstarted, pending a further SESSION-07 retry.

## Public API

### Shared primitives — `./src/app/components/shared/` (SESSION-02)

- `Button` (variants: primary, ghost, danger)
- `Toggle` (ARIA switch)
- `SegmentedControl` (radiogroup with arrow keys, Home / End)
- `BudgetStepper` (increment / decrement over a fixed enum, `<output aria-live>`)
- `TextInput` / `TextArea` (label, hint, `role="alert"` error)
- `StatRow` (label + mono numeric + optional unit + emphasis)
- `Banner` (info / warn / bad / ok, polite or assertive)
- `ToastRegion` (`role="log"` polite live region)
- `ConfirmModal` (armed destructive; verbatim label; `FocusTrap`)
- `FocusTrap` (traps Tab / Shift-Tab; restores focus on unmount; Escape callback)
- `TermTooltip` (glossary; `role="tooltip"` + `aria-describedby`)
- `SeedField` (text input + generate button)
- `DesktopGate` (viewport < 1280×720 shows `role="alertdialog"` blocker)
- `SectionErrorBoundary` (scoped variant of `main.tsx`'s root boundary)

### Build display primitives — `./src/app/components/build/` (SESSION-07 checkpoints 1–2)

- `CurveChart`, `DialPips`, `DialStatGrid`, `HardpointBadges` — shared build-zone display primitives (curve meaning / dial position never colour-only, NFR-5).
- `format.ts` — `fxUnits` (fixed-point → decimal display), `signed`, `dialStateRange`, `baseMovement`.
- `CommanderDeltaGrid.tsx` — **residual, unverified.** A SESSION-07 retry aimed at checkpoint 3 (composer) added this before/after stat-delta grid for commander assignment, but the worker returned no parseable handoff before any checkpoint or verification result. Committed as in-lease residual `ed7b664`; treat as an unverified starting point for the next retry.

### Match components — `./src/app/components/match/` (SESSION-08)

- `MatchShell({ boardSlot })` — persistent chrome; F1 opens the rules drawer, Escape closes.
- `PhaseHeader` — round + phase (FR-13, always visible).
- `TraceTimeline` — full schedule from round 1 (FR-20).
- `PoolLedger` — FR-17 breakdown with waste warning and PROJECTED tag.
- `SquadRail` — ledger row per own construct; rail state = UNPLOTTED / HOLD / plotted-N.
- `InspectorPanel` — full stats + dial for any construct: own / enemy / ghost / destroyed (FR-24).
- `RoundLog` — complete plain-language transcript (design.md §5.8).
- `CommandBar` — mode-appropriate commit button, `Ctrl+Enter`, confirm modal listing implicit HOLDs.
- `RulesDrawer` — outcome matrix + pool formula (substituted) + trace schedule + glossary.
- `ExchangeCard` — 2×2 FR-18 matrix from the engine's `exchangePreview`.
- `AttackLedger` — one row per living own construct with target / called / posture controls + inline exchange card.

## Internal Structure

| Area | Path |
|---|---|
| Shared | `./src/app/components/shared/` |
| Build (partial) | `./src/app/components/build/` |
| Setup / result | `./src/app/components/setup/` — `match-setup-route` SESSION-04, not launched; `./src/app/components/result/` — pending SESSION-07 retry |
| Match | `./src/app/components/match/` |

## Conventions and Invariants

- All interactive states include focus-visible and disabled semantics.
- Public facts are zero or one interaction deep.
- Exact numbers use mono type; no visual-only bar replaces them.
- **No shared stylesheet yet.** Shared `sl-*` components (`Banner`, `Button`, …) from `components/shared` ship structurally / aria correct but visually unstyled. Both UI halves (build-zone and match) supply their own Tailwind layout. A shared `components/shared` CSS is a follow-up on Session-02's lease.
- **Shared-component tests use `renderToStaticMarkup`** because the toolchain does not yet include jsdom / testing-library. Full keyboard interaction is asserted through Playwright specs (build-zone specs authored but unrun pending fresh SESSION-07 retry).
- **AttackLedger + ExchangeCard use `select` + `button` (no keyboard menu widget)** so the component tree renders without jsdom; SESSION-06's e2e can validate exact 2×2 integers via `getByTestId('cell-*')`.
- **ConfirmModal / armed-destructive pattern (design.md §5.5):** every destructive commit uses a `ConfirmModal` with a `FocusTrap`.
- **Confirm-commit modal (design.md §5.6):** movement commit surfaces a `ConfirmModal` listing implicit HOLDs (constructs without a plotted path or explicit HOLD). `Ctrl+Enter` opens the modal; the destructive action is a second, explicit click.
- **Rules drawer (FR-27):** opens with `?` or `F1` from every match mode; closes with `Escape`. `FocusTrap` restores focus to the opener on close. Glossary terms deep-link via `openRulesDrawer(anchor)` — the drawer scrolls the anchor into view and focuses it on next render.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-02 shipped 13 shared semantic components with server-rendered role / ARIA / disabled-state / label coverage. |
| 2026-08-28 | SESSION-07 checkpoints 1–2 shipped build display primitives (`CurveChart`, `DialPips`, `DialStatGrid`, `HardpointBadges`, `format.ts`). Setup / result / composer components remain pending checkpoints 3–5. |
| 2026-08-28 | SESSION-08 shipped `./src/app/components/match/**` — the persistent match shell plus phase header, trace timeline, pool ledger, squad rail, inspector, round log, command bar, rules drawer, attack ledger, and exchange card. |
| 2026-08-28 | SESSION-07 retry 1 (targeting checkpoint 3) returned no parseable handoff; residual `ed7b664` added `CommanderDeltaGrid.tsx` unverified. Setup / result component subtrees remain fully unstarted. |
| 2026-08-28 | `match-setup-route` cycle: no component shipped under M19. The `./src/app/components/setup/**` subtree is now owned by `match-setup-route` SESSION-04, which was not launched (blocked behind SESSION-03); the result component subtree stays pending a SESSION-07 retry. |
