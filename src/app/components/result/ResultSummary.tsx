import * as React from "react";
import type { MatchResultSummary, PoolRoundResult } from "../../store/core";
import { SQUAD_LADDER } from "../../store/build";
import "./result-summary.css";

export interface ResultSummaryProps { readonly result: MatchResultSummary }

export function ResultSummary({ result }: ResultSummaryProps): React.ReactElement {
  const humanConstructs = result.constructs.filter((entry) => (entry.squadId as number) === 0);
  const dealt = humanConstructs.reduce((total, entry) => total + entry.damageDealt, 0);
  const taken = humanConstructs.reduce((total, entry) => total + entry.damageTaken, 0);
  return (
    <main className="result-screen" aria-labelledby="result-title">
      <header className="result-topbar"><span aria-hidden="true">△</span><strong>SIGNAL LOSS</strong><span>MATCH SUMMARY</span><span className="result-topbar__truth">REPLAYS BYTE-IDENTICAL FROM SEED + PLOTS</span></header>
      <div className="result-scroll">
        <section className="result-hero" aria-labelledby="result-title">
          <div className="result-hero__placement">
            <p className="result-label">▲ VC · VECTOR — YOUR SQUAD</p>
            <div className="result-placement"><h1 id="result-title">{placement(result.humanPlacement)}</h1><span>OF 5</span></div>
            <p className={`result-outcome result-outcome--${result.outcome}`}>{result.outcome.toUpperCase()} · ROUND {result.roundsElapsed}</p>
            <dl className="result-metrics"><Metric label="Damage dealt" value={dealt} /><Metric label="Damage taken" value={taken} /><Metric label="Constructs" value={humanConstructs.length} /><Metric label="Rounds elapsed" value={result.roundsElapsed} /></dl>
          </div>
          <div className="result-ladder"><div className="result-section-heading"><h2>Elimination ladder</h2><span>FR-21 · RECORDED PLACEMENTS ONLY</span></div><ol>{result.ladder.map((entry) => { const squad=SQUAD_LADDER[entry.squadId as number]; return <li key={entry.squadId as number} className={(entry.squadId as number)===0?"result-ladder__human":undefined}><span className="result-ladder__place">{placement(entry.placement)}</span><span style={{color:squad?.colorVar}} aria-hidden="true">{squad?.glyph}</span><strong>{squad?.tag} · {squad?.name}</strong><span>{entry.status === "WINNER" ? "✓ WINNER" : entry.status === "ELIMINATED" ? `✕ ELIMINATED · R${entry.eliminationRound ?? "—"}` : "◇ SURVIVED AT END · PLACEMENT UNRESOLVED"}</span></li>})}</ol></div>
        </section>

        <section className="result-grid">
          <div className="result-panel"><div className="result-section-heading"><h2>Your constructs</h2><span>COMMAND · DESTRUCTION · DIAL</span></div><div className="result-table-wrap"><table><thead><tr><th>Construct</th><th>Role / status</th><th>Damage dealt</th><th>Damage taken</th><th>Rounds alive</th><th>Final dial</th></tr></thead><tbody>{humanConstructs.map((entry) => <tr key={entry.id as number}><th>VC-{entry.id as number} · chassis {entry.chassisCode as number}</th><td>{entry.isCommander ? "◆ COMMANDER · " : ""}{entry.destroyed ? `✕ DESTROYED${entry.destructionRound === null ? "" : ` R${entry.destructionRound}`}` : "✓ SURVIVED"}</td><td>{entry.damageDealt}</td><td>{entry.damageTaken}</td><td>{entry.roundsAlive}</td><td>{entry.finalDialIndex}</td></tr>)}</tbody></table></div></div>
          <div className="result-panel"><div className="result-section-heading"><h2>Pool efficiency</h2><span>FR-28 · ZERO CARRYOVER</span></div><dl className="result-pool"><Metric label="Granted" value={result.humanPool.granted} /><Metric label="Spent" value={result.humanPool.spent} /><Metric label="Wasted" value={result.humanPool.wasted} /></dl><p className="result-pool__split">⌐ POSTURES {result.humanPool.postures} · » CALLED SHOTS {result.humanPool.calledShots}</p><PoolChart rounds={result.humanPool.rounds} /><table className="sr-only"><caption>Exact spent versus wasted values by round</caption><thead><tr><th>Round</th><th>Granted</th><th>Spent</th><th>Wasted</th><th>Called shots</th><th>Postures</th></tr></thead><tbody>{result.humanPool.rounds.map((round) => <tr key={round.round}><th>{round.round}</th><td>{round.granted}</td><td>{round.spent}</td><td>{round.wasted}</td><td>{round.calledShots}</td><td>{round.postures}</td></tr>)}</tbody></table></div>
        </section>

        <section className="result-repro" aria-labelledby="repro-title"><div className="result-section-heading"><h2 id="repro-title">Reproducibility</h2><span>HUMAN + ALL FOUR AI ROSTERS</span></div><dl className="result-repro__facts"><Fact label="Seed" value={result.reproducibility.seed} /><Fact label="Budget" value={`${result.reproducibility.budget} PTS`} /><Fact label="Archetype" value={result.reproducibility.resolvedArchetypeId as string} /><Fact label="AI tier" value={`TIER ${result.reproducibility.aiTier}`} /><Fact label="Final hash" value={result.finalStateHash} /></dl><RosterStrings result={result} /></section>
      </div>
      <footer className="result-footer"><p><strong>NO PROGRESSION — ROSTERS ARE UNCHANGED BY PLAY</strong><span>NO XP · NO UNLOCKS · NO PERSISTENT DAMAGE</span></p><nav aria-label="Result actions"><a href="#/build">BUILD ZONE</a></nav></footer>
    </main>
  );
}

function Metric({label,value}:{readonly label:string;readonly value:number}):React.ReactElement{return <div><dt>{label}</dt><dd>{value}</dd></div>}
function Fact({label,value}:{readonly label:string;readonly value:string}):React.ReactElement{return <div><dt>{label}</dt><dd>{value}</dd></div>}

function PoolChart({rounds}:{readonly rounds:readonly PoolRoundResult[]}):React.ReactElement {
  const width=Math.max(240,rounds.length*24); const max=Math.max(1,...rounds.map(round=>round.granted));
  return <figure className="result-chart"><figcaption>Spent vs wasted · per round</figcaption><svg viewBox={`0 0 ${width} 120`} role="img" aria-label="Per-round spent and wasted pool points">{rounds.map((round,index)=>{const x=index*24+8;const spent=round.spent/max*72;const wasted=round.wasted/max*72;return <g key={round.round}><rect className="result-chart__spent" x={x} y={88-spent} width="14" height={spent}/><rect className="result-chart__wasted" x={x} y={88-spent-wasted} width="14" height={wasted}/><text x={x+7} y="105" textAnchor="middle">R{round.round}</text></g>})}<line x1="4" y1="88" x2={width-4} y2="88" /></svg><p><span>■ SPENT</span><span>■ WASTED</span></p></figure>
}

function RosterStrings({ result }: ResultSummaryProps): React.ReactElement {
  const strings = [result.reproducibility.humanRosterShareString, ...result.reproducibility.aiRosterShareStrings];
  return <ul className="result-rosters">{strings.map((value, index) => <li key={index}><strong>{index === 0 ? "▲ VC · HUMAN ROSTER" : `${SQUAD_LADDER[index]?.glyph ?? "◇"} ${SQUAD_LADDER[index]?.tag ?? "AI"} · AI ROSTER ${index}`}</strong><code tabIndex={0}>{value}</code><span>SELECTABLE FOR MANUAL COPY</span></li>)}</ul>;
}

function placement(value: number | null): string { if(value===null)return "UNRESOLVED";return `${value}${value===1?"ST":value===2?"ND":value===3?"RD":"TH"}`; }
