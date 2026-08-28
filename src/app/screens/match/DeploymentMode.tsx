import * as React from "react";

/**
 * Deployment mode stub — Checkpoint 3 replaces this with the real
 * canvas + drag/select+click layer. Kept as a labeled slot for the
 * shell so Checkpoint 1 tests can render the full route tree.
 */
export function DeploymentMode(): React.ReactElement {
  return (
    <div
      className="match-mode match-mode--deployment"
      role="region"
      aria-label="Deployment board"
      data-testid="mode-deployment"
    >
      <p className="match-mode__title">DEPLOYMENT</p>
      <p className="match-mode__hint">
        Board rendering ships in Checkpoint 2; drag interaction in
        Checkpoint 3.
      </p>
    </div>
  );
}
