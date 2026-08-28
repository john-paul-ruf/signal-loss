import * as React from "react";
import { useMatchStore } from "../../store/match";

/**
 * Trace timeline (FR-20, design.md §2.5). The full schedule is public
 * from round 1 — we render every contraction tick and the damage
 * ladder as a horizontal rail. The current-round caret advances as the
 * engine advances.
 */
export function TraceTimeline(): React.ReactElement {
  const round = useMatchStore((s) => s.engine?.round ?? 0);
  const schedule = useMatchStore((s) => s.engine?.map.traceSchedule ?? []);

  if (schedule.length === 0) {
    return (
      <div
        className="trace-timeline trace-timeline--empty"
        role="group"
        aria-label="Trace schedule"
      >
        <span className="trace-timeline__title">TRACE SCHEDULE</span>
        <span className="trace-timeline__body">NO SCHEDULE</span>
      </div>
    );
  }

  const maxRound = 24;
  return (
    <div
      className="trace-timeline"
      role="group"
      aria-label={`Trace schedule with ${schedule.length} contractions, current round ${round}`}
    >
      <span className="trace-timeline__title">TRACE SCHEDULE</span>
      <ol className="trace-timeline__steps" aria-label="Contractions">
        {schedule.map((step, i) => (
          <li
            key={i}
            className={
              "trace-timeline__step" +
              (round >= step.round ? " trace-timeline__step--active" : "")
            }
            aria-label={`Contraction ${i + 1}: round ${step.round}, damage ${step.damage}`}
          >
            <span className="trace-timeline__round">R{step.round}</span>
            <span className="trace-timeline__damage">{step.damage}</span>
          </li>
        ))}
      </ol>
      <div className="trace-timeline__marker" aria-hidden="true">
        <span>NOW: R{round}</span>
        <span>MAX: R{maxRound}</span>
      </div>
    </div>
  );
}
