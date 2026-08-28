import * as React from "react";

export function AttackMode(): React.ReactElement {
  return (
    <div
      className="match-mode match-mode--attack"
      role="region"
      aria-label="Attack plot board"
      data-testid="mode-attack"
    >
      <p className="match-mode__title">ATTACK PLOT</p>
      <p className="match-mode__hint">
        Ledger + Exchange Card land in Checkpoint 4.
      </p>
    </div>
  );
}
