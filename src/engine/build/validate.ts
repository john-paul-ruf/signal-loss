import {
  BUDGETS,
  type Budget,
  type Catalog,
  type Chassis,
  type CommanderType,
  type DialState,
  type Prebuilt,
} from "../catalog/index";
import { type Fx, fxAdd, fxClamp } from "../fx/index";
import { rosterCost } from "./cost";
import type { Construct, EffectiveChassis, Roster, Violation } from "./model";

/**
 * validateConstruct — enforce composition rules on a single construct.
 * Every violation names its rule and its path (§3.4).
 *
 * Rules enforced:
 *   FR-1  Chassis reference must exist in the catalog.
 *   FR-2  Hardpoint indices in-range, unique, sorted; mount code must
 *         exist; mount's requiredHardpointType must match the hardpoint's
 *         typeId (PORT_TYPE_MISMATCH names both sides — design.md §5.2's
 *         "PORT: X · MOUNT: Y" contract).
 *   FR-3  Commander code, when non-null, must exist in the catalog.
 */
export function validateConstruct(
  construct: Construct,
  catalog: Catalog,
): readonly Violation[] {
  const errors: Violation[] = [];
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) {
    errors.push({
      rule: "FR-1",
      kind: "UNKNOWN_CHASSIS",
      message: `Chassis code ${construct.chassisCode} is not in the catalog.`,
      path: "chassisCode",
    });
    return errors;
  }

  if (construct.commanderCode !== null) {
    const commander = catalog.indexes.commanderTypeByCode.get(construct.commanderCode);
    if (commander === undefined) {
      errors.push({
        rule: "FR-3",
        kind: "UNKNOWN_COMMANDER",
        message: `Commander code ${construct.commanderCode} is not in the catalog.`,
        path: "commanderCode",
      });
    }
  }

  const seenIndices = new Set<number>();
  let previous = -1;
  construct.mounts.forEach((m, i) => {
    const path = `mounts[${i}]`;
    if (!Number.isInteger(m.hardpointIndex)) {
      errors.push({
        rule: "FR-2",
        kind: "HARDPOINT_INDEX_TYPE",
        message: `Hardpoint index must be an integer; got ${m.hardpointIndex}.`,
        path: `${path}.hardpointIndex`,
      });
      return;
    }
    if (m.hardpointIndex < 0 || m.hardpointIndex >= chassis.hardpoints.length) {
      errors.push({
        rule: "FR-2",
        kind: "HARDPOINT_INDEX_OUT_OF_RANGE",
        message: `Hardpoint index ${m.hardpointIndex} is not in the chassis (it has ${chassis.hardpoints.length} hardpoints).`,
        path: `${path}.hardpointIndex`,
      });
      return;
    }
    if (seenIndices.has(m.hardpointIndex)) {
      errors.push({
        rule: "FR-2",
        kind: "HARDPOINT_DUPLICATE",
        message: `Hardpoint ${m.hardpointIndex} is referenced more than once.`,
        path: `${path}.hardpointIndex`,
      });
      return;
    }
    if (m.hardpointIndex <= previous) {
      errors.push({
        rule: "FR-2",
        kind: "HARDPOINT_ORDER",
        message: `Mounts must be sorted by ascending hardpoint index.`,
        path: `${path}.hardpointIndex`,
      });
    }
    seenIndices.add(m.hardpointIndex);
    previous = m.hardpointIndex;

    const hardpoint = chassis.hardpoints[m.hardpointIndex];
    if (hardpoint === undefined) return;
    const mount = catalog.indexes.mountByCode.get(m.mountCode);
    if (mount === undefined) {
      errors.push({
        rule: "FR-2",
        kind: "UNKNOWN_MOUNT",
        message: `Mount code ${m.mountCode} is not in the catalog.`,
        path: `${path}.mountCode`,
      });
      return;
    }
    if (mount.requiredHardpointType !== hardpoint.typeId) {
      errors.push({
        rule: "FR-2",
        kind: "PORT_TYPE_MISMATCH",
        message: `Port ${JSON.stringify(hardpoint.typeId as string)} · mount ${JSON.stringify(mount.requiredHardpointType as string)}.`,
        path: `${path}.mountCode`,
      });
    }
  });
  return errors;
}

/**
 * validateRoster — enforce roster-scoped rules and delegate per-construct
 * to validateConstruct.
 *
 * Rules enforced:
 *   FR-3  Exactly one commander per roster — zero or two-plus rejected.
 *   FR-4  Budget must be one of the 8 canonical values; roster size
 *         between 1 and Tunables.MAX_SQUAD inclusive; roster cost may
 *         equal or fall below the budget (under-spend legal).
 */
export function validateRoster(
  roster: Roster,
  catalog: Catalog,
  budget: Budget,
): readonly Violation[] {
  const errors: Violation[] = [];

  if (!(BUDGETS as readonly number[]).includes(budget as number)) {
    errors.push({
      rule: "FR-4",
      kind: "BUDGET_INVALID",
      message: `Budget must be one of ${BUDGETS.join(", ")}; got ${budget}.`,
      path: "budget",
    });
  }

  const n = roster.constructs.length;
  if (n < 1) {
    errors.push({
      rule: "FR-4",
      kind: "EMPTY_ROSTER",
      message: `Roster must contain at least one construct; got ${n}.`,
      path: "constructs",
    });
  }
  if (n > catalog.tunables.MAX_SQUAD) {
    errors.push({
      rule: "FR-4",
      kind: "OVER_SQUAD_CAP",
      message: `Roster has ${n} constructs; MAX_SQUAD is ${catalog.tunables.MAX_SQUAD}.`,
      path: "constructs",
    });
  }

  roster.constructs.forEach((c, i) => {
    const inner = validateConstruct(c, catalog);
    for (const v of inner) {
      errors.push({
        rule: v.rule,
        kind: v.kind,
        message: v.message,
        path: `constructs[${i}].${v.path}`,
      });
    }
  });

  const commanderCount = roster.constructs.filter((c) => c.commanderCode !== null).length;
  if (commanderCount === 0) {
    errors.push({
      rule: "FR-3",
      kind: "NO_COMMANDER",
      message: "A roster must contain exactly one commander; got 0.",
      path: "constructs",
    });
  } else if (commanderCount > 1) {
    errors.push({
      rule: "FR-3",
      kind: "MULTIPLE_COMMANDERS",
      message: `A roster must contain exactly one commander; got ${commanderCount}.`,
      path: "constructs",
    });
  }

  const cost = rosterCost(roster, catalog);
  if (cost > (budget as number)) {
    errors.push({
      rule: "FR-4",
      kind: "OVER_BUDGET",
      message: `Roster costs ${cost}; budget is ${budget}.`,
      path: "constructs",
    });
  }

  return errors;
}

/**
 * applyCommanderType — return a chassis-shaped view with the commander
 * type's modifications applied. FR-3 requires this be visible in the build
 * zone before committing, so it must:
 *   - Append `extraDialStates` copies of the final state (integrity
 *     commanders extend the dial).
 *   - Add `movementDelta` to every state's movement allowance.
 *   - Add `damageDelta` to every state's damage.
 *   - Add `defenseDelta` to every state's defense modifier.
 *   - Add `rangeDelta` to the chassis's base range (per-state
 *     rangeModifier stays untouched — commander rangeDelta shifts the
 *     BASE, not the modifier ladder).
 *   - Clamp the resulting base range into [rangeClamp.min, rangeClamp.max].
 */
export function applyCommanderType(
  chassis: Chassis,
  commander: CommanderType,
): EffectiveChassis {
  const mods = commander.modifications;

  const originalDial = chassis.dial;
  const lastState = originalDial[originalDial.length - 1];
  const withExtras: DialState[] = originalDial.slice();
  if (lastState !== undefined) {
    for (let i = 0; i < mods.extraDialStates; i = i + 1) {
      withExtras.push({
        index: originalDial.length + i,
        movementAllowance: lastState.movementAllowance,
        damage: lastState.damage,
        rangeModifier: lastState.rangeModifier,
        defenseModifier: lastState.defenseModifier,
      });
    }
  }

  const modifiedDial: DialState[] = withExtras.map((state, index) => ({
    index,
    movementAllowance: fxAdd(state.movementAllowance, mods.movementDelta),
    damage: state.damage + mods.damageDelta,
    rangeModifier: state.rangeModifier,
    defenseModifier: state.defenseModifier + mods.defenseDelta,
  }));

  const raisedBase = fxAdd(chassis.baseRange, mods.rangeDelta);
  const clampedBase: Fx = fxClamp(raisedBase, chassis.rangeClamp.min, chassis.rangeClamp.max);

  return {
    source: chassis,
    commander,
    baseRange: clampedBase,
    rangeClamp: chassis.rangeClamp,
    resolutionRange: chassis.resolutionRange,
    footprint: chassis.footprint,
    hardpoints: chassis.hardpoints,
    dial: modifiedDial,
  };
}

/**
 * Convenience: validate every prebuilt in a catalog through validateRoster.
 * Session 06 will call this on the release catalog; the fixture in this
 * checkpoint is exercised too. Returns violations tagged with the prebuilt
 * id in the path.
 */
export function validateCatalogPrebuilts(catalog: Catalog): readonly Violation[] {
  const errors: Violation[] = [];
  for (const prebuilt of catalog.prebuilts) {
    const violations = validatePrebuilt(prebuilt, catalog);
    for (const v of violations) {
      errors.push({
        rule: v.rule,
        kind: v.kind,
        message: v.message,
        path: `prebuilts[${prebuilt.id as string}].${v.path}`,
      });
    }
  }
  return errors;
}

function validatePrebuilt(prebuilt: Prebuilt, catalog: Catalog): readonly Violation[] {
  const roster: Roster = {
    constructs: prebuilt.constructs.map((c) => ({
      chassisCode: c.chassisCode,
      commanderCode: c.commanderCode,
      mounts: c.mounts.map((m) => ({
        hardpointIndex: m.hardpointIndex,
        mountCode: m.mountCode,
      })),
    })),
  };
  return validateRoster(roster, catalog, prebuilt.budget);
}
