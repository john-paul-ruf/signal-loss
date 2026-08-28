import * as React from "react";
import { useMatchStore } from "../../store/match";
import type { Event } from "../../../engine";

/**
 * Round log (design.md §5.8). Plain-language transcript of every
 * committed event, kept complete after skip. Independent from the
 * playback cursor — the log shows every event in the current buffer,
 * so a player who skipped can still read what happened.
 */
export function RoundLog(): React.ReactElement {
  const events = useMatchStore((s) => s.playback.events);
  if (events.length === 0) {
    return (
      <section className="round-log round-log--empty" aria-label="Round log">
        <header className="round-log__header">ROUND LOG</header>
        <p className="round-log__empty">No committed rounds yet.</p>
      </section>
    );
  }
  return (
    <section className="round-log" aria-label="Round log">
      <header className="round-log__header">ROUND LOG</header>
      <ol className="round-log__list" role="log">
        {events.map((e, i) => (
          <li key={`${i}-${e.kind}`} className="round-log__item" data-kind={e.kind}>
            {describeEvent(e)}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Render one event as plain language (design.md §5.8). Every kind
 * emits a static string suitable for both animated and reduced-motion
 * playback per FR-26.
 */
export function describeEvent(e: Event): string {
  switch (e.kind) {
    case "DEPLOYMENT_REVEAL":
      return `R${e.round} · DEPLOYMENT · ${e.placements.length} constructs revealed simultaneously`;
    case "POOL_REFILL":
      return `R${e.round} · POOL REFILL · squad ${e.squadId as number} → ${e.total} (base ${e.base} + cmd ${e.commanderBase} + ⌊${e.aliveCount}/${e.rDivisor}⌋=${e.unitTerm})${e.commanderLost ? " · COMMANDER LOST" : ""}`;
    case "MOVED":
      return `R${e.round} · construct ${e.constructId as number} moved ${e.pathDistance}${e.halted ? ` · HALTED at ${e.stopPosition.x as number}, ${e.stopPosition.y as number}` : ""}`;
    case "HALTED":
      return `R${e.round} · construct ${e.constructId as number} HALT — CONTACT with ${e.withConstructs.map((c) => c as number).join(", ")} at substep ${e.atSubstep}`;
    case "POSTURE_REVEAL":
      return `R${e.round} · construct ${e.constructId as number} revealed ${e.posture}`;
    case "SHOT":
      return `R${e.round} · construct ${e.attackerId as number} ${e.called ? "»CALLED→" : "NORMAL→"} ${e.targetId as number} — ${e.landed ? `${e.damage} dmg (target ${e.targetPosture})` : "NO LAND"}`;
    case "DEFENSE_INFO":
      return `R${e.round} · defense info: attacker ${e.attackerId as number} → ${e.targetId as number} · ${e.reason}`;
    case "DAMAGE_APPLIED":
      return `R${e.round} · construct ${e.targetId as number} took ${e.damage} damage`;
    case "DIAL_ADVANCED":
      return `R${e.round} · construct ${e.constructId as number} dial ${e.from} → ${e.to}`;
    case "TRACE_DAMAGE":
      return `R${e.round} · construct ${e.constructId as number} in trace — ${e.damage} damage (step ${e.stepIndex})`;
    case "DESTROYED":
      return `R${e.round} · construct ${e.constructId as number} DESTROYED — ${e.cause}${e.wasCommander ? " · commander" : ""}`;
    case "ELIMINATED":
      return `R${e.round} · squad ${e.squadId as number} ELIMINATED · placement ${e.placement}`;
    case "MATCH_COMPLETE":
      return `R${e.round} · MATCH COMPLETE · ${e.reason}${e.winner !== null ? ` · winner squad ${e.winner as number}` : ""}`;
  }
}
