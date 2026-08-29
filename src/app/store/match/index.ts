/**
 * Match store facade — the one import path any match component or
 * screen uses. Everything else stays private to this subtree.
 */

export {
  createMatchStore,
  visibleEvents,
  type MatchStore,
  type MatchStoreActions,
  type MatchStoreError,
  type MatchStoreState,
} from "./match-store";

export type {
  AiStatus,
  ExchangeCardMap,
  HumanDraftState,
  LaunchSnapshot,
  MatchModeId,
  MatchPresentation,
  PlaybackState,
  SelectionState,
} from "./types";

export { exchangeKey } from "./types";

export {
  buildHumanAttackPlot,
  buildHumanMovePlot,
  countImplicitHolds,
  everyConstructAccountedFor,
  projectedPoolSpend,
} from "./plot-draft";

export { startAiPhase } from "./ai-phase";

export {
  MatchStoreProvider,
  useMatchStore,
  useMatchStoreActions,
} from "./context";

export * as matchSelectors from "./selectors";
