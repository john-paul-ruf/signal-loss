import * as React from "react";
import { useMatchStore } from "../../store/match";
import { describeEvent } from "../../components/match";

/**
 * Playback mode — event-cursor advance. The full renderer arrives in
 * Checkpoint 5; the Checkpoint 1 shape is complete enough for the
 * shell tests to drive commit → playback → continue.
 */
export function PlaybackMode(): React.ReactElement {
  const events = useMatchStore((s) => s.playback.events);
  const cursor = useMatchStore((s) => s.playback.cursor);
  const advance = useMatchStore((s) => s.playbackAdvance);
  const skip = useMatchStore((s) => s.playbackSkip);

  return (
    <div
      className="match-mode match-mode--playback"
      role="region"
      aria-label="Playback"
      data-testid="mode-playback"
    >
      <p className="match-mode__title">PLAYBACK · {cursor} / {events.length}</p>
      <ol className="match-mode__events" aria-label="Events shown so far">
        {events.slice(0, cursor).map((e, i) => (
          <li key={i}>{describeEvent(e)}</li>
        ))}
      </ol>
      <div className="match-mode__controls">
        <button type="button" onClick={advance} disabled={cursor >= events.length}>
          Step →
        </button>
        <button type="button" onClick={skip} disabled={cursor >= events.length}>
          Skip to end
        </button>
      </div>
    </div>
  );
}
