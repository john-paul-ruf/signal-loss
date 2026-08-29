import * as React from "react";
import { useMatchStore, countImplicitHolds } from "../../store/match";
import type { MatchStoreError } from "../../store/match";
import { ConfirmModal } from "../shared/ConfirmModal";

/**
 * Command bar (design.md §5.4). Right-hand button is the phase's
 * primary action; the left area holds mode-specific hints. The
 * "NO TIMER — COMMIT WHEN READY" line sits below the button in every
 * plotting phase (design.md §5.4 invariants).
 *
 * Movement commit surfaces a confirm modal listing implicit HOLDs so
 * the player never accidentally commits a partial plot (design.md §5.6).
 */
export function CommandBar(): React.ReactElement {
  const mode = useMatchStore((s) => s.mode);
  const lastError = useMatchStore((s) => s.lastError);
  const engine = useMatchStore((s) => s.engine);
  const launch = useMatchStore((s) => s.launch);
  const drafts = useMatchStore((s) => s.drafts);
  const applyDeployment = useMatchStore((s) => s.applyDeployment);
  const resolveMovement = useMatchStore((s) => s.resolveMovement);
  const resolveAttack = useMatchStore((s) => s.resolveAttack);
  const playbackFinish = useMatchStore((s) => s.playbackFinish);
  const playbackDone = useMatchStore(
    (s) => s.playback.events.length > 0 && s.playback.cursor >= s.playback.events.length,
  );
  const clearError = useMatchStore((s) => s.clearError);
  const [confirmOpen, setConfirmOpen] = React.useState<null | "MOVE" | "ATTACK">(null);

  // Deployment commit gate: every human roster index must carry a draft
  // position before BEGIN MATCH is offered. The engine remains the final
  // authority on a complete-but-illegal placement (applyDeployment).
  const humanConstructCount =
    engine !== null && launch !== null
      ? engine.constructs.filter((c) => c.squadId === launch.humanSquadId).length
      : 0;
  const deploymentUnplaced = countUnplaced(humanConstructCount, drafts.deploymentDrafts);
  const deploymentComplete =
    engine !== null && launch !== null && humanConstructCount > 0 && deploymentUnplaced === 0;

  // Ctrl+Enter fires the mode's commit action.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (mode === "MOVEMENT_PLOT") {
        e.preventDefault();
        openMoveConfirm();
      } else if (mode === "ATTACK_PLOT") {
        e.preventDefault();
        setConfirmOpen("ATTACK");
      } else if (mode === "DEPLOYMENT") {
        e.preventDefault();
        // Same gate as the button — the keyboard path cannot bypass it.
        if (deploymentComplete) applyDeployment();
      } else if (
        (mode === "MOVEMENT_PLAYBACK" || mode === "ATTACK_PLAYBACK") &&
        playbackDone
      ) {
        e.preventDefault();
        playbackFinish();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, applyDeployment, playbackFinish, playbackDone, deploymentComplete]);

  function openMoveConfirm(): void {
    setConfirmOpen("MOVE");
  }

  const implicitHolds =
    engine !== null && launch !== null
      ? countImplicitHolds(engine, launch.humanSquadId, drafts)
      : 0;

  let button: React.ReactElement | null = null;
  let hint: string | null = null;
  switch (mode) {
    case "DEPLOYMENT":
      button = (
        <button
          type="button"
          className="command-bar__commit"
          onClick={applyDeployment}
          disabled={!deploymentComplete}
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
          onClick={openMoveConfirm}
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
          onClick={() => setConfirmOpen("ATTACK")}
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
      <div className="command-bar__actions">
        {mode === "DEPLOYMENT" && !deploymentComplete ? (
          <span
            className="command-bar__status"
            role="status"
            data-testid="deploy-remaining"
          >
            {deploymentUnplaced} CONSTRUCT{deploymentUnplaced === 1 ? "" : "S"} UNPLACED
          </span>
        ) : null}
        {button}
      </div>
      <ConfirmModal
        open={confirmOpen === "MOVE"}
        title="COMMIT MOVEMENT"
        confirmLabel="COMMIT MOVEMENT"
        cancelLabel="EDIT"
        onCancel={() => setConfirmOpen(null)}
        onConfirm={() => {
          setConfirmOpen(null);
          resolveMovement();
        }}
      >
        {implicitHolds > 0 ? (
          <p>
            <strong data-testid="confirm-implicit-holds">{implicitHolds}</strong>{" "}
            construct{implicitHolds === 1 ? "" : "s"} will HOLD.
          </p>
        ) : (
          <p>All constructs plotted.</p>
        )}
      </ConfirmModal>
      <ConfirmModal
        open={confirmOpen === "ATTACK"}
        title="COMMIT ATTACK"
        confirmLabel="COMMIT ATTACK"
        cancelLabel="EDIT"
        onCancel={() => setConfirmOpen(null)}
        onConfirm={() => {
          setConfirmOpen(null);
          resolveAttack();
        }}
      >
        <p>Commit your attack, postures, and called shots for this round.</p>
      </ConfirmModal>
    </div>
  );
}

/** Count human roster indices in `[0, count)` that have no draft position. */
function countUnplaced(count: number, drafts: ReadonlyMap<number, unknown>): number {
  let unplaced = 0;
  for (let i = 0; i < count; i = i + 1) {
    if (!drafts.has(i)) unplaced = unplaced + 1;
  }
  return unplaced;
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
