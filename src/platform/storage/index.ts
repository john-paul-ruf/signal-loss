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
  type StorageLike,
} from "./collection-repository";
