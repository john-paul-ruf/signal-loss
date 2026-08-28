import { type Fx } from "../fx/index";

/**
 * Catalog domain types. Every branded ID/Code is a nominally-distinct type so
 * a chassis code cannot accidentally be passed where a mount code is expected,
 * even though both are integers under the covers.
 *
 * "IDs" are kebab-case strings (authoring-friendly); "Codes" are stable
 * numeric identifiers used by the codec's wire format (§3.5). Neither is
 * reused across a lifetime; renumbering is a load failure.
 */

declare const brandChassisId: unique symbol;
declare const brandMountId: unique symbol;
declare const brandCommanderId: unique symbol;
declare const brandHardpointTypeId: unique symbol;
declare const brandArchetypeId: unique symbol;
declare const brandPrebuiltId: unique symbol;
declare const brandChassisCode: unique symbol;
declare const brandMountCode: unique symbol;
declare const brandCommanderCode: unique symbol;
declare const brandHardpointTypeCode: unique symbol;
declare const brandArchetypeCode: unique symbol;

export type ChassisId = string & { readonly [brandChassisId]: "ChassisId" };
export type MountId = string & { readonly [brandMountId]: "MountId" };
export type CommanderTypeId = string & { readonly [brandCommanderId]: "CommanderTypeId" };
export type HardpointTypeId = string & { readonly [brandHardpointTypeId]: "HardpointTypeId" };
export type ArchetypeId = string & { readonly [brandArchetypeId]: "ArchetypeId" };
export type PrebuiltId = string & { readonly [brandPrebuiltId]: "PrebuiltId" };

export type ChassisCode = number & { readonly [brandChassisCode]: "ChassisCode" };
export type MountCode = number & { readonly [brandMountCode]: "MountCode" };
export type CommanderCode = number & { readonly [brandCommanderCode]: "CommanderCode" };
export type HardpointTypeCode = number & { readonly [brandHardpointTypeCode]: "HardpointTypeCode" };
export type ArchetypeCode = number & { readonly [brandArchetypeCode]: "ArchetypeCode" };

/** Code widths — align with the codec's bit-packed format (arch §3.5). */
export const CHASSIS_CODE_MAX = 0xfff;
export const MOUNT_CODE_MAX = 0xfff;
export const COMMANDER_CODE_MAX = 0xf;
export const HARDPOINT_TYPE_CODE_MAX = 0xf;
export const ARCHETYPE_CODE_MAX = 0xf;

/** Mount families named by the idea document. Order is stable. */
export const MOUNT_FAMILIES = ["ice", "daemon", "spike", "spoofer", "wipe"] as const;
export type MountFamily = (typeof MOUNT_FAMILIES)[number];

/** Curve families required by FR-19. */
export const CURVE_FAMILIES = ["degrade", "spike", "inversion"] as const;
export type CurveFamily = (typeof CURVE_FAMILIES)[number];

/** The seven map archetypes required by FR-10 (order fixed by requirements). */
export const REQUIRED_ARCHETYPES = [
  "dense-grid",
  "long-avenues",
  "open-scatter",
  "maze",
  "arena",
  "asymmetric-ruins",
  "hazard-field",
] as const;
export type RequiredArchetypeId = (typeof REQUIRED_ARCHETYPES)[number];

/** The eight legal budget values, ascending. */
export const BUDGETS = [25, 50, 75, 100, 125, 150, 175, 200] as const;
export type Budget = (typeof BUDGETS)[number];

/** A typed slot on a chassis. Accepts only mounts whose required type matches. */
export interface HardpointType {
  readonly id: HardpointTypeId;
  readonly code: HardpointTypeCode;
  readonly name: string;
}

/** A single slot on a chassis — one hardpoint per array position. */
export interface Hardpoint {
  readonly typeId: HardpointTypeId;
}

/**
 * One row of a dial. Every entry is public in-match (FR-19, FR-24). The
 * accuracy/defense modifiers are the "modifier" line design.md §2.2 renders.
 */
export interface DialState {
  readonly index: number;
  readonly movementAllowance: Fx;
  readonly damage: number;
  readonly rangeModifier: Fx;
  readonly defenseModifier: number;
}

/** A construct's frame. */
export interface Chassis {
  readonly id: ChassisId;
  readonly code: ChassisCode;
  readonly name: string;
  readonly cost: number;
  readonly footprint: Fx;
  readonly hardpoints: readonly Hardpoint[];
  readonly baseRange: Fx;
  readonly rangeClamp: { readonly min: Fx; readonly max: Fx };
  readonly resolutionRange: Fx;
  readonly curveFamily: CurveFamily;
  readonly dial: readonly DialState[];
}

/** A mount loaded into a hardpoint. */
export interface Mount {
  readonly id: MountId;
  readonly code: MountCode;
  readonly name: string;
  readonly cost: number;
  readonly family: MountFamily;
  readonly requiredHardpointType: HardpointTypeId;
  readonly damageDelta: number;
  readonly rangeDelta: Fx;
}

/**
 * A commander-type tag applied to any chassis in a roster. `rLadder[i]` is
 * the R divisor used when the commander's dial is at position i. Values
 * beyond the ladder length reuse the last entry (dead commander is handled
 * separately by the pool-collapse rule, not by ladder overflow).
 */
export interface CommanderType {
  readonly id: CommanderTypeId;
  readonly code: CommanderCode;
  readonly name: string;
  readonly cost: number;
  readonly commanderBase: number;
  readonly rLadder: readonly number[];
  readonly modifications: CommanderModifications;
}

export interface CommanderModifications {
  /** Extra dial states appended when this commander is applied. */
  readonly extraDialStates: number;
  readonly movementDelta: Fx;
  readonly damageDelta: number;
  readonly rangeDelta: Fx;
  readonly defenseDelta: number;
}

/**
 * A prebuilt construct — chassis + optional commander + placed mounts.
 * Mount assignments are sorted by hardpoint index (canonical form).
 */
export interface PrebuiltMount {
  readonly hardpointIndex: number;
  readonly mountCode: MountCode;
}

export interface PrebuiltConstruct {
  readonly chassisCode: ChassisCode;
  readonly commanderCode: CommanderCode | null;
  readonly mounts: readonly PrebuiltMount[];
}

/** A prebuilt roster, one authored per budget (FR-5). */
export interface Prebuilt {
  readonly id: PrebuiltId;
  readonly name: string;
  readonly budget: Budget;
  readonly constructs: readonly PrebuiltConstruct[];
}

/**
 * Every constant the balance batteries can move without a rebuild (FR-30).
 * All values are typed at load; downstream modules read this record and no
 * numeric literal for a rule-affecting value should appear in code paths
 * (§4.3, enforced by lint on match/map/ai).
 */
export interface Tunables {
  /** FR-4 — squad size cap. */
  readonly MAX_SQUAD: number;
  /** FR-20 — trace damage at the first advance. */
  readonly TRACE_BASE: number;
  /** FR-20 — trace damage increment per advance. */
  readonly TRACE_STEP: number;
  /** FR-20 — round of first contraction. */
  readonly TRACE_FIRST_ROUND: number;
  /** FR-20 — rounds between contractions. */
  readonly TRACE_INTERVAL: number;
  /** NFR-1 — round-count ceiling. */
  readonly MAX_EXPECTED_ROUNDS: number;
  /** FR-11 — pocket area tolerance, in fx² (squared board units). */
  readonly MIN_POCKET: number;
  /** FR-11 — coverless region ceiling as a fraction of map area, 0..1. */
  readonly MAX_OPEN_AREA: number;
  /** FR-11 — cover distribution floor per quadrant, 0..1. */
  readonly MIN_QUADRANT_COVER: number;
  /** FR-11 — minimum inter-spawn separation. */
  readonly MIN_SPAWN_SEP: Fx;
  /** FR-11 — minimum cover elements within SPAWN_COVER_RADIUS of a spawn. */
  readonly MIN_SPAWN_COVER: number;
  readonly SPAWN_COVER_RADIUS: Fx;
  /** FR-11 — LOS ceiling between spawns at round 1. */
  readonly MAX_SPAWN_SIGHTLINES: number;
  /** FR-11 — chokepoint width threshold. */
  readonly CHOKE_WIDTH: Fx;
  /** FR-11 — disconnection fraction threshold, 0..1. */
  readonly CHOKE_FRACTION: number;
  /** FR-11 — regeneration failure ceiling before a defect condition. */
  readonly MAX_REGEN_ATTEMPTS: number;
  /** FR-23 — degenerate-strategy win-rate ceiling, 0..1. */
  readonly EXPLOIT_CEILING: number;
  /** FR-23 — unseen-roster performance drop tolerance, 0..1. */
  readonly NOVEL_ROSTER_TOLERANCE: number;
  /** FR-23 — AI trace-death rate ceiling. */
  readonly TRACE_DEATH_CEILING: number;
  /** FR-31 — single-roster win-rate ceiling, 0..1. */
  readonly DOMINANCE_CEILING: number;
  /** FR-31 — round at which the snowball window is measured. */
  readonly SNOWBALL_ROUND: number;
  /** AD-3 — movement substep count. Part of the tunables hash. */
  readonly MOVE_SUBSTEPS: number;
  /** Board dimensions in fx (assumed square). */
  readonly BOARD_SIZE: Fx;
  /** Clamp bounds for effective resolution range and mount ranges (fx). */
  readonly RANGE_MIN: Fx;
  readonly RANGE_MAX: Fx;
}

/**
 * A map archetype's declared parameter set and validation range (FR-10).
 * `parameters` is opaque to the catalog module; the map module reads its
 * keys. The declared metric ranges are validated by the playability gate.
 */
export interface MapArchetype {
  readonly id: ArchetypeId;
  readonly code: ArchetypeCode;
  readonly name: string;
  readonly wallDensity: { readonly min: number; readonly max: number };
  readonly meanSightlineLength: { readonly min: Fx; readonly max: Fx };
  readonly openAreaFraction: { readonly min: number; readonly max: number };
  readonly parameters: Readonly<Record<string, number>>;
}

/** Canonical FNV-1a-64 hex digests (16 chars each, lowercase). */
export interface CatalogHashes {
  readonly catalog: string;
  readonly tunables: string;
}

/** O(1) lookups by string ID and by numeric code. */
export interface CatalogIndexes {
  readonly hardpointTypeById: ReadonlyMap<HardpointTypeId, HardpointType>;
  readonly hardpointTypeByCode: ReadonlyMap<HardpointTypeCode, HardpointType>;
  readonly chassisById: ReadonlyMap<ChassisId, Chassis>;
  readonly chassisByCode: ReadonlyMap<ChassisCode, Chassis>;
  readonly mountById: ReadonlyMap<MountId, Mount>;
  readonly mountByCode: ReadonlyMap<MountCode, Mount>;
  readonly commanderTypeById: ReadonlyMap<CommanderTypeId, CommanderType>;
  readonly commanderTypeByCode: ReadonlyMap<CommanderCode, CommanderType>;
  readonly prebuiltById: ReadonlyMap<PrebuiltId, Prebuilt>;
  readonly archetypeById: ReadonlyMap<ArchetypeId, MapArchetype>;
  readonly archetypeByCode: ReadonlyMap<ArchetypeCode, MapArchetype>;
}

export interface Catalog {
  readonly hardpointTypes: readonly HardpointType[];
  readonly chassis: readonly Chassis[];
  readonly mounts: readonly Mount[];
  readonly commanderTypes: readonly CommanderType[];
  readonly prebuilts: readonly Prebuilt[];
  readonly tunables: Tunables;
  readonly mapArchetypes: readonly MapArchetype[];
  readonly indexes: CatalogIndexes;
  readonly hashes: CatalogHashes;
}

export interface RawCatalogBundle {
  readonly hardpointTypes: unknown;
  readonly chassis: unknown;
  readonly mounts: unknown;
  readonly commanders: unknown;
  readonly prebuilts: unknown;
  readonly tunables: unknown;
  readonly mapArchetypes: unknown;
}

/**
 * Every catalog error carries the FR / architecture rule id it originates
 * from and a JSON pointer-ish `path` locating the offending value.
 */
export type CatalogErrorKind =
  | "MISSING_FIELD"
  | "EXTRA_FIELD"
  | "TYPE"
  | "RANGE"
  | "DUPLICATE"
  | "ORDER"
  | "REFERENCE"
  | "COMPLETENESS"
  | "CURVE"
  | "MOUNT_FAMILY_UNIVERSAL";

export interface CatalogError {
  readonly path: string;
  readonly kind: CatalogErrorKind;
  readonly message: string;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
