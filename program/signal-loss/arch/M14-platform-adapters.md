# M14 — Platform adapters

> **Path:** `./src/platform/`
> **Imports from:** M06, M13
> **Status:** shipped in SESSION-02.

## Public API

Facade: `./src/platform/index.ts`.

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

`RepositoryError` discriminants (all nine): `STORAGE_UNAVAILABLE` · `MALFORMED_JSON` · `UNSUPPORTED_VERSION` · `INVALID_SCHEMA` · `MIGRATION_FAILED` · `STALE_REVISION` · `QUOTA_EXCEEDED` · `WRITE_FAILED` · `ENTITY_NOT_FOUND`.

## Internal Structure

| Area | Path |
|---|---|
| Storage | `./src/platform/storage/` (`collection-repository.ts`, `errors.ts`, `migration-runtime.ts`, `migration-shim.d.ts`, `index.ts`) |
| Clipboard | `./src/platform/clipboard/` |
| Capabilities | `./src/platform/capability.ts` |
| Facade | `./src/platform/index.ts` |

## Conventions and Invariants

- One atomic root-document `setItem` per logical write.
- Preserve corrupt raw data and require explicit recovery.
- No adapter may make a runtime network request.
- Every mutation follows the canonical mount order and revision protocol:
  1. Probe storage once, caching the result.
  2. Read and validate the current root.
  3. Reject if `revision !== expectedRevision` (`STALE_REVISION`).
  4. Build a fresh candidate, canonicalizing mount order (ascending hardpoint index).
  5. Allocate ids from `nextEntityId` atomically in the same write.
  6. Increment `revision` exactly once.
  7. Run `validatePersistedStateV1`.
  8. `JSON.stringify` the whole candidate, one `setItem`.
  9. Classify quota errors by DOMException code 22/1014 or names — never by name alone.
- `preloadMigrationModule()` must be called once at app boot before creating any `CollectionRepository` — the boot path / app shell should await it.

## Known Limitation

The existing Vite-ignored dynamic migration import is absent from the static production bundle. As confirmed by `complete-match-loop` acceptance on 2026-08-29, `npm run preview` therefore remains at `LOADING MATCH SETUP…`, although the same setup and complete-match browser flows pass under the Vite development server. Repair requires an M13/M14-owned migration-integration cycle; match features must not add a fallback, bypass persistence validation, or edit the DB-owned migration out of lease.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-02 shipped `./src/platform/**` with `CollectionRepository` over the DB-owned migration, all nine `RepositoryError` discriminants, the atomic revisioned write protocol, storage/clipboard/viewport capability probes, and name-agnostic quota classification. |
| 2026-08-29 | `complete-match-loop` final acceptance confirmed that the existing Vite-ignored migration preload shim is absent from the production bundle and blocks `npm run preview` before setup; development-server match acceptance remains green. |
