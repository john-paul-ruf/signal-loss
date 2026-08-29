import * as React from "react";
import { useMatchStore, matchSelectors } from "../../store/match";
import type { ConstructId } from "../../../engine";
import { ExchangeCard } from "./ExchangeCard";
import { guardCalledToggle, guardPostureToggle, poolBalance } from "./attack-model";
import "./attack-ledger.css";

export interface AttackLedgerProps {
  readonly onFeedback?: (message: string) => void;
}

export function AttackLedger({ onFeedback = () => undefined }: AttackLedgerProps): React.ReactElement {
  const own = useMatchStore(matchSelectors.selectHumanConstructs);
  const enemies = useMatchStore(matchSelectors.selectKnownEnemyList);
  const engine = useMatchStore((state) => state.engine);
  const launch = useMatchStore((state) => state.launch);
  const pool = useMatchStore(matchSelectors.selectHumanPool);
  const drafts = useMatchStore((state) => state.drafts);
  const setAttack = useMatchStore((state) => state.setAttackDraft);
  const clearAttack = useMatchStore((state) => state.clearAttackDraft);
  const setPosture = useMatchStore((state) => state.setPostureDraft);
  const clearPosture = useMatchStore((state) => state.clearPostureDraft);
  const selectConstruct = useMatchStore((state) => state.selectConstruct);
  const selectedId = useMatchStore((state) => state.selection.selectedConstructId);
  const living = own.filter((construct) => !construct.destroyed);
  const balance = engine !== null && launch !== null && pool !== null
    ? poolBalance(engine, launch.humanSquadId, drafts, pool.total)
    : null;

  return (
    <section className="attack-ledger" aria-label="Attack ledger">
      <header className="attack-ledger__heading">
        <span>ATTACK LEDGER</span>
        <strong data-testid="attack-pool-remaining">{balance?.remaining ?? 0} REMAINING</strong>
      </header>
      <ul className="attack-ledger__list" role="list">
        {living.map((construct, index) => {
          const attack = drafts.attackDrafts.get(construct.id as number);
          const posture = drafts.postureDrafts.get(construct.id as number);
          const selected = construct.id === selectedId;
          return (
            <li
              key={construct.id as number}
              className={`attack-ledger__row${selected ? " attack-ledger__row--selected" : ""}`}
              data-testid={`attack-row-${construct.id as number}`}
            >
              <button
                type="button"
                className="attack-ledger__row-header"
                aria-pressed={selected}
                aria-label={`Select construct ${construct.id as number}`}
                onClick={() => selectConstruct(construct.id)}
              >
                <kbd>{index === 9 ? "0" : index + 1}</kbd>
                <span className="attack-ledger__glyph" aria-hidden="true">▲</span>
                <span className="attack-ledger__code">
                  {construct.chassisCode}-{String(construct.id as number).padStart(2, "0")}
                </span>
                {construct.commanderCode !== null ? <span className="attack-ledger__cmd">◆ CMD</span> : null}
                <span className="attack-ledger__dial" aria-label={`Dial state ${construct.dialIndex}`}>
                  {"●".repeat(construct.dialIndex) + "○".repeat(Math.max(0, 5 - construct.dialIndex))}
                </span>
              </button>
              <div className="attack-ledger__controls">
                <label>
                  <span>TARGET</span>
                  <select
                    value={(attack?.targetId as number | undefined) ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "") clearAttack(construct.id);
                      else setAttack(construct.id, Number(value) as unknown as ConstructId, attack?.called ?? false);
                    }}
                    aria-label={`Target for construct ${construct.id as number}`}
                  >
                    <option value="">— DECLARE TARGET —</option>
                    {enemies.filter((known) => !known.base.destroyed).map((known) => (
                      <option key={known.base.id as number} value={known.base.id as number}>
                        #{known.base.id as number} {known.base.chassisCode}{known.confirmed ? "" : " · POSITION UNCONFIRMED"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="attack-ledger__toggle-group" role="group" aria-label={`Shot type for construct ${construct.id as number}`}>
                  <button type="button" aria-pressed={!attack?.called} disabled={attack === undefined} onClick={() => {
                    if (attack !== undefined && attack.called) setAttack(construct.id, attack.targetId, false);
                  }}>NORMAL <span>0PT</span></button>
                  <button
                    type="button"
                    aria-pressed={attack?.called ?? false}
                    disabled={attack === undefined}
                    data-testid={`called-toggle-${construct.id as number}`}
                    onClick={() => {
                      if (engine === null || launch === null || pool === null || attack === undefined) return;
                      const result = guardCalledToggle(engine, launch.humanSquadId, drafts, pool.total, construct.id);
                      if (!result.accepted) {
                        onFeedback("POOL EXHAUSTED — 0 REMAINING");
                        return;
                      }
                      setAttack(construct.id, attack.targetId, result.active);
                    }}
                  >» CALLED <span>1PT</span></button>
                </div>
                <div className="attack-ledger__toggle-group" role="group" aria-label={`Posture for construct ${construct.id as number}`}>
                  <button type="button" aria-pressed={posture !== "POSTURE"} onClick={() => clearPosture(construct.id)}>
                    FLAT <span>0PT</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={posture === "POSTURE"}
                    data-testid={`posture-toggle-${construct.id as number}`}
                    onClick={() => {
                      if (engine === null || launch === null || pool === null) return;
                      const result = guardPostureToggle(engine, launch.humanSquadId, drafts, pool.total, construct.id);
                      if (!result.accepted) {
                        onFeedback("POOL EXHAUSTED — 0 REMAINING");
                        return;
                      }
                      if (result.active) setPosture(construct.id, "POSTURE");
                      else clearPosture(construct.id);
                    }}
                  >⌐ POSTURE <span>1PT</span></button>
                </div>
              </div>
              {attack !== undefined ? (
                <ExchangeCard attackerId={construct.id} targetId={attack.targetId} called={attack.called} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
