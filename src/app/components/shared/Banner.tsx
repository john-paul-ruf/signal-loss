import * as React from "react";

/**
 * Banner — a persistent status surface for legality, storage-unavailable,
 * and stale-tab conditions (design.md §5.5). Uses `role="status"` (polite)
 * for informational, `role="alert"` (assertive) for actionable errors.
 *
 * Never signals state by color alone — an `icon` slot exposes a text glyph.
 */
export type BannerTone = "info" | "warn" | "bad" | "ok";

export interface BannerProps {
  readonly tone: BannerTone;
  readonly title: string;
  readonly children?: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly assertive?: boolean;
  readonly icon?: string;
}

export function Banner(props: BannerProps): React.ReactElement {
  const { tone, title, children, action, assertive = false, icon } = props;
  const role = assertive ? "alert" : "status";
  const glyph = icon ?? defaultGlyph(tone);
  return (
    <section role={role} aria-live={assertive ? "assertive" : "polite"} className={`sl-banner sl-banner--${tone}`}>
      <span aria-hidden="true" className="sl-banner__glyph">
        {glyph}
      </span>
      <div className="sl-banner__body">
        <p className="sl-banner__title">{title}</p>
        {children !== undefined && <div className="sl-banner__message">{children}</div>}
      </div>
      {action !== undefined && <div className="sl-banner__action">{action}</div>}
    </section>
  );
}

function defaultGlyph(tone: BannerTone): string {
  switch (tone) {
    case "info":
      return "[i]";
    case "warn":
      return "[!]";
    case "bad":
      return "[X]";
    case "ok":
      return "[ok]";
  }
}
