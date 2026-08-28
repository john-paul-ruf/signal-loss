# M12 — Engine facade

> **Path:** `./src/engine/index.ts`
> **Imports from:** M03–M11
> **Status:** shipped in SESSION-05.

## Public API

`./src/engine/index.ts` is the single supported browser / worker / harness surface. It re-exports Fx (M03), RNG (M04), Catalog (M05), Build (M06), Codec (M07), Map (M08), Match (M09), View (M10), and AI (M11). No app / platform / worker exports. Consumers must import from `./src/engine/index` (or the shorter `./src/engine`); deep-internal paths remain internal.

Naming collisions from cross-module identifiers are disambiguated at the facade:

| Internal name | Facade re-export |
|---|---|
| `canonicalize` (catalog vs match) | `canonicalizeCatalog`, `canonicalizeMatch` |
| `fnv1a64Hex` (match copy) | `fnv1a64HexMatch` |
| `Result` (catalog vs match) | `CatalogResult`, `MatchResult` |
| Codec `FORMAT_VERSION` | `CODEC_FORMAT_VERSION` |

Downstream sessions should use the disambiguated names.

## Internal Structure

| Area | Path |
|---|---|
| Facade | `./src/engine/index.ts` |

## Conventions and Invariants

- Consumers import through this file once it exists.
- Keep exports deliberate and backward-compatible within v1.
- Do not add platform or framework references.
- **Engine boundary:** the engine module imports no npm dependency, no `./src/app`, no `./src/platform`, and no `./src/workers` path (asserted by the ESLint engine-boundary rules under M01).

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-05 shipped `./src/engine/index.ts` as the single supported cross-boundary surface, with disambiguated re-exports for name-colliding identifiers. |
