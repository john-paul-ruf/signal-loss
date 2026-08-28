/**
 * Public facade for the build-rules module. Consumers import from here;
 * internals (`model.ts`, `cost.ts`, `validate.ts`, `enumerate.ts`) are
 * implementation details and not part of the engine boundary.
 *
 * One legality implementation, four consumers (arch §3.4): the composer's
 * banner, codec import, AI roster generation, and the costing battery all
 * call validateConstruct/Roster and see the same rule-tagged violations.
 */

export type {
  Construct,
  EffectiveChassis,
  MountAssignment,
  Roster,
  Violation,
  ViolationRule,
} from "./model";

export { constructCost, rosterCost } from "./cost";

export {
  applyCommanderType,
  validateCatalogPrebuilts,
  validateConstruct,
  validateRoster,
} from "./validate";

export {
  chassisFamilyReach,
  enumerateConstructs,
  enumerateConstructsForChassis,
  enumerateConstructsUnderCost,
} from "./enumerate";
