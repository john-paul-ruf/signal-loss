/**
 * Composer draft model (design.md §5.2, FR-2, FR-3). A draft is a single
 * construct under construction: chassis, an optional commander tag, and
 * mounts placed into typed hardpoints. Roster-level rules (exactly one
 * commander, budget-vs-roster) are validateRoster's concern elsewhere —
 * "a single construct draft may remain untagged until roster assembly"
 * (design.md §5.2) — so a draft's own legality is validateConstruct only:
 * chassis/commander/mount references exist, hardpoints are in range and
 * unique, and every mount's type matches its port.
 */

import {
  constructCost,
  validateConstruct,
  type Catalog,
  type ChassisCode,
  type CommanderCode,
  type Construct,
  type MountAssignment,
  type MountCode,
  type Violation,
} from "../../../engine/index";

export interface ComposerDraft {
  readonly chassisCode: ChassisCode | null;
  readonly commanderCode: CommanderCode | null;
  readonly mounts: readonly MountAssignment[];
}

export const EMPTY_DRAFT: ComposerDraft = {
  chassisCode: null,
  commanderCode: null,
  mounts: [],
};

export function draftFromConstruct(construct: Construct): ComposerDraft {
  return {
    chassisCode: construct.chassisCode,
    commanderCode: construct.commanderCode,
    mounts: construct.mounts.map((m) => ({ ...m })),
  };
}

/** Selecting a new chassis resets mounts — the prior hardpoint layout no longer applies. */
export function setChassis(draft: ComposerDraft, chassisCode: ChassisCode): ComposerDraft {
  return { ...draft, chassisCode, mounts: [] };
}

export function setCommander(draft: ComposerDraft, commanderCode: CommanderCode | null): ComposerDraft {
  return { ...draft, commanderCode };
}

export function setMount(
  draft: ComposerDraft,
  hardpointIndex: number,
  mountCode: MountCode,
): ComposerDraft {
  const next = draft.mounts.filter((m) => m.hardpointIndex !== hardpointIndex);
  next.push({ hardpointIndex, mountCode });
  next.sort((a, b) => a.hardpointIndex - b.hardpointIndex);
  return { ...draft, mounts: next };
}

export function removeMount(draft: ComposerDraft, hardpointIndex: number): ComposerDraft {
  return { ...draft, mounts: draft.mounts.filter((m) => m.hardpointIndex !== hardpointIndex) };
}

export function mountAt(draft: ComposerDraft, hardpointIndex: number): MountAssignment | null {
  return draft.mounts.find((m) => m.hardpointIndex === hardpointIndex) ?? null;
}

export function isComposable(
  draft: ComposerDraft,
): draft is ComposerDraft & { chassisCode: ChassisCode } {
  return draft.chassisCode !== null;
}

export function draftToConstruct(draft: ComposerDraft & { chassisCode: ChassisCode }): Construct {
  return { chassisCode: draft.chassisCode, commanderCode: draft.commanderCode, mounts: draft.mounts };
}

const NO_CHASSIS_VIOLATION: Violation = {
  rule: "FR-1",
  kind: "NO_CHASSIS",
  message: "Select a chassis to compose a construct.",
  path: "chassisCode",
};

/** The draft's own legality — chassis/commander/mount references and port-type matches. */
export function draftViolations(draft: ComposerDraft, catalog: Catalog): readonly Violation[] {
  if (!isComposable(draft)) return [NO_CHASSIS_VIOLATION];
  return validateConstruct(draftToConstruct(draft), catalog);
}

export function draftCost(draft: ComposerDraft, catalog: Catalog): number {
  if (!isComposable(draft)) return 0;
  return constructCost(draftToConstruct(draft), catalog);
}

/**
 * The exact reason a mount cannot occupy a hardpoint (design.md §5.2's
 * "PORT: X · MOUNT: Y" contract, FR-2). Returns null when the pairing is
 * legal or references cannot be resolved (nothing to report yet).
 */
export function mountMismatchReason(
  draft: ComposerDraft,
  hardpointIndex: number,
  mountCode: MountCode,
  catalog: Catalog,
): string | null {
  if (!isComposable(draft)) return null;
  const chassis = catalog.indexes.chassisByCode.get(draft.chassisCode);
  const hardpoint = chassis?.hardpoints[hardpointIndex];
  const mount = catalog.indexes.mountByCode.get(mountCode);
  if (chassis === undefined || hardpoint === undefined || mount === undefined) return null;
  if (mount.requiredHardpointType === hardpoint.typeId) return null;
  const portName = catalog.indexes.hardpointTypeById.get(hardpoint.typeId)?.name ?? String(hardpoint.typeId);
  const mountTypeName =
    catalog.indexes.hardpointTypeById.get(mount.requiredHardpointType)?.name ?? String(mount.requiredHardpointType);
  return `PORT: ${portName} · MOUNT: ${mountTypeName}`;
}
