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

