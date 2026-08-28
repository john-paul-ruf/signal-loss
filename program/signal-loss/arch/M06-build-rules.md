# M06 — Build rules

> **Path:** `./src/engine/build/`
> **Imports from:** M03, M05
> **Status:** planned for full v1

## Public API
- Construct and Roster plain models
- constructCost, rosterCost, validateConstruct, and validateRoster
- applyCommanderType and generated legal-roster enumeration primitives
- Violation discriminated union carrying rule id and rendered message

## Internal Structure

| Area | Path |
|---|---|
| Model | `./src/engine/build/model.ts` |
| Costing | `./src/engine/build/cost.ts` |
| Validation | `./src/engine/build/validate.ts` |
| Enumeration | `./src/engine/build/enumerate.ts` |
| Facade | `./src/engine/build/index.ts` |

## Conventions and Invariants
- Exactly one commander per roster and MAX_SQUAD are enforced in one implementation.
- Never silently repair a composition.
- AI, UI, codec, and harness consume the same validators.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
