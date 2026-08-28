import * as React from "react";
import { BoardCanvas } from "../../board";
import { useMatchStore, matchSelectors } from "../../store/match";
import { toCard, beatDurationMs } from "../../board/playback";

/**
 * Playback mode (design.md §5.8, FR-26). Playback is EXCLUSIVELY
 * driven by the already-computed `Event[]`; no animation callback
 * touches engine state. Reduced motion replaces continuous animation
 * with a stack of focusable event cards advanced by arrow keys —
 * every event kind has both representations (see event-cards.ts).
 */
export function PlaybackMode(): React.ReactElement {
  const playback = useMatchStore(matchSelectors.selectPlayback);
  const advance = useMatchStore((s) => s.playbackAdvance);
  const stepBy = useMatchStore((s) => s.playbackStepBy);
  const skip = useMatchStore((s) => s.playbackSkip);
  const setRunning = useMatchStore((s) => s.playbackSetRunning);
  const setSpeed = useMatchStore((s) => s.playbackSetSpeed);
  const reducedMotion = useMatchStore((s) => s.present.reducedMotion);

  // Animation tick — advances the cursor at the current beat's
  // duration. Reduced motion skips this — cards are advanced by
  // keyboard.
  React.useEffect(() => {
    if (!playback.running) return;
    if (reducedMotion) return;
    if (playback.cursor >= playback.events.length) {
      setRunning(false);
      return;
    }
    const beat = playback.events[playback.cursor];
    if (beat === undefined) return;
    const ms = beatDurationMs(beat, playback.speed);
    const t = setTimeout(() => advance(), ms);
    return () => clearTimeout(t);
  }, [playback, advance, setRunning, reducedMotion]);

  // Reduced-motion keyboard: right arrow advances one card.
  React.useEffect(() => {
    if (!reducedMotion) return undefined;
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        stepBy(1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        stepBy(-1);
        e.preventDefault();
      } else if (e.key === "s" || e.key === "S") {
        skip();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reducedMotion, stepBy, skip]);

  const cards = React.useMemo(
    () => playback.events.slice(0, playback.cursor).map((e, i) => toCard(e, i)),
    [playback.events, playback.cursor],
  );

  return (
    <div className="match-mode match-mode--playback" data-testid="mode-playback">
      {reducedMotion ? (
        <ReducedMotionStack
          totalEvents={playback.events.length}
          cursor={playback.cursor}
          cards={cards}
          onAdvance={() => stepBy(1)}
          onRewind={() => stepBy(-1)}
          onSkip={skip}
        />
      ) : (
        <BoardCanvas />
      )}
      <PlaybackTransport
        running={playback.running}
        cursor={playback.cursor}
        total={playback.events.length}
        speed={playback.speed}
        reducedMotion={reducedMotion}
        onPlay={() => setRunning(true)}
        onPause={() => setRunning(false)}
        onStep={() => stepBy(1)}
        onSkip={skip}
        onSpeed={setSpeed}
      />
    </div>
  );
}

interface ReducedMotionStackProps {
  readonly totalEvents: number;
  readonly cursor: number;
  readonly cards: readonly ReturnType<typeof toCard>[];
  readonly onAdvance: () => void;
  readonly onRewind: () => void;
  readonly onSkip: () => void;
}

function ReducedMotionStack(props: ReducedMotionStackProps): React.ReactElement {
  return (
    <section
      className="reduced-motion-stack"
      aria-label="Reduced-motion event stack"
      data-testid="reduced-motion-stack"
    >
      <p className="reduced-motion-stack__count">
        Event {props.cursor} of {props.totalEvents}
      </p>
      <ol className="reduced-motion-stack__list">
        {props.cards.map((c) => (
          <li key={c.key} className="reduced-motion-stack__card">
            <strong>{c.title}</strong>
            <p>{c.detail}</p>
          </li>
        ))}
      </ol>
      <div className="reduced-motion-stack__controls">
        <button type="button" onClick={props.onRewind} disabled={props.cursor === 0}>
          ← Previous
        </button>
        <button
          type="button"
          onClick={props.onAdvance}
          disabled={props.cursor >= props.totalEvents}
          data-testid="rm-advance"
        >
          Next →
        </button>
        <button type="button" onClick={props.onSkip}>Skip to end</button>
      </div>
    </section>
  );
}

interface PlaybackTransportProps {
  readonly running: boolean;
  readonly cursor: number;
  readonly total: number;
  readonly speed: 1 | 2 | 4;
  readonly reducedMotion: boolean;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStep: () => void;
  readonly onSkip: () => void;
  readonly onSpeed: (s: 1 | 2 | 4) => void;
}

function PlaybackTransport(props: PlaybackTransportProps): React.ReactElement {
  const done = props.cursor >= props.total;
  return (
    <footer
      className="playback-transport"
      role="toolbar"
      aria-label="Playback transport"
      data-testid="playback-transport"
    >
      <span className="playback-transport__count">
        {props.cursor} / {props.total}
      </span>
      {!props.reducedMotion ? (
        <>
          {props.running ? (
            <button type="button" onClick={props.onPause} data-testid="pb-pause">Pause</button>
          ) : (
            <button
              type="button"
              onClick={props.onPlay}
              disabled={done}
              data-testid="pb-play"
            >
              Play
            </button>
          )}
          <button
            type="button"
            onClick={props.onStep}
            disabled={done}
            data-testid="pb-step"
          >
            Step
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={props.onSkip}
        disabled={done}
        data-testid="pb-skip"
      >
        Skip to end
      </button>
      {!props.reducedMotion ? (
        <fieldset className="playback-transport__speed">
          <legend>Speed</legend>
          {[1, 2, 4].map((s) => (
            <label key={s}>
              <input
                type="radio"
                name="pb-speed"
                checked={props.speed === s}
                onChange={() => props.onSpeed(s as 1 | 2 | 4)}
              />
              {s}×
            </label>
          ))}
        </fieldset>
      ) : null}
    </footer>
  );
}
