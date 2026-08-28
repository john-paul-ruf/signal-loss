# M14 — Platform adapters

> **Path:** `./src/platform/`
> **Imports from:** M06, M13
> **Status:** planned for full v1

## Public API
- CollectionRepository result-based port and localStorage adapter
- Clipboard adapter for share strings and seeds
- Capability probes for viewport, storage, and motion preferences

## Internal Structure

| Area | Path |
|---|---|
| Storage | `./src/platform/storage/` |
| Clipboard | `./src/platform/clipboard/` |
| Capabilities | `./src/platform/capability.ts` |

## Conventions and Invariants
- One atomic root-document setItem per logical write.
- Preserve corrupt raw data and require explicit recovery.
- No adapter may make a runtime network request.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
