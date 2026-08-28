# M12 — Engine facade

> **Path:** `./src/engine/index.ts`
> **Imports from:** M03–M11
> **Status:** planned for full v1

## Public API
- The complete supported browser/worker/harness import surface
- Re-exported public types and functions without exposing internal helpers

## Internal Structure

| Area | Path |
|---|---|
| Facade | `./src/engine/index.ts` |

## Conventions and Invariants
- Consumers import through this file once it exists.
- Keep exports deliberate and backward-compatible within v1.
- Do not add platform or framework references.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
