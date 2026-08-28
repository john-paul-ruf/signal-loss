import * as React from "react";
import { BoardCanvas } from "../../board";

export function MovementMode(): React.ReactElement {
  return (
    <div className="match-mode match-mode--movement" data-testid="mode-movement">
      <BoardCanvas />
    </div>
  );
}
