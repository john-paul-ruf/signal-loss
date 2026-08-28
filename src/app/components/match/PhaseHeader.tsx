import * as React from "react";
import { useMatchStore } from "../../store/match";

const MODE_LABEL: Record<string, string> = {
  DEPLOYMENT: "DEPLOYMENT",
  MOVEMENT_PLOT: "MOVEMENT PLOT",
  MOVEMENT_PLAYBACK: "MOVEMENT · PLAYBACK",
  ATTACK_PLOT: "ATTACK PLOT",
  ATTACK_PLAYBACK: "ATTACK · PLAYBACK",
  RESULT: "MATCH COMPLETE",
};

/**
 * Round + phase indicator. FR-13 requires round and phase to be visible
 * at all times. Uses mono for numerals per design.md §7.6.
 */
export function PhaseHeader(): React.ReactElement {
  const round = useMatchStore((s) => s.engine?.round ?? 0);
  const mode = useMatchStore((s) => s.mode);
  const label = MODE_LABEL[mode] ?? mode;
  return (
    <div className="phase-header" role="group" aria-label="Round and phase">
      <div className="phase-header__round" aria-label={`Round ${round}`}>
        <span className="phase-header__round-glyph" aria-hidden="true">R</span>
        <span className="phase-header__round-num" data-testid="round">
          {round.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="phase-header__meta">
        <div className="phase-header__sub">ROUND {round} · 24 MAX</div>
        <div className="phase-header__phase" data-testid="phase">
          PHASE: {label}
        </div>
      </div>
    </div>
  );
}
