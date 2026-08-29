import * as React from "react";
import type { MatchResultSummary } from "../../store/core";

export interface ResultSummaryProps { readonly result: MatchResultSummary }

export function ResultSummary({ result }: ResultSummaryProps): React.ReactElement {
  const humanConstructs = result.constructs.filter((entry) => (entry.squadId as number) === 0);
  return (
    <main className="result-screen" aria-labelledby="result-title">
      <header><p>SIGNAL LOSS / MATCH SUMMARY</p><h1 id="result-title">{placement(result.humanPlacement)} OF 5 · {result.outcome.toUpperCase()}</h1><p>{result.roundsElapsed} rounds elapsed</p></header>
      <section aria-labelledby="ladder-title"><h2 id="ladder-title">Elimination ladder</h2><ol>{result.ladder.map((entry) => <li key={entry.squadId as number}>Squad {entry.squadId as number}: {entry.status}{entry.placement === null ? " — placement unresolved" : ` — ${placement(entry.placement)}`}{entry.eliminationRound === null ? "" : ` in round ${entry.eliminationRound}`}</li>)}</ol></section>
      <section aria-labelledby="construct-title"><h2 id="construct-title">Your constructs</h2><table><thead><tr><th>Construct</th><th>Role / status</th><th>Damage dealt</th><th>Damage taken</th><th>Rounds alive</th><th>Final dial</th></tr></thead><tbody>{humanConstructs.map((entry) => <tr key={entry.id as number}><th>#{entry.id as number} · chassis {entry.chassisCode as number}</th><td>{entry.isCommander ? "Commander · " : ""}{entry.destroyed ? `Destroyed${entry.destructionRound === null ? "" : ` R${entry.destructionRound}`}` : "Survived"}</td><td>{entry.damageDealt}</td><td>{entry.damageTaken}</td><td>{entry.roundsAlive}</td><td>{entry.finalDialIndex}</td></tr>)}</tbody></table></section>
      <section aria-labelledby="pool-title"><h2 id="pool-title">Pool efficiency</h2><dl><div><dt>Granted</dt><dd>{result.humanPool.granted}</dd></div><div><dt>Spent</dt><dd>{result.humanPool.spent}</dd></div><div><dt>Wasted</dt><dd>{result.humanPool.wasted}</dd></div><div><dt>Called shots</dt><dd>{result.humanPool.calledShots}</dd></div><div><dt>Postures</dt><dd>{result.humanPool.postures}</dd></div></dl><table><caption>Spent versus wasted by round</caption><thead><tr><th>Round</th><th>Spent</th><th>Wasted</th></tr></thead><tbody>{result.humanPool.rounds.map((round) => <tr key={round.round}><th>{round.round}</th><td>{round.spent}</td><td>{round.wasted}</td></tr>)}</tbody></table></section>
      <section aria-labelledby="repro-title"><h2 id="repro-title">Reproducibility</h2><dl><div><dt>Seed</dt><dd>{result.reproducibility.seed}</dd></div><div><dt>Budget</dt><dd>{result.reproducibility.budget}</dd></div><div><dt>Archetype</dt><dd>{result.reproducibility.resolvedArchetypeId as string}</dd></div><div><dt>AI tier</dt><dd>{result.reproducibility.aiTier}</dd></div><div><dt>Final hash</dt><dd>{result.finalStateHash}</dd></div></dl><RosterStrings result={result} /></section>
      <p><strong>NO PROGRESSION — ROSTERS ARE UNCHANGED BY PLAY</strong></p>
      <nav aria-label="Result actions"><a href="#/build">Build zone</a></nav>
    </main>
  );
}

function RosterStrings({ result }: ResultSummaryProps): React.ReactElement {
  const strings = [result.reproducibility.humanRosterShareString, ...result.reproducibility.aiRosterShareStrings];
  return <ul>{strings.map((value, index) => <li key={index}><strong>{index === 0 ? "Human roster" : `AI roster ${index}`}</strong><code>{value}</code></li>)}</ul>;
}

function placement(value: number | null): string {
  if (value === null) return "UNRESOLVED";
  return `${value}${value === 1 ? "ST" : value === 2 ? "ND" : value === 3 ? "RD" : "TH"}`;
}
