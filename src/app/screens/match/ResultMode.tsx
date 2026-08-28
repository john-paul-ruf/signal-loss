import * as React from "react";
import { useMatchStore } from "../../store/match";

export function ResultMode(): React.ReactElement {
  const winner = useMatchStore((s) => s.engine?.winner ?? null);
  const eliminations = useMatchStore((s) => s.engine?.eliminationOrder ?? []);
  return (
    <div className="match-mode match-mode--result" role="region" aria-label="Match result" data-testid="mode-result">
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
