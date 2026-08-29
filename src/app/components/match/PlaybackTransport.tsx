import * as React from "react";
import { useMatchStore } from "../../store/match";
import "./playback.css";

export function PlaybackTransport(): React.ReactElement {
  const playback = useMatchStore((state) => state.playback);
  const reducedMotion = useMatchStore((state) => state.present.reducedMotion);
  const setRunning = useMatchStore((state) => state.playbackSetRunning);
  const stepBy = useMatchStore((state) => state.playbackStepBy);
  const skip = useMatchStore((state) => state.playbackSkip);
  const setSpeed = useMatchStore((state) => state.playbackSetSpeed);
  const done = playback.cursor >= playback.events.length;
  const status = done ? "COMPLETE" : playback.running ? "PLAYING" : "PAUSED";

  return (
    <div className="playback-transport" role="toolbar" aria-label="Playback transport" data-testid="playback-transport">
      <span className="playback-transport__status" data-testid="playback-status">
        {playback.running ? "▶" : done ? "■" : "Ⅱ"} {status}
      </span>
      <span className="playback-transport__count">
        EVENT {playback.cursor} / {playback.events.length}
      </span>
      {reducedMotion ? (
        <>
          <button type="button" onClick={() => stepBy(-1)} disabled={playback.cursor === 0}>← PREVIOUS</button>
          <button type="button" onClick={() => stepBy(1)} disabled={done} data-testid="rm-advance">NEXT →</button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRunning(!playback.running)}
            disabled={done}
            data-testid={playback.running ? "pb-pause" : "pb-play"}
          >
            {playback.running ? "PAUSE" : "PLAY"}
          </button>
          <button type="button" onClick={() => { setRunning(false); stepBy(1); }} disabled={done} data-testid="pb-step">
            STEP
          </button>
          <fieldset className="playback-transport__speed">
            <legend>SPEED</legend>
            {([1, 2, 4] as const).map((speed) => (
              <label key={speed}>
                <input
                  type="radio"
                  name="playback-speed"
                  checked={playback.speed === speed}
                  onChange={() => setSpeed(speed)}
                />
                {speed}×
              </label>
            ))}
          </fieldset>
        </>
      )}
      <button type="button" onClick={skip} disabled={done} data-testid="pb-skip">SKIP [S]</button>
    </div>
  );
}
