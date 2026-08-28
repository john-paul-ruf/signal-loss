import type {
  Catalog,
  ChassisCode,
  CommanderCode,
  Mount,
  MountFamily,
} from "../catalog/index";
import { constructCost } from "./cost";
import type { Construct, MountAssignment } from "./model";

/**
 * Enumeration primitives for the costing battery (FR-31). Every generator
 * yields in stable code order: chassis by code ascending, mounts by code
 * ascending, and mount-slot decisions in `null (empty) → mounts by code`
 * order. Deterministic across runs is the load-bearing property — the
 * battery snapshots and hashes results, so a re-order would look like a
 * catalog change.
 *
 * These primitives are LAZY: they never materialise an intermediate array
 * that could exhaust memory at high budgets. Callers apply their own
 * pruning (typically a max-cost cap) using `enumerateConstructsUnderCost`.
 */

/**
 * All mounts a hardpoint of the given type may accept, sorted by mount code.
 */
function mountsAcceptedByType(
  catalog: Catalog,
  typeId: string,
): readonly Mount[] {
  const options: Mount[] = [];
  for (const m of catalog.mounts) {
    if ((m.requiredHardpointType as string) === typeId) {
      options.push(m);
    }
  }
  options.sort((a, b) => (a.code as number) - (b.code as number));
  return options;
}

/**
 * Yield every legal construct built from a single chassis under an optional
 * commander tag. Mount decisions per hardpoint are: no mount, then each
 * accepted mount in code order. Yields (chassis_hardpoint_options)^depth
 * combinations — polynomial in the number of legal choices per hardpoint.
 */
export function* enumerateConstructsForChassis(
  catalog: Catalog,
  chassisCode: ChassisCode,
  options: { readonly commanderCode?: CommanderCode | null } = {},
): Generator<Construct, void, void> {
  const chassisEntry = catalog.indexes.chassisByCode.get(chassisCode);
  if (chassisEntry === undefined) return;
  const chassis = chassisEntry;
  const commanderCode = options.commanderCode ?? null;
  const hpOptions = chassis.hardpoints.map((hp) =>
    mountsAcceptedByType(catalog, hp.typeId as string),
  );

  const current: MountAssignment[] = [];
  function* recurse(depth: number): Generator<Construct, void, void> {
    if (depth === chassis.hardpoints.length) {
      yield {
        chassisCode,
        commanderCode,
        mounts: current.slice(),
      };
      return;
    }
    const options = hpOptions[depth] ?? [];
    // Empty slot first — code order requires the "no mount" case ahead of
    // any real mount for stable ordering under FR-31's audit.
    yield* recurse(depth + 1);
    for (const mount of options) {
      current.push({ hardpointIndex: depth, mountCode: mount.code });
      yield* recurse(depth + 1);
      current.pop();
    }
  }
  yield* recurse(0);
}

/**
 * Yield every legal construct across every chassis in the catalog. Chassis
 * are visited in stable code order.
 */
export function* enumerateConstructs(
  catalog: Catalog,
  options: { readonly commanderCode?: CommanderCode | null } = {},
): Generator<Construct, void, void> {
  const chassis = catalog.chassis
    .slice()
    .sort((a, b) => (a.code as number) - (b.code as number));
  for (const c of chassis) {
    yield* enumerateConstructsForChassis(catalog, c.code, options);
  }
}

/**
 * Convenience wrapper — yield only constructs whose cost stays at or below
 * `maxCost`. Since we always add the chassis cost up-front and mounts add
 * monotonically, callers using this bound never materialise an over-budget
 * combination.
 */
export function* enumerateConstructsUnderCost(
  catalog: Catalog,
  maxCost: number,
  options: { readonly commanderCode?: CommanderCode | null } = {},
): Generator<Construct, void, void> {
  for (const construct of enumerateConstructs(catalog, options)) {
    if (constructCost(construct, catalog) <= maxCost) {
      yield construct;
    }
  }
}

/**
 * The set of mount families a chassis's hardpoint layout can seat
 * simultaneously — evaluated via the same bipartite matching used at
 * catalog load. Exposed so the costing battery can classify chassis by
 * "how much family diversity does this frame admit", which is a common
 * grouping axis for build-space analysis (§3.4 rationale).
 */
export function chassisFamilyReach(
  catalog: Catalog,
  chassisCode: ChassisCode,
): ReadonlySet<MountFamily> {
  const chassis = catalog.indexes.chassisByCode.get(chassisCode);
  if (chassis === undefined) return new Set<MountFamily>();
  const families = new Set<MountFamily>();
  for (const hp of chassis.hardpoints) {
    for (const mount of catalog.mounts) {
      if (mount.requiredHardpointType === hp.typeId) {
        families.add(mount.family);
      }
    }
  }
  return families;
}
