# M04 — Seeded RNG

> **Path:** `./src/engine/rng/`
> **Imports from:** M03
> **Status:** planned for full v1

## Public API
- Rng plain state, rngFromSeed, named stream
- nextInt, nextRange, pick, and deterministic shuffle
- PCG32 transition over Uint32 state and FNV-1a stream labels

## Internal Structure

| Area | Path |
|---|---|
| State | `./src/engine/rng/pcg32.ts` |
| Streams | `./src/engine/rng/streams.ts` |
| Facade | `./src/engine/rng/index.ts` |

## Conventions and Invariants
- Consumers draw from named streams, never the root stream.
- No wall-clock or platform entropy.
- Resolution modules may not import this module.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
