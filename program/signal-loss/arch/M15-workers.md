# M15 — Worker entries

> **Path:** `./src/workers/`
> **Imports from:** M08, M10, M11
> **Status:** planned for full v1

## Public API
- Typed AI and map-generation request/response protocols
- Worker entry points suitable for Vite new URL bundling

## Internal Structure

| Area | Path |
|---|---|
| AI worker | `./src/workers/ai.worker.ts` |
| Map worker | `./src/workers/mapgen.worker.ts` |
| Protocol | `./src/workers/protocol.ts` |

## Conventions and Invariants
- AI requests contain PublicState only.
- Requests carry deterministic seed/stream and node budget, never time budget.
- Messages are structurally cloneable and return typed failures.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
