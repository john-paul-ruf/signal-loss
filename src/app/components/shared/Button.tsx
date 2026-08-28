import * as React from "react";

/**
 * Three semantic button variants, mapping to design.md §3 button tokens:
 *   primary — the affirmative default action per surface (SAVE, LAUNCH).
 *   ghost   — cancel / secondary; visible but low-contrast surface.
 *   danger  — destructive (DELETE, RESET). Uses the `--color-bad` token.
 *
 * The armed-destructive pattern (design.md §5.5) is implemented in
 * `ConfirmModal` — a plain `danger` button is a first-click warning
 * surface, not the commit action.
 */
export type ButtonVariant = "primary" | "ghost" | "danger";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
  readonly children: React.ReactNode;
}

export function Button(props: ButtonProps): React.ReactElement {
  const { variant = "primary", loading = false, disabled = false, children, ...rest } = props;
  const className = `sl-btn sl-btn--${variant}${loading ? " sl-btn--loading" : ""}`;
  return (
    <button
      type={rest.type ?? "button"}
      {...rest}
      className={className}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}
