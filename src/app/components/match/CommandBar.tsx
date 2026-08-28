import * as React from "react";
import { useMatchStore } from "../../store/match";
import type { MatchStoreError } from "../../store/match";

/**
 * Command bar (design.md §5.4). Right-hand button is the phase's
 * primary action; the left area holds mode-specific hints. The
 * "NO TIMER — COMMIT WHEN READY" line sits below the button in every
 * plotting phase (design.md §5.4 invariants).
 */
export function CommandBar(): React.ReactElement {
  const mode = useMatchStore((s) => s.mode);
  const lastError = useMatchStore((s) => s.lastError);
  const applyDeployment = useMatchStore((s) => s.applyDeployment);
  const resolveMovement = useMatchStore((s) => s.resolveMovement);
  const resolveAttack = useMatchStore((s) => s.resolveAttack);
  const playbackFinish = useMatchStore((s) => s.playbackFinish);
  const playbackDone = useMatchStore(
    (s) => s.playback.events.length > 0 && s.playback.cursor >= s.playback.events.length,
  );
  const clearError = useMatchStore((s) => s.clearError);

  let button: React.ReactElement | null = null;
  let hint: string | null = null;
  switch (mode) {
    case "DEPLOYMENT":
      button = (
        <button
          type="button"
          className="command-bar__commit"
          onClick={applyDeployment}
          data-testid="commit-deployment"
        >
          BEGIN MATCH ⌃⏎
        </button>
      );
      hint = "NO TIMER — COMMIT WHEN READY";
      break;
    case "MOVEMENT_PLOT":
      button = (
        <button
          type="button"
          className="command-bar__commit"
          onClick={resolveMovement}
          data-testid="commit-movement"
        >
          COMMIT MOVEMENT ⌃⏎
        </button>
      );
      hint = "NO TIMER — COMMIT WHEN READY";
      break;
    case "ATTACK_PLOT":
      button = (
        <button
          type="button"
          className="command-bar__commit"
          onClick={resolveAttack}
          data-testid="commit-attack"
        >
          COMMIT ATTACK ⌃⏎
        </button>
      );
      hint = "NO TIMER — COMMIT WHEN READY";
      break;
    case "MOVEMENT_PLAYBACK":
    case "ATTACK_PLAYBACK":
      button = (
        <button
          type="button"
          className="command-bar__commit"
          onClick={playbackFinish}
          disabled={!playbackDone}
          data-testid="playback-continue"
        >
          {playbackDone ? "CONTINUE →" : "PLAYING…"}
        </button>
      );
      hint = "Playback does not affect the result.";
      break;
    case "RESULT":
      button = null;
      hint = "Match complete.";
      break;
  }

  return (
    <div className="command-bar" role="toolbar" aria-label="Match commands">
      <div className="command-bar__hint" aria-live="polite">
        {hint}
      </div>
      {lastError !== null ? (
        <div className="command-bar__error" role="alert" data-testid="command-error">
          {formatError(lastError)}{" "}
          <button type="button" className="command-bar__error-clear" onClick={clearError}>
            DISMISS
          </button>
        </div>
      ) : null}
      <div className="command-bar__actions">{button}</div>
    </div>
  );
}

function formatError(err: MatchStoreError): string {
  switch (err.kind) {
    case "AI_FAILED":
      return `AI squad ${err.squadId as number} failed: ${err.message}`;
    case "ENGINE_REJECTED":
      return `Engine rejected ${err.stage}: ${err.message}`;
    case "CREATE_FAILED":
      return `Match create failed: ${err.message}`;
    case "LAUNCH_MISSING":
      return "Launch config missing — return to setup.";
  }
}
