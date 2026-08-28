/**
 * Platform facade — the app imports every browser-side capability through
 * this module. The engine never depends on this file.
 */

export {
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  meetsDesktopViewport,
  probeStorageAvailability,
  readViewportSize,
  resolveBrowserStorage,
  resolveMatchMedia,
  resolveReducedMotion,
  type MatchMediaLike,
  type StorageProbeInput,
  type StorageProbeResult,
  type ViewportSize,
} from "./capability";

export {
  copyText,
  resolveBrowserClipboard,
  type ClipboardError,
  type ClipboardLike,
  type ClipboardResult,
} from "./clipboard/index";

export {
  createCollectionRepository,
  createInitialStateV1,
  getStorageKey,
  getStorageSchemaVersion,
  preloadMigrationModule,
  readStoredState,
  writeCandidate,
  type ChangeEventTarget,
  type CollectionRepository,
  type CollectionRepositoryOptions,
  type ConstructSnapshotV1,
  type DeleteInput,
  type DuplicateInput,
  type MountAssignmentV1,
  type PersistedEntityIdV1,
  type PersistedStateV1,
  type PreferencesV1,
  type ReducedMotionPreferenceV1,
  type RenameInput,
  type RepositoryError,
  type RepositoryResult,
  type SaveConstructInput,
  type SavePreferencesInput,
  type SaveRosterInput,
  type SavedConstructIdV1,
  type SavedConstructV1,
  type SavedRosterIdV1,
  type SavedRosterV1,
  type SchemaIssue,
  type StorageLike,
} from "./storage/index";
