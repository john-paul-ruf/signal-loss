# M05 — Catalog

> **Path:** `./src/engine/catalog/`
> **Imports from:** M03
> **Status:** planned for full v1

## Public API
- Catalog, Chassis, Mount, CommanderType, Dial, DialState, HardpointType, and Tunables
- loadCatalog(raw): Result<Catalog, CatalogError[]>
- Stable string-id and numeric-code lookup tables plus catalog/tunables hashes

## Internal Structure

| Area | Path |
|---|---|
| Types | `./src/engine/catalog/schema.ts` |
| Validation | `./src/engine/catalog/validate.ts` |
| Loading | `./src/engine/catalog/load.ts` |
| Facade | `./src/engine/catalog/index.ts` |

## Conventions and Invariants
- Load atomically and report every path-specific issue.
- Reject duplicate/missing codes, invalid curve declarations, impossible ports, and malformed tunables.
- No schema-validation dependency is permitted inside the engine.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-01 -->

## M05 — Catalog

Public API (`./src/engine/catalog/index.ts`):

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
function loadCatalog(raw: RawCatalogBundle): Result<Catalog, readonly CatalogError[]>;

// Domain types (all readonly, plain, cloneable):
interface Catalog {
  hardpointTypes; chassis; mounts; commanderTypes; prebuilts;
  tunables; mapArchetypes; indexes; hashes;
}
interface CatalogHashes { catalog: string; tunables: string; } // 16-char hex FNV-1a-64
interface CatalogIndexes { …ById + …ByCode Maps for every category }

// Canonical helpers:
function canonicalize(v: unknown, path?: string): string;
function canonicalHash(v: unknown): string;
function fnv1a64Hex(input: string): string;

// Constants:
const CHASSIS_CODE_MAX = 0xfff;    const MOUNT_CODE_MAX = 0xfff;
const COMMANDER_CODE_MAX = 0xf;    const HARDPOINT_TYPE_CODE_MAX = 0xf;
const ARCHETYPE_CODE_MAX = 0xf;
const MOUNT_FAMILIES = ["ice","daemon","spike","spoofer","wipe"] as const;
const CURVE_FAMILIES = ["degrade","spike","inversion"] as const;
const REQUIRED_ARCHETYPES = ["dense-grid","long-avenues","open-scatter",
  "maze","arena","asymmetric-ruins","hazard-field"] as const;
const BUDGETS = [25,50,75,100,125,150,175,200] as const;
```

Validation contract:

- **All-or-nothing**: on any error, no partial catalog is returned; the
  error array collects every path-specific issue rather than short-
  circuiting on the first.
- **Path-specific errors**: `chassis[3].dial[2].damage`, etc.
- **Enforced rules**:
  - Unique string ids and numeric codes across every category.
  - Cross-references: mount→hardpoint type, prebuilt→chassis/commander/
    mount codes.
  - FR-19: dial ≥ 1 state, monotone index, declared curve family must
    match observed dial shape, at least one chassis per curve family.
  - FR-2 combinatorial: reject any chassis whose hardpoint layout admits
    one of each of the five mount families simultaneously (bipartite
    matching with exhaustive backtracking).
  - FR-10: all seven archetypes required by name; duplicate codes
    rejected.
  - FR-30: every Tunables key present + range-checked. Missing key vs.
    bad value are distinguishable error kinds.

Canonical hashes:

- FNV-1a-64 over a canonical JSON stringification (lex-sorted object
  keys, array order preserved, no non-finite numbers).
- Catalog arrays are sorted into a stable order before hashing (chassis/
  mounts/commanders/archetypes by code; prebuilts by id), so JSON
  property insertion order in `./data/*.json` does not affect the digest.
- `catalog` and `tunables` digests are independent.

Note: `catalog` intentionally does NOT depend on `rng`. The FNV-1a-64
implementation is duplicated inside `./src/engine/catalog/canonical.ts`
(dep graph: `catalog → fx`, not `catalog → rng`).

