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
  const setReducedMotion = useMatchStore((s) => s.setReducedMotion);
  const reducedMotion = useMatchStore((s) => s.present.reducedMotion);
  const [activeProgress, setActiveProgress] = React.useState(0);
  const hasRemainingEvents = React.useRef(false);
  hasRemainingEvents.current = playback.cursor < playback.events.length;

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (): void => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [setReducedMotion]);

  React.useEffect(() => {
    setRunning(!reducedMotion && hasRemainingEvents.current);
  }, [reducedMotion, setRunning]);

  React.useEffect(() => {
    if (!playback.running || reducedMotion) {
      setActiveProgress(0);
      return undefined;
    }
    if (playback.cursor >= playback.events.length) {
      setRunning(false);
      setActiveProgress(0);
      return undefined;
    }
    const beat = playback.events[playback.cursor];
    if (beat === undefined) return undefined;
    const duration = beatDurationMs(beat, playback.speed);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration);
      setActiveProgress(progress);
      if (progress >= 1) {
        setActiveProgress(0);
        advance();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback.cursor, playback.events, playback.running, playback.speed, advance, setRunning, reducedMotion]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.repeat || isEditableTarget(e.target)) return;
      if (e.key === "ArrowRight") {
        setRunning(false);
        stepBy(1);
        e.preventDefault();
      } else if (reducedMotion && e.key === "ArrowLeft") {
        stepBy(-1);
        e.preventDefault();
      } else if (!reducedMotion && (e.key === " " || e.code === "Space")) {
        setRunning(!playback.running && playback.cursor < playback.events.length);
        e.preventDefault();
      } else if (e.key === "s" || e.key === "S") {
        skip();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reducedMotion, stepBy, skip, setRunning, playback.running, playback.cursor, playback.events.length]);

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
        />
      ) : (
        <BoardCanvas playbackProgress={activeProgress} />
      )}
    </div>
  );
}

interface ReducedMotionStackProps {
  readonly totalEvents: number;
  readonly cursor: number;
  readonly cards: readonly ReturnType<typeof toCard>[];
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
          <li key={c.key} className="reduced-motion-stack__card" tabIndex={0}>
            <strong>{c.title}</strong>
            <p>{c.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element === null) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName);
}
