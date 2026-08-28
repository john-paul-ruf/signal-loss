/**
 * Core store facade — one Zustand vanilla store per concern (collection,
 * navigation, preferences, transient flow). Build/setup and match sessions
 * add their own store subtrees but never reach into these implementations.
 */

export {
  createCollectionStore,
  type CollectionActions,
  type CollectionStore,
  type CollectionStoreState,
} from "./collection-store";

export {
  createNavigationStore,
  normalizeHashPath,
  type NavigationActions,
  type NavigationOptions,
  type NavigationState,
  type NavigationStore,
} from "./navigation-store";

export {
  createPreferencesStore,
  type PreferencesActions,
  type PreferencesState,
  type PreferencesStore,
} from "./preferences-store";

export {
  createFlowStore,
  type FlowActions,
  type FlowState,
  type FlowStore,
  type MatchLaunchConfig,
  type MatchResultPayload,
} from "./flow-store";
