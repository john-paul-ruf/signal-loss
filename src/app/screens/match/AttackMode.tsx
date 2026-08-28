import * as React from "react";
import { BoardCanvas } from "../../board";

export function AttackMode(): React.ReactElement {
  return (
    <div className="match-mode match-mode--attack" data-testid="mode-attack">
      <BoardCanvas />
    </div>
  );
}
