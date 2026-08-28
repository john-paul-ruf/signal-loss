# M19 — UI components

> **Path:** `./src/app/components/`
> **Imports from:** M12, M17
> **Status:** planned for full v1

## Public API
- Shared semantic controls and feedback
- Build-specific cards, dial, hardpoint, legality, and budget components
- Match-specific ledger, exchange, inspector, trace, log, transport, and rules components

## Internal Structure

| Area | Path |
|---|---|
| Shared | `./src/app/components/shared/` |
| Build | `./src/app/components/build/` |
| Setup/result | `./src/app/components/setup/, ./src/app/components/result/` |
| Match | `./src/app/components/match/` |

## Conventions and Invariants
- All interactive states include focus-visible and disabled semantics.
- Public facts are zero or one interaction deep.
- Exact numbers use mono type and no visual-only bar replaces them.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-02 -->

## M19 — UI components (shared)

`./src/app/components/shared/index.ts`:

- Button (variants: primary, ghost, danger)
- Toggle (ARIA switch) + SegmentedControl (radiogroup with arrow keys, Home/End)
- BudgetStepper (increment/decrement over a fixed enum, `<output aria-live>`)
- TextInput / TextArea (label, hint, `role="alert"` error)
- StatRow (label + mono numeric + optional unit + emphasis)
- Banner (info/warn/bad/ok, polite or assertive)
- ToastRegion (`role="log"` polite live region)
- ConfirmModal (armed destructive; verbatim label; FocusTrap)
- FocusTrap (traps Tab/Shift-Tab; restores focus on unmount; Escape callback)
- TermTooltip (glossary; `role="tooltip"` + `aria-describedby`)
- SeedField (text input + generate button)
- DesktopGate (viewport < 1280×720 shows `role="alertdialog"` blocker)
- SectionErrorBoundary (scoped variant of main.tsx's root boundary)

Test discipline in effect for Session 02:

- Every session owns only its precise test subtree (contract preserved).
- Shared component tests use `renderToStaticMarkup` because the toolchain
  does not yet include jsdom / testing-library. Interactive keyboard tests
  are deferred to Session 07/08 (which are recommended to add jsdom +
  testing-library to devDependencies).
