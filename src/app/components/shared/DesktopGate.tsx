import * as React from "react";

/**
 * DesktopGate — the under-1280 blocker (design.md §5.0, NFR-4). The
 * caller passes `visible` derived from `meetsDesktopViewport(...)`
 * inversion; when true, this covers the app root and states the
 * minimum-viewport contract in-product with no external links.
 */
export interface DesktopGateProps {
  readonly visible: boolean;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly currentWidth: number;
  readonly currentHeight: number;
}

export function DesktopGate(props: DesktopGateProps): React.ReactElement | null {
  const { visible, minWidth, minHeight, currentWidth, currentHeight } = props;
  if (!visible) return null;
  return (
    <div className="sl-desktop-gate" role="alertdialog" aria-modal="true"
      aria-labelledby="sl-desktop-gate-title"
      aria-describedby="sl-desktop-gate-msg"
    >
      <div className="sl-desktop-gate__card">
        <h1 id="sl-desktop-gate-title" className="sl-desktop-gate__title">
          SIGNAL LOSS · DESKTOP ONLY
        </h1>
        <p id="sl-desktop-gate-msg" className="sl-desktop-gate__msg">
          This build is authored for a desktop viewport at least{" "}
          <strong>
            {minWidth} × {minHeight}
          </strong>
          . Your current viewport is{" "}
          <strong>
            {currentWidth} × {currentHeight}
          </strong>
          . Resize your window or switch to a wider display to continue.
        </p>
      </div>
    </div>
  );
}
