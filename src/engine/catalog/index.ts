/**
 * Public facade for the catalog module. Consumers import from here.
 * Internals (`schema.ts`, `validate.ts`, `load.ts`, `canonical.ts`) are
 * implementation details and not part of the engine boundary.
 */

export {
  type ArchetypeCode,
  type ArchetypeId,
  type Budget,
  type Catalog,
  type CatalogError,
  type CatalogErrorKind,
  type CatalogHashes,
  type CatalogIndexes,
  type Chassis,
  type ChassisCode,
  type ChassisId,
  type CommanderCode,
  type CommanderModifications,
  type CommanderType,
  type CommanderTypeId,
  type CurveFamily,
  type DialState,
  type Hardpoint,
  type HardpointType,
  type HardpointTypeCode,
  type HardpointTypeId,
  type MapArchetype,
  type Mount,
  type MountCode,
  type MountFamily,
  type MountId,
  type Prebuilt,
  type PrebuiltConstruct,
  type PrebuiltId,
  type PrebuiltMount,
  type RawCatalogBundle,
  type Result,
  type Tunables,
  ARCHETYPE_CODE_MAX,
  BUDGETS,
  CHASSIS_CODE_MAX,
  COMMANDER_CODE_MAX,
  CURVE_FAMILIES,
  HARDPOINT_TYPE_CODE_MAX,
  MOUNT_CODE_MAX,
  MOUNT_FAMILIES,
  REQUIRED_ARCHETYPES,
} from "./schema";

export { loadCatalog } from "./load";
export { canonicalize, canonicalHash, fnv1a64Hex } from "./canonical";
