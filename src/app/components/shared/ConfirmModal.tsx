import * as React from "react";
import { Button } from "./Button";
import { FocusTrap } from "./FocusTrap";

/**
 * ConfirmModal — the armed-destructive pattern (design.md §5.5). A caller
 * shows the modal; the user must click the destructive button explicitly.
 * The button label announces the destructive intent verbatim ("DELETE
 * ROSTER — CONFIRM"), never just "OK".
 *
 * Escape and the Cancel button both call `onCancel`. Focus is trapped;
 * on close, focus returns to whoever opened the modal (FocusTrap).
 */
export interface ConfirmModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly children?: React.ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly destructive?: boolean;
}

export function ConfirmModal(props: ConfirmModalProps): React.ReactElement | null {
  const {
    open,
    title,
    children,
    confirmLabel,
    cancelLabel = "CANCEL",
    onConfirm,
    onCancel,
    destructive = false,
  } = props;
  const titleId = React.useId();
  const bodyId = React.useId();
  if (!open) return null;
  return (
    <div className="sl-modal-scrim" onMouseDown={onCancel}>
      <div className="sl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <FocusTrap active={open} labelId={titleId} describedById={bodyId} onEscape={onCancel}>
          <h2 id={titleId} className="sl-modal__title">
            {title}
          </h2>
          <div id={bodyId} className="sl-modal__body">
            {children}
          </div>
          <div className="sl-modal__actions">
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </FocusTrap>
      </div>
    </div>
  );
}
