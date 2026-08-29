/**
 * Build-zone store facade. Currently the validated release-catalog resolver
 * and app metadata; the composer/collection/setup draft stores are added in
 * later checkpoints of this session under this same subtree.
 */

export { resolveCatalog, formatCatalogErrors } from "./catalog";
export { APP_VERSION } from "./app-info";
export {
  SQUAD_LADDER,
  type SquadIdentity,
} from "./squad-identity";
export {
  asBudget,
  commanderOf,
  constructCostOf,
  constructToSnapshot,
  prebuiltToSnapshots,
  rosterCostOf,
  rosterSummary,
  rosterToEngineRoster,
  rosterViolations,
  snapshotToConstruct,
  type RosterSummary,
} from "./collection-model";
export {
  exportConstructSnapshot,
  exportRoster,
  importShareString,
  outcomeFromDecode,
  type ImportOutcome,
} from "./share";
export {
  CollectionProvider,
  useCollection,
  useCollectionBinding,
  type CollectionBinding,
  type CollectionProviderProps,
} from "./collection-context";
export {
  draftCost,
  draftFromConstruct,
  draftToConstruct,
  draftViolations,
  isComposable,
  mountAt,
  mountMismatchReason,
  removeMount,
  setChassis,
  setCommander,
  setMount,
  EMPTY_DRAFT,
  type ComposerDraft,
} from "./composer";
export {
  consumeComposerRequest,
  requestComposerEdit,
  type ComposerRequest,
} from "./composer-context";
export {
  AI_ROSTER_STREAM_LABELS,
  createSetupGenerationService,
  createUserSeed,
  makeSetupDraft,
  prepareSetup,
  selectorForArchetype,
  validateSetupDraft,
  type CryptoLike,
  type PreparedSetup,
  type SeedResult,
  type SetupDraft,
  type SetupDraftIssue,
  type SetupFailureKind,
  type SetupGeneration,
  type SetupGenerationClients,
  type SetupGenerationService,
  type SetupPreparationFailure,
  type SetupPreparationResult,
} from "./setup-model";
export {
  browserMapGenWorker,
  createMapGenClient,
  type MapGenCallResult,
  type MapGenClient,
  type MapGenClientOptions,
  type MapWorkerFactory,
  type MapWorkerTarget,
} from "../../bridge/mapgen-client";
