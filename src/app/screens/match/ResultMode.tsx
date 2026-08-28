import * as React from "react";
import { useMatchStore } from "../../store/match";
import type { MatchResultPayload } from "../../store/core";
import type { LaunchSnapshot } from "../../store/match";
import type { MatchState } from "../../../engine";
import { hashState } from "../../../engine";

/**
 * Result mode — derives the shared MatchResultPayload from the
 * committed engine state and posts it via a DOM custom event. The
 * core flow store subscribes to the event and stores the payload for
 * Session 07's result screen to render. The match store itself never
 * persists to localStorage — this handoff is transient per the
 * flow-store contract (database.md §8).
 *
 * A ref guards the effect so re-mounting the result mode doesn't
 * re-emit the payload.
 */
export function ResultMode(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const launch = useMatchStore((s) => s.launch);
  const winner = engine?.winner ?? null;
  const eliminations = engine?.eliminationOrder ?? [];
  const written = React.useRef(false);

  React.useEffect(() => {
    if (written.current) return;
    if (engine === null || launch === null) return;
    if (engine.phase !== "COMPLETE") return;
    const payload = derivePayload(engine, launch);
    window.dispatchEvent(
      new CustomEvent("signal-loss:match-result", { detail: payload }),
    );
    written.current = true;
  }, [engine, launch]);

  return (
    <div
      className="match-mode match-mode--result"
      role="region"
      aria-label="Match result"
      data-testid="mode-result"
    >
      <p className="match-mode__title">MATCH COMPLETE</p>
      {winner === null ? (
        <p>No winner — simultaneous elimination.</p>
      ) : (
        <p>Winner: squad {winner as number}</p>
      )}
      <ol className="match-mode__eliminations">
        {eliminations.map((e) => (
          <li key={e.squadId as number}>
            Squad {e.squadId as number} · placement {e.placement} · round {e.round}
          </li>
        ))}
      </ol>
      <p>
        <a href="#/result">See full summary →</a>
      </p>
    </div>
  );
}

function derivePayload(
  engine: MatchState,
  launch: LaunchSnapshot,
): MatchResultPayload {
  const humanElim = engine.eliminationOrder.find(
    (e) => (e.squadId as number) === (launch.humanSquadId as number),
  );
  const outcome: MatchResultPayload["outcome"] =
    engine.winner === launch.humanSquadId
      ? "victory"
      : engine.winner === null
      ? "stalemate"
      : "defeat";
  return {
    config: {
      rosterId: "roster:1",
      // The full launch's saved roster stays with the core flow
      // store; the match store retains only the digest a replay
      // needs. Session 07's result screen reads the persisted
      // roster by rosterId if it needs the full roster.
      roster: {
        id: "roster:1",
        name: "match",
        budget: launch.config.budget as number,
        constructs: [],
      } as unknown as MatchResultPayload["config"]["roster"],
      budget: launch.config.budget as number,
      seed: launch.seed,
      archetypeCode: null,
      aiTierId: `t${launch.config.aiTier}`,
    },
    outcome,
    rounds: engine.round,
    humanEliminationRound: humanElim?.round ?? null,
    finalStateHash: hashState(engine),
    share: {
      rosterCode: "",
      seed: launch.seed,
    },
  };
}
