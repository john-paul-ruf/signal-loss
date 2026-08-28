import type { Catalog } from "../catalog/index";
import type { Construct, Roster } from "./model";

/**
 * Point cost = chassis cost + commander-type cost (if tagged) + sum of
 * mount costs (§FR-2). Missing catalog references contribute zero here —
 * validateConstruct/Roster is the surface that reports those.
 *
 * Costs are integer point values. No fx involved; the pool arithmetic is
 * on small integers.
 */
export function constructCost(construct: Construct, catalog: Catalog): number {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  let total = chassis?.cost ?? 0;
  if (construct.commanderCode !== null) {
    const cmd = catalog.indexes.commanderTypeByCode.get(construct.commanderCode);
    if (cmd !== undefined) {
      total = total + cmd.cost;
    }
  }
  for (const m of construct.mounts) {
    const mount = catalog.indexes.mountByCode.get(m.mountCode);
    if (mount !== undefined) {
      total = total + mount.cost;
    }
  }
  return total;
}

export function rosterCost(roster: Roster, catalog: Catalog): number {
  let total = 0;
  for (const c of roster.constructs) {
    total = total + constructCost(c, catalog);
  }
  return total;
}
