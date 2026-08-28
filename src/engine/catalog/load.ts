import { canonicalHash } from "./canonical";
import {
  type ArchetypeCode,
  type ArchetypeId,
  type Catalog,
  type CatalogError,
  type CatalogHashes,
  type CatalogIndexes,
  type ChassisCode,
  type ChassisId,
  type CommanderCode,
  type CommanderTypeId,
  type HardpointType,
  type HardpointTypeCode,
  type HardpointTypeId,
  type Mount,
  type MountCode,
  type MountId,
  type Prebuilt,
  type PrebuiltId,
  type RawCatalogBundle,
  type Result,
  type Tunables,
  type Chassis,
  type CommanderType,
  type MapArchetype,
} from "./schema";
import { validateCatalog } from "./validate";

function buildIndexes(
  catalog: Omit<Catalog, "indexes" | "hashes">,
): CatalogIndexes {
  const hardpointTypeById = new Map<HardpointTypeId, HardpointType>();
  const hardpointTypeByCode = new Map<HardpointTypeCode, HardpointType>();
  for (const t of catalog.hardpointTypes) {
    hardpointTypeById.set(t.id, t);
    hardpointTypeByCode.set(t.code, t);
  }
  const chassisById = new Map<ChassisId, Chassis>();
  const chassisByCode = new Map<ChassisCode, Chassis>();
  for (const c of catalog.chassis) {
    chassisById.set(c.id, c);
    chassisByCode.set(c.code, c);
  }
  const mountById = new Map<MountId, Mount>();
  const mountByCode = new Map<MountCode, Mount>();
  for (const m of catalog.mounts) {
    mountById.set(m.id, m);
    mountByCode.set(m.code, m);
  }
  const commanderTypeById = new Map<CommanderTypeId, CommanderType>();
  const commanderTypeByCode = new Map<CommanderCode, CommanderType>();
  for (const c of catalog.commanderTypes) {
    commanderTypeById.set(c.id, c);
    commanderTypeByCode.set(c.code, c);
  }
  const prebuiltById = new Map<PrebuiltId, Prebuilt>();
  for (const p of catalog.prebuilts) {
    prebuiltById.set(p.id, p);
  }
  const archetypeById = new Map<ArchetypeId, MapArchetype>();
  const archetypeByCode = new Map<ArchetypeCode, MapArchetype>();
  for (const a of catalog.mapArchetypes) {
    archetypeById.set(a.id, a);
    archetypeByCode.set(a.code, a);
  }
  return {
    hardpointTypeById,
    hardpointTypeByCode,
    chassisById,
    chassisByCode,
    mountById,
    mountByCode,
    commanderTypeById,
    commanderTypeByCode,
    prebuiltById,
    archetypeById,
    archetypeByCode,
  };
}

/**
 * Compute canonical hashes over the validated (non-index, non-hash) content.
 * The canonicaliser sorts object keys and preserves array order, so two
 * catalogs whose entries hash-differ only in JSON property insertion order
 * produce identical digests. Sort catalog arrays into a stable order first —
 * canonicalization does NOT reorder arrays (they carry meaning).
 */
function computeHashes(catalog: Omit<Catalog, "indexes" | "hashes">): CatalogHashes {
  const stable = {
    hardpointTypes: sortByCode(catalog.hardpointTypes),
    chassis: sortByCode(catalog.chassis),
    mounts: sortByCode(catalog.mounts),
    commanderTypes: sortByCode(catalog.commanderTypes),
    prebuilts: sortById(catalog.prebuilts),
    mapArchetypes: sortByCode(catalog.mapArchetypes),
    tunables: catalog.tunables,
  };
  const tunables: Tunables = catalog.tunables;
  return {
    catalog: canonicalHash(stable),
    tunables: canonicalHash(tunables),
  };
}

function sortByCode<T extends { code: number }>(items: readonly T[]): readonly T[] {
  return items.slice().sort((a, b) => {
    const ac = a.code as unknown as number;
    const bc = b.code as unknown as number;
    if (ac !== bc) return ac - bc;
    return 0;
  });
}

function sortById<T extends { id: string }>(items: readonly T[]): readonly T[] {
  return items.slice().sort((a, b) => {
    const ai = a.id as unknown as string;
    const bi = b.id as unknown as string;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
}

/**
 * Load and validate a raw authored catalog bundle. Returns:
 *   - `{ok: true, value: Catalog}` when every check passes;
 *   - `{ok: false, error: readonly CatalogError[]}` on any failure, with EVERY
 *     path-specific issue reported. All-or-nothing: on failure, no partial
 *     catalog is produced.
 *
 * The engine is dependency-free: `loadCatalog` does not read `./data/`; the
 * caller is responsible for parsing JSON and passing the resulting bundle in.
 * That decoupling is what lets the browser, the worker, and the Node harness
 * all consume identical validated catalog values.
 */
export function loadCatalog(
  raw: RawCatalogBundle,
): Result<Catalog, readonly CatalogError[]> {
  const outcome = validateCatalog(raw);
  if (outcome.errors.length > 0 || outcome.catalog === null) {
    return { ok: false, error: outcome.errors };
  }
  const partial = outcome.catalog;
  const indexes = buildIndexes(partial);
  const hashes = computeHashes(partial);
  const finalCatalog: Catalog = {
    hardpointTypes: partial.hardpointTypes,
    chassis: partial.chassis,
    mounts: partial.mounts,
    commanderTypes: partial.commanderTypes,
    prebuilts: partial.prebuilts,
    tunables: partial.tunables,
    mapArchetypes: partial.mapArchetypes,
    indexes,
    hashes,
  };
  return { ok: true, value: finalCatalog };
}
