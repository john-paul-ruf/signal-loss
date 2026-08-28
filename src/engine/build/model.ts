import type {
  Chassis,
  ChassisCode,
  CommanderCode,
  CommanderType,
  DialState,
  Hardpoint,
  MountCode,
} from "../catalog/index";
import type { Fx } from "../fx/index";

/**
 * Rule-space types for a construct and a roster. Deliberately plain and
 * structurally cloneable — matching persistence's SavedConstructV1 shape
 * (arch §3.4 / persistence contract). Saved-local identity (names, ids)
 * lives in `./src/platform/storage`, not here.
 */

export interface MountAssignment {
  /** Zero-based index into the chassis's hardpoints array. */
  readonly hardpointIndex: number;
  readonly mountCode: MountCode;
}

/**
 * A construct = chassis + optional commander tag + placed mounts. The
 * mounts array is canonically sorted by hardpointIndex, ascending.
 */
export interface Construct {
  readonly chassisCode: ChassisCode;
  readonly commanderCode: CommanderCode | null;
  readonly mounts: readonly MountAssignment[];
}

/**
 * A roster is an ordered list of constructs — exactly one of which must be
 * tagged commander (FR-3). No name or id; those are the collection's
 * concern.
 */
export interface Roster {
  readonly constructs: readonly Construct[];
}

/**
 * The chassis-shaped view a commander tag produces. Used by:
 *   - the composer's dial delta overlay (design.md §5.2)
 *   - build cost composition
 *   - resolution's stat lookups when the tagged construct fires
 * The `source` and `commander` fields let consumers report which underlying
 * chassis and which commander produced this view.
 */
export interface EffectiveChassis {
  readonly source: Chassis;
  readonly commander: CommanderType;
  readonly baseRange: Fx;
  readonly rangeClamp: { readonly min: Fx; readonly max: Fx };
  readonly resolutionRange: Fx;
  readonly footprint: Fx;
  readonly hardpoints: readonly Hardpoint[];
  readonly dial: readonly DialState[];
}

/**
 * Every rejection produced by validateConstruct/validateRoster names the FR
 * it originates from and the JSON-pointer-ish path to the offending value.
 *
 * The union of all rules touched in this session's scope is FR-1..FR-5.
 * Later modules extend the union (codec adds FR-7 violations, etc.).
 */
export type ViolationRule = `FR-${number}`;

export interface Violation {
  readonly rule: ViolationRule;
  readonly kind: string;
  readonly message: string;
  readonly path: string;
}
