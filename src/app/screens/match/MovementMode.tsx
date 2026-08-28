import * as React from "react";

export function MovementMode(): React.ReactElement {
  return (
    <div
      className="match-mode match-mode--movement"
      role="region"
      aria-label="Movement plot board"
      data-testid="mode-movement"
    >
      <p className="match-mode__title">MOVEMENT PLOT</p>
      <p className="match-mode__hint">
        Path plotting layer arrives in Checkpoint 3.
      </p>
    </div>
  );
}
