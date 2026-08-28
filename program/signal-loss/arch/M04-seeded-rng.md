# M04 — Seeded RNG

> **Path:** `./src/engine/rng/`
> **Imports from:** M03
> **Status:** shipped in SESSION-01.

## Public API

Facade: `./src/engine/rng/index.ts`.

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

## Internal Structure

| Area | Path |
|---|---|
| State | `./src/engine/rng/pcg32.ts` |
| Streams | `./src/engine/rng/streams.ts` |
| Facade | `./src/engine/rng/index.ts` |

## Conventions and Invariants

- Consumers draw from named streams, never the root stream.
- No wall-clock or platform entropy.
- Resolution modules (`./src/engine/match/`, `./src/engine/view/`) may not import this module — enforced by the M04 contract and review.
- Every draw is immutable — value plus a new `Rng` returned.
- 64-bit LCG arithmetic uses `BigInt` (spec-exact) internally; state is exposed as four Uint32s so it round-trips through `postMessage` and the canonical serializer.
- `nextRange` uses Lemire rejection sampling; no modulo bias.
- Named streams are structurally independent: `stream(root, "map.walls")` and `stream(root, "ai.squad3")` never affect each other regardless of draw counts.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-01 shipped `./src/engine/rng/**` with PCG32, FNV-1a-hashed named streams, unbiased ranges, and deterministic shuffle. |
