import * as React from "react";

/**
 * FocusTrap — a lightweight focus containment for modals. On mount it
 * captures the previously-focused element, moves focus to the first
 * focusable descendant, and cycles Tab/Shift-Tab within the trap. On
 * unmount it restores focus to the previous owner.
 *
 * Does NOT poll for focus outside the trap — we don't want to fight
 * accessibility tooling. Descendant components that call `element.focus()`
 * still work.
 */
export interface FocusTrapProps {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly labelId?: string;
  readonly describedById?: string;
  readonly onEscape?: () => void;
}

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function FocusTrap(props: FocusTrapProps): React.ReactElement {
  const { active, children, labelId, describedById, onEscape } = props;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (container === null) return undefined;
    const currentActive = document.activeElement;
    previousFocusRef.current = currentActive instanceof HTMLElement ? currentActive : null;
    const first = focusableWithin(container)[0];
    first?.focus();
    return () => {
      const previous = previousFocusRef.current;
      if (previous !== null && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!active) return;
    if (event.key === "Escape" && onEscape !== undefined) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const container = containerRef.current;
    if (container === null) return;
    const focusable = focusableWithin(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeEl = document.activeElement;
    if (!event.shiftKey && activeEl === last && first !== undefined) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && activeEl === first && last !== undefined) {
      event.preventDefault();
      last.focus();
    }
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={describedById}
      onKeyDown={onKeyDown}
      className="sl-focus-trap"
    >
      {children}
    </div>
  );
}

function focusableWithin(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter((el) => !el.hasAttribute("inert"));
}
