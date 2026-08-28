/**
 * Clipboard adapter. Modern browsers expose `navigator.clipboard.writeText`
 * as async and requires user gesture + secure context. Older browsers and
 * privacy modes reject the call; we surface those as a typed result so the
 * UI can show a copy-manually fallback panel (design.md §5.1).
 *
 * No network calls, no telemetry: the clipboard write is entirely local.
 */

export type ClipboardError =
  | { readonly kind: "UNSUPPORTED" }
  | { readonly kind: "DENIED"; readonly cause?: unknown }
  | { readonly kind: "WRITE_FAILED"; readonly cause: unknown };

export type ClipboardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: ClipboardError };

/** The subset of the browser Clipboard API we depend on. */
export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Try to copy the given text to the clipboard. Never throws; every failure
 * is classified. Callers may render the source text alongside the failure
 * so users can copy manually.
 */
export async function copyText(
  text: string,
  clipboard: ClipboardLike | null,
): Promise<ClipboardResult> {
  if (clipboard === null) {
    return { ok: false, error: { kind: "UNSUPPORTED" } };
  }
  try {
    await clipboard.writeText(text);
    return { ok: true };
  } catch (cause) {
    if (isDenied(cause)) {
      return { ok: false, error: { kind: "DENIED", cause } };
    }
    return { ok: false, error: { kind: "WRITE_FAILED", cause } };
  }
}

/**
 * Resolve the browser clipboard if available. Returns `null` when running in
 * a non-DOM environment or when the API is missing (older browsers, disabled
 * privacy mode).
 */
export function resolveBrowserClipboard(): ClipboardLike | null {
  if (typeof navigator === "undefined") return null;
  const record = navigator as { clipboard?: { writeText?: (t: string) => Promise<void> } };
  const cb = record.clipboard;
  if (cb === undefined) return null;
  const writeText = cb.writeText;
  if (typeof writeText !== "function") return null;
  return { writeText: (text: string) => writeText.call(cb, text) };
}

function isDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { name?: unknown; code?: unknown };
  if (record.name === "NotAllowedError") return true;
  // DOMException code 18 = SecurityError
  if (record.code === 18) return true;
  return false;
}
