import * as React from "react";

/**
 * ToastRegion — a single ARIA live region that renders queued transient
 * messages. Modeled as a small in-memory queue where the consumer pushes
 * `{ id, message, tone }` via the store; the DOM node just projects.
 *
 * The region uses `aria-live="polite"` so screen readers announce
 * additions without interrupting.
 */
export type ToastTone = "info" | "warn" | "bad" | "ok";

export interface ToastEntry {
  readonly id: string;
  readonly message: string;
  readonly tone: ToastTone;
}

export interface ToastRegionProps {
  readonly toasts: readonly ToastEntry[];
  readonly onDismiss?: (id: string) => void;
}

export function ToastRegion(props: ToastRegionProps): React.ReactElement {
  const { toasts, onDismiss } = props;
  return (
    <div
      className="sl-toast-region"
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
      role="log"
    >
      {toasts.map((toast) => (
        <output key={toast.id} className={`sl-toast sl-toast--${toast.tone}`}>
          <span className="sl-toast__message">{toast.message}</span>
          {onDismiss !== undefined && (
            <button
              type="button"
              className="sl-toast__dismiss"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
            >
              ×
            </button>
          )}
        </output>
      ))}
    </div>
  );
}
