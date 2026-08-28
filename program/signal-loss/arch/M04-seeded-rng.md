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

<!-- SESSION-01 -->

## M04 — Seeded RNG

Public API (`./src/engine/rng/index.ts`):

```ts
interface Rng { readonly state: readonly [number, number, number, number]; }
// [0]=stateHi, [1]=stateLo, [2]=incHi, [3]=incLo(|1)

function nextInt(rng: Rng): readonly [number, Rng];
function nextRange(rng: Rng, min: number, maxExcl: number): readonly [number, Rng];
function pick<T>(rng: Rng, xs: readonly T[]): readonly [T, Rng];
function shuffle<T>(rng: Rng, xs: readonly T[]): readonly [readonly T[], Rng];

function fnv1a64(input: string): { readonly hi: number; readonly lo: number };
function rngFromSeed(seed: string): Rng;
function stream(root: Rng, label: string): Rng;
```

Conventions in effect:

- Every draw is immutable — value + next Rng returned.
- 64-bit LCG arithmetic uses BigInt (spec-exact) internally; state is
  exposed as four Uint32s so it round-trips through `postMessage` and
  the canonical serializer.
- `nextRange` uses Lemire rejection sampling; no modulo bias.
- Named streams are structurally independent: `stream(root, "map.walls")`
  and `stream(root, "ai.squad3")` never affect each other regardless of
  draw counts. Later resolution modules (match/, view/) do NOT import
  this module — enforced by review and the module contract in M04.

