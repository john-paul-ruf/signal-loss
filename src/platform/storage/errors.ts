import type { SchemaIssue } from "./migration-runtime";

/**
 * Every failure the `CollectionRepository` can surface (database.md §9). Each
 * kind is distinguishable — the recovery surface renders a different message
 * per discriminant, and no code path may coalesce two of them.
 *
 * The nine kinds match `./specs/database.md`'s Error Contract exactly:
 *
 *   STORAGE_UNAVAILABLE — localStorage access threw, or the capability probe
 *     could not confirm write access. Product remains usable without persistence.
 *   MALFORMED_JSON — stored root string does not parse. Preserve the raw value.
 *   UNSUPPORTED_VERSION — persisted `schemaVersion` is newer or has no forward path.
 *   INVALID_SCHEMA — persistence validator rejected the parsed shape.
 *   MIGRATION_FAILED — a forward migration threw or rejected.
 *   STALE_REVISION — an optimistic-write compare-and-swap saw a newer revision.
 *   QUOTA_EXCEEDED — the browser rejected `setItem` for storage-quota reasons.
 *   WRITE_FAILED — any other serialization/storage exception.
 *   ENTITY_NOT_FOUND — an update or delete referenced an id that no longer exists.
 */
export type RepositoryError =
  | { readonly kind: "STORAGE_UNAVAILABLE"; readonly cause?: unknown }
  | { readonly kind: "MALFORMED_JSON"; readonly raw: string }
  | { readonly kind: "UNSUPPORTED_VERSION"; readonly version: unknown }
  | {
      readonly kind: "INVALID_SCHEMA";
      readonly issues: readonly SchemaIssue[];
      readonly raw: string;
    }
  | {
      readonly kind: "MIGRATION_FAILED";
      readonly from: number;
      readonly to: number;
      readonly cause: unknown;
    }
  | { readonly kind: "STALE_REVISION"; readonly expected: number; readonly actual: number }
  | { readonly kind: "QUOTA_EXCEEDED" }
  | { readonly kind: "WRITE_FAILED"; readonly cause: unknown }
  | { readonly kind: "ENTITY_NOT_FOUND"; readonly id: string };

/** Every repository operation resolves to this discriminant. */
export type RepositoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RepositoryError };
