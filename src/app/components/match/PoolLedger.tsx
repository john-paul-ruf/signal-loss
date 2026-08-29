import * as React from "react";
import { useMatchStore, matchSelectors, projectedPoolSpend } from "../../store/match";
import { committedHumanSpend } from "./attack-model";

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
  const playback = useMatchStore((s) => s.playback);

  const pool = matchSelectors.selectHumanPool({ engine, catalog, launch } as unknown as Parameters<typeof matchSelectors.selectHumanPool>[0]);
  if (pool === null || engine === null || launch === null) {
    return (
      <div className="pool-ledger pool-ledger--idle" role="group" aria-label="Reaction pool">
        <span className="pool-ledger__label">POOL</span>
        <span className="pool-ledger__value">—</span>
      </div>
    );
  }
  const draftSpend = projectedPoolSpend(engine, launch.humanSquadId, drafts);
  const spend = mode === "ATTACK_PLAYBACK" && playback.beforeSnapshot !== null
    ? committedHumanSpend(playback.events, playback.beforeSnapshot, launch.humanSquadId)
    : draftSpend;
  const rawRemaining = pool.total - spend.total;
  const remaining = Math.max(0, rawRemaining);
  const wasted = remaining;
  const invalidDraft = rawRemaining < 0;
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
      aria-label={`Reaction pool: ${pool.total} total, ${spend.total} spent, ${remaining} remaining${invalidDraft ? `, invalid draft overspent by ${-rawRemaining}` : ""}`}
    >
      <div className="pool-ledger__top">
        <span className="pool-ledger__label">POOL</span>
        <span className="pool-ledger__pips" aria-hidden="true">
          {"◆".repeat(Math.min(pool.total, spend.total)) + "◇".repeat(remaining)}
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
      <div className="pool-ledger__remaining" data-testid="pool-remaining">
        {remaining} REMAINING
      </div>
      {invalidDraft ? (
        <div className="pool-ledger__invalid" role="alert">
          INVALID DRAFT · {-rawRemaining} POINT{-rawRemaining === 1 ? "" : "S"} OVER POOL
        </div>
      ) : null}
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
