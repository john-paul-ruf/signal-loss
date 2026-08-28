/**
 * Composer entry context — a one-shot handoff from the collection screen
 * (Flow B: duplicate a prebuilt → composer → edit a construct → save) to
 * the composer route. Hash-route navigation remounts the target screen, so
 * this is a module-level mailbox rather than component state: the sender
 * writes once immediately before navigating, the composer consumes it once
 * on mount. Absent a request, the composer opens a fresh standalone draft
 * (design.md §5.2 — "a single construct draft may remain untagged until
 * roster assembly", i.e. composing outside any roster is a legal mode too).
 */
import type { SavedRosterIdV1 } from "../../../platform/index";

export interface ComposerRequest {
  readonly rosterId: SavedRosterIdV1;
  /** Index into the roster's constructs to edit, or the roster's length to append a new one. */
  readonly constructIndex: number;
}

let pending: ComposerRequest | null = null;

export function requestComposerEdit(request: ComposerRequest): void {
  pending = request;
}

/** Reads and clears the pending request — safe to call at most meaningfully once per mount. */
export function consumeComposerRequest(): ComposerRequest | null {
  const request = pending;
  pending = null;
  return request;
}
