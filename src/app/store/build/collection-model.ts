/**
 * Bridges the persistence layer's plain-number snapshots (database.md §5) to
 * the engine's branded build model, and derives the legality / cost / display
 * facts the collection surface renders. The engine's `validateRoster` remains
 * the SOLE source of game legality (database.md §7): a structurally-valid but
 * illegal record is preserved and shown as illegal, never repaired or hidden.
 */

import {
  BUDGETS,
  constructCost,
  rosterCost,
  validateRoster,
  type Budget,
  type Catalog,
  type ChassisCode,
  type CommanderCode,
  type CommanderType,
  type Construct,
  type MountCode,
  type Prebuilt,
  type Roster,
  type Violation,
} from "../../../engine/index";
import type { ConstructSnapshotV1, SavedRosterV1 } from "../../../platform/index";

/** Narrow a persisted numeric budget to the engine's `Budget` union, or null. */
export function asBudget(value: number): Budget | null {
  return (BUDGETS as readonly number[]).includes(value) ? (value as Budget) : null;
}

/** Persisted snapshot → engine construct (plain numbers → branded codes). */
export function snapshotToConstruct(snapshot: ConstructSnapshotV1): Construct {
  return {
    chassisCode: snapshot.chassisCode as ChassisCode,
    commanderCode:
      snapshot.commanderCode === null ? null : (snapshot.commanderCode as CommanderCode),
    mounts: snapshot.mounts.map((m) => ({
      hardpointIndex: m.hardpointIndex,
      mountCode: m.mountCode as MountCode,
    })),
  };
}

/**
 * A prebuilt's constructs as persisted snapshots — used by DUPLICATE TO EDIT
 * to fork a read-only prebuilt into a new writable saved roster (FR-5). The
 * source prebuilt is authored content and is never mutated.
 */
export function prebuiltToSnapshots(prebuilt: Prebuilt): readonly ConstructSnapshotV1[] {
  return prebuilt.constructs.map((c) => ({
    chassisCode: Number(c.chassisCode),
    commanderCode: c.commanderCode === null ? null : Number(c.commanderCode),
    mounts: c.mounts.map((m) => ({ hardpointIndex: m.hardpointIndex, mountCode: Number(m.mountCode) })),
  }));
}

/** Engine construct → persisted snapshot (branded codes → plain numbers). */
export function constructToSnapshot(construct: Construct): ConstructSnapshotV1 {
  return {
    chassisCode: Number(construct.chassisCode),
    commanderCode: construct.commanderCode === null ? null : Number(construct.commanderCode),
    mounts: construct.mounts.map((m) => ({
      hardpointIndex: m.hardpointIndex,
      mountCode: Number(m.mountCode),
    })),
  };
}

/** All snapshots of a saved roster as engine constructs. */
export function rosterToEngineRoster(roster: SavedRosterV1): Roster {
  return { constructs: roster.constructs.map(snapshotToConstruct) };
}

export function constructCostOf(snapshot: ConstructSnapshotV1, catalog: Catalog): number {
  return constructCost(snapshotToConstruct(snapshot), catalog);
}

export function rosterCostOf(roster: SavedRosterV1, catalog: Catalog): number {
  return rosterCost(rosterToEngineRoster(roster), catalog);
}

/**
 * Legality of a saved roster against its declared budget. An invalid budget
 * is itself a violation (validateRoster reports BUDGET_INVALID), so an unknown
 * budget flows through as an illegal-but-preserved record.
 */
export function rosterViolations(roster: SavedRosterV1, catalog: Catalog): readonly Violation[] {
  const budget = asBudget(roster.budget);
  return validateRoster(rosterToEngineRoster(roster), catalog, (budget ?? roster.budget) as Budget);
}

/** The commander type tagged in a roster, if exactly one construct carries one. */
export function commanderOf(roster: SavedRosterV1, catalog: Catalog): CommanderType | null {
  for (const construct of roster.constructs) {
    if (construct.commanderCode !== null) {
      const ct = catalog.indexes.commanderTypeByCode.get(construct.commanderCode as CommanderCode);
      if (ct !== undefined) return ct;
    }
  }
  return null;
}

export interface RosterSummary {
  readonly id: SavedRosterV1["id"];
  readonly name: string;
  readonly budget: number;
  readonly constructCount: number;
  readonly legal: boolean;
  readonly violations: readonly Violation[];
  readonly commanderName: string | null;
  readonly cost: number;
}

/** Derive a narrow display summary for a roster list row (a narrow selector). */
export function rosterSummary(roster: SavedRosterV1, catalog: Catalog): RosterSummary {
  const violations = rosterViolations(roster, catalog);
  return {
    id: roster.id,
    name: roster.name,
    budget: roster.budget,
    constructCount: roster.constructs.length,
    legal: violations.length === 0,
    violations,
    commanderName: commanderOf(roster, catalog)?.name ?? null,
    cost: rosterCostOf(roster, catalog),
  };
}
