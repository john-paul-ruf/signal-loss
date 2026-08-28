import * as React from "react";
import { useMatchStore, matchSelectors, projectedPoolSpend } from "../../store/match";

/**
 * Pool ledger (FR-17, design.md §5.7). Always visible during attack
 * plotting; shown greyed with the PROJECTED-next-round value during
 * movement. Every term of the FR-17 formula is spelled out; the waste
 * warning is deliberate and cannot be suppressed (design.md §7.8).
 */
export function PoolLedger(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const launch = useMatchStore((s) => s.launch);
  const drafts = useMatchStore((s) => s.drafts);
  const mode = useMatchStore((s) => s.mode);

  const pool = matchSelectors.selectHumanPool({ engine, catalog, launch } as unknown as Parameters<typeof matchSelectors.selectHumanPool>[0]);
  if (pool === null || engine === null || launch === null) {
    return (
      <div className="pool-ledger pool-ledger--idle" role="group" aria-label="Reaction pool">
        <span className="pool-ledger__label">POOL</span>
        <span className="pool-ledger__value">—</span>
      </div>
    );
  }
  const spend = projectedPoolSpend(engine, launch.humanSquadId, drafts);
  const remaining = pool.total - (mode === "ATTACK_PLOT" ? spend.total : engine.squads[launch.humanSquadId as number]?.poolSpent ?? 0);
  const wasted = Math.max(0, remaining);
  const projected = mode === "MOVEMENT_PLOT" || mode === "MOVEMENT_PLAYBACK" || mode === "DEPLOYMENT";
  const term = pool.terms;
  const commanderTerm = term[1];
  const unitsTerm = term[2];
  const commanderLabel =
    pool.commanderLost || commanderTerm.value === 0 ? "0 (commander lost)" : `${commanderTerm.value}`;
  const unitsLabel =
    unitsTerm.divisor > 0
      ? `⌊${unitsTerm.alive}/${unitsTerm.divisor}⌋=${unitsTerm.value}`
      : `${unitsTerm.value}`;

  return (
    <div
      className={"pool-ledger" + (projected ? " pool-ledger--projected" : "")}
      role="group"
      aria-label={`Reaction pool: ${pool.total} total, ${spend.total} projected spend, ${wasted} would waste`}
    >
      <div className="pool-ledger__top">
        <span className="pool-ledger__label">POOL</span>
        <span className="pool-ledger__pips" aria-hidden="true">
          {"◆".repeat(Math.min(6, pool.total)) + "◇".repeat(Math.max(0, spend.total))}
        </span>
        <span className="pool-ledger__count" data-testid="pool-total">
          {spend.total} / {pool.total} SPENT
        </span>
      </div>
      <div className="pool-ledger__formula" data-testid="pool-formula">
        1 base + {commanderLabel} + {unitsLabel}
      </div>
      <div className="pool-ledger__breakdown">
        <span>⌐ posture ×{spend.postures}</span>
        <span>» called ×{spend.called}</span>
      </div>
      {wasted > 0 && !projected ? (
        <div className="pool-ledger__waste" role="alert">
          ⚠ {wasted} POINT{wasted === 1 ? "" : "S"} WILL BE LOST AT COMMIT
        </div>
      ) : projected ? (
        <div className="pool-ledger__projected">PROJECTED · SPENDABLE FROM {mode === "DEPLOYMENT" ? "ROUND 1" : "NEXT"} ATTACK</div>
      ) : null}
      {pool.commanderLost ? (
        <div className="pool-ledger__commander-lost" role="alert">
          COMMANDER LOST — PERMANENT
        </div>
      ) : null}
    </div>
  );
}
