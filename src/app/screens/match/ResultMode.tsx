import * as React from "react";
import { useMatchStore } from "../../store/match";
import { deriveMatchResultSummary, useFlowStoreApi } from "../../store/core";

/**
 * Terminal handoff. The authoritative summary is derived once, written to
 * the app-lifetime flow store, and only then exposed through the result route.
 */
export function ResultMode(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const launch = useMatchStore((s) => s.launch);
  const history = useMatchStore((s) => s.eventHistory);
  const flow = useFlowStoreApi();
  const written = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (written.current) return;
    if (engine === null || launch === null || engine.phase !== "COMPLETE") {
      setError("The completed match state is unavailable.");
      return;
    }
    try {
      const summary = deriveMatchResultSummary(
        engine,
        launch.input,
        launch.humanSquadId,
        history,
      );
      flow.getState().setLastResult(summary);
      written.current = true;
      window.location.hash = "#/result";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [engine, flow, history, launch]);

  return (
    <div
      className="match-mode match-mode--result"
      role="region"
      aria-label="Match result"
      data-testid="mode-result"
    >
      <p className="match-mode__title">MATCH COMPLETE</p>
      {error === null ? <p role="status">Preparing match summary…</p> : (
        <div role="alert">
          <p>Match summary could not be prepared: {error}</p>
          <p><a href="#/setup">Return to setup</a> · <a href="#/build">Build zone</a></p>
        </div>
      )}
    </div>
  );
}
