/**
 * Platform storage facade. The rest of the app imports only these names; the
 * error and repository internals stay adapters-only.
 */

export type { RepositoryError, RepositoryResult } from "./errors";
export {
  createCollectionRepository,
  readStoredState,
  writeCandidate,
  type ChangeEventTarget,
  type CollectionRepository,
  type CollectionRepositoryOptions,
  type DeleteInput,
  type DuplicateInput,
  type RenameInput,
  type SaveConstructInput,
  type SavePreferencesInput,
  type SaveRosterInput,
  type StorageLike,
} from "./collection-repository";
export {
  createInitialStateV1,
  getStorageKey,
  getStorageSchemaVersion,
  preloadMigrationModule,
  type ConstructSnapshotV1,
  type MountAssignmentV1,
  type PersistedEntityIdV1,
  type PersistedStateV1,
  type PreferencesV1,
  type ReducedMotionPreferenceV1,
  type SavedConstructIdV1,
  type SavedConstructV1,
  type SavedRosterIdV1,
  type SavedRosterV1,
  type SchemaIssue,
} from "./migration-runtime";
