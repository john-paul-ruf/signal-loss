import * as React from "react";
import { BoardCanvas } from "../../board";

/**
 * Deployment mode — the canvas + spawn overlay ships in Checkpoint 3.
 * The board canvas already renders the terrain/spawn/wall layers from
 * PublicState, so Checkpoint 2's contract is met here even before
 * drag interaction lands.
 */
export function DeploymentMode(): React.ReactElement {
  return (
    <div className="match-mode match-mode--deployment" data-testid="mode-deployment">
      <BoardCanvas />
    </div>
  );
}
