# M03 — Fixed-point math

> **Path:** `./src/engine/fx/`
> **Imports from:** —
> **Status:** planned for full v1

## Public API
- Fx branded integer and FX_ONE = 1024
- Integer vector and scalar arithmetic
- isqrt, squared distance, segment intersection, point-in-polygon, and circle overlap

## Internal Structure

| Area | Path |
|---|---|
| Scalar | `./src/engine/fx/scalar.ts` |
| Vector | `./src/engine/fx/vector.ts` |
| Geometry | `./src/engine/fx/geometry.ts` |
| Facade | `./src/engine/fx/index.ts` |

## Conventions and Invariants
- Keep all rule-affecting geometry within Number safe-integer bounds.
- Use integer cross products and squared distances; division rounds explicitly.
- Math.sqrt is allowed only inside corrected isqrt.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
