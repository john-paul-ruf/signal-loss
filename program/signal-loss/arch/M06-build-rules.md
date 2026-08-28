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

<!-- SESSION-01 -->

## M06 — Build rules

Public API (`./src/engine/build/index.ts`):

```ts
interface Construct {
  readonly chassisCode: ChassisCode;
  readonly commanderCode: CommanderCode | null;
  readonly mounts: readonly MountAssignment[];
}
interface MountAssignment { readonly hardpointIndex: number; readonly mountCode: MountCode; }
interface Roster { readonly constructs: readonly Construct[]; }

type ViolationRule = `FR-${number}`;
interface Violation {
  readonly rule: ViolationRule; readonly kind: string;
  readonly message: string;    readonly path: string;
}

function constructCost(c: Construct, catalog: Catalog): number;
function rosterCost(r: Roster, catalog: Catalog): number;
function validateConstruct(c: Construct, catalog: Catalog): readonly Violation[];
function validateRoster(r: Roster, catalog: Catalog, budget: Budget): readonly Violation[];
function validateCatalogPrebuilts(catalog: Catalog): readonly Violation[];

interface EffectiveChassis {
  source: Chassis; commander: CommanderType;
  baseRange: Fx; rangeClamp: {min:Fx; max:Fx}; resolutionRange: Fx;
  footprint: Fx; hardpoints: readonly Hardpoint[]; dial: readonly DialState[];
}
function applyCommanderType(chassis: Chassis, commander: CommanderType): EffectiveChassis;

// Enumeration primitives for Session 06's costing battery:
function* enumerateConstructsForChassis(
  catalog: Catalog, chassisCode: ChassisCode,
  options?: { commanderCode?: CommanderCode | null }
): Generator<Construct, void, void>;
function* enumerateConstructs(
  catalog: Catalog,
  options?: { commanderCode?: CommanderCode | null }
): Generator<Construct, void, void>;
function* enumerateConstructsUnderCost(
  catalog: Catalog, maxCost: number,
  options?: { commanderCode?: CommanderCode | null }
): Generator<Construct, void, void>;
function chassisFamilyReach(catalog: Catalog, chassisCode: ChassisCode): ReadonlySet<MountFamily>;
```

Rule enforcement summary:

- **FR-1** — chassis reference must resolve.
- **FR-2** — hardpoint indices in-range, unique, sorted; mount code known;
  mount's `requiredHardpointType` must equal the hardpoint's `typeId`.
  The `PORT_TYPE_MISMATCH` message names both sides for
  `design.md §5.2`'s "PORT: X · MOUNT: Y" contract.
- **FR-3** — commander code known; roster contains exactly one tagged
  construct (zero and two-plus both rejected).
- **FR-4** — budget in `{25..200 by 25}`; 1..MAX_SQUAD constructs; cost
  ≤ budget (under-spend legal).
- **applyCommanderType** — appends `extraDialStates` copies of the final
  state; adds movement/damage/defense deltas per state; adds rangeDelta
  to baseRange; clamps into `[rangeClamp.min, rangeClamp.max]`.

Enumeration is deterministic (empty-mount slot yielded before any real
mount; mounts by ascending code; chassis by ascending code). Session 06's
snapshots hash to the same digest across runs by construction.

