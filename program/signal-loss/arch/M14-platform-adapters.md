# M14 — Platform adapters

> **Path:** `./src/platform/`
> **Imports from:** M06, M13
> **Status:** planned for full v1

## Public API
- CollectionRepository result-based port and localStorage adapter
- Clipboard adapter for share strings and seeds
- Capability probes for viewport, storage, and motion preferences

## Internal Structure

| Area | Path |
|---|---|
| Storage | `./src/platform/storage/` |
| Clipboard | `./src/platform/clipboard/` |
| Capabilities | `./src/platform/capability.ts` |

## Conventions and Invariants
- One atomic root-document setItem per logical write.
- Preserve corrupt raw data and require explicit recovery.
- No adapter may make a runtime network request.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-02 -->

## M14 — Platform adapters

Public surface (`./src/platform/index.ts`):

```ts
// Storage
export function createCollectionRepository(options: CollectionRepositoryOptions): CollectionRepository;
export interface CollectionRepository {
  load(): RepositoryResult<PersistedStateV1>;
  resetCorruptStore(confirmed: true): RepositoryResult<PersistedStateV1>;
  subscribeToExternalChange(listener: () => void): () => void;
  saveConstruct(input: SaveConstructInput): RepositoryResult<PersistedStateV1>;
  saveRoster(input: SaveRosterInput): RepositoryResult<PersistedStateV1>;
  renameEntity(input: RenameInput): RepositoryResult<PersistedStateV1>;
  duplicateEntity(input: DuplicateInput): RepositoryResult<PersistedStateV1>;
  deleteEntity(input: DeleteInput): RepositoryResult<PersistedStateV1>;
  savePreferences(input: SavePreferencesInput): RepositoryResult<PersistedStateV1>;
}
export function preloadMigrationModule(): Promise<...>; // call once at boot

// Capabilities
export function meetsDesktopViewport(size: ViewportSize): boolean;
export function readViewportSize(): ViewportSize;
export function resolveReducedMotion(persisted, matchMedia): boolean;
export function resolveMatchMedia(): MatchMediaLike | null;
export function resolveBrowserStorage(): StorageLike | null;
export function probeStorageAvailability(input): StorageProbeResult;
export const MIN_VIEWPORT_WIDTH = 1280;
export const MIN_VIEWPORT_HEIGHT = 720;

// Clipboard
export function copyText(text: string, clipboard: ClipboardLike | null): Promise<ClipboardResult>;
export function resolveBrowserClipboard(): ClipboardLike | null;
```

`RepositoryError` discriminants: STORAGE_UNAVAILABLE · MALFORMED_JSON ·
UNSUPPORTED_VERSION · INVALID_SCHEMA · MIGRATION_FAILED · STALE_REVISION ·
QUOTA_EXCEEDED · WRITE_FAILED · ENTITY_NOT_FOUND. Every mutation:

1. Probes storage once, caching the result.
2. Reads and validates the current root.
3. Rejects if `revision !== expectedRevision` (`STALE_REVISION`).
4. Builds a fresh candidate, canonicalizing mount order (ascending
   hardpoint index).
5. Allocates ids from `nextEntityId` atomically in the same write.
6. Increments `revision` exactly once.
7. Runs `validatePersistedStateV1`.
8. `JSON.stringify` the whole candidate, one `setItem`.
9. Classifies quota errors by DOMException code 22/1014 or names —
   never by name alone.

