/**
 * Public facade for the view module (M10). Consumers import from here;
 * internals (`public-state.ts`, `resolution-loss.ts`) are implementation
 * details and not part of the engine boundary.
 *
 * Public surface (arch §3.8):
 *   • Types: PublicState, PublicSquad, PublicConstruct, KnownConstruct.
 *   • publicView(state, observer, catalog): PublicState
 *   • resolutionRangeOf(construct, catalog): Fx
 *   • updateKnownPositions(state, catalog): MatchState
 */

export type {
  KnownConstruct,
  PublicConstruct,
  PublicSquad,
  PublicState,
} from "./public-state";

export { publicView } from "./public-state";

export {
  distanceFx,
  movementAllowanceOf,
  resolutionRangeOf,
  updateKnownPositions,
} from "./resolution-loss";
