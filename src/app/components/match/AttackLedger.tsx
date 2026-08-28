import * as React from "react";
import { useMatchStore, matchSelectors } from "../../store/match";
import type { ConstructId, MatchConstruct } from "../../../engine";
import { ExchangeCard } from "./ExchangeCard";

/**
 * Attack ledger (design.md §5.7). One row per living own construct
 * with independent target and posture controls. Selection wires to
 * the store's attack-draft slice; posture is a separate draft slice
 * so a construct can posture without shooting.
 */
export function AttackLedger(): React.ReactElement {
  const own = useMatchStore(matchSelectors.selectHumanConstructs);
  const enemies = useMatchStore(matchSelectors.selectKnownEnemyList);
  const drafts = useMatchStore((s) => s.drafts);
  const setAttack = useMatchStore((s) => s.setAttackDraft);
  const clearAttack = useMatchStore((s) => s.clearAttackDraft);
  const setPosture = useMatchStore((s) => s.setPostureDraft);
  const clearPosture = useMatchStore((s) => s.clearPostureDraft);
  const selectConstruct = useMatchStore((s) => s.selectConstruct);
  const selectedId = useMatchStore((s) => s.selection.selectedConstructId);

  const living: MatchConstruct[] = own.filter((c) => !c.destroyed);

  return (
    <section className="attack-ledger" aria-label="Attack ledger">
      <ul className="attack-ledger__list" role="list">
        {living.map((c) => {
          const attack = drafts.attackDrafts.get(c.id as number);
          const posture = drafts.postureDrafts.get(c.id as number);
          return (
            <li
              key={c.id as number}
              className={
                "attack-ledger__row" +
                ((c.id as number) === (selectedId as number | null) ? " attack-ledger__row--selected" : "")
              }
              data-testid={`attack-row-${c.id as number}`}
              onClick={() => selectConstruct(c.id)}
            >
              <header className="attack-ledger__row-header">
                <span className="attack-ledger__code">
                  {c.chassisCode}-{String(c.id as number).padStart(2, "0")}
                </span>
                {c.commanderCode !== null ? (
                  <span className="attack-ledger__cmd">◆CMD</span>
                ) : null}
                <span className="attack-ledger__dial">
                  {"●".repeat(c.dialIndex) + "○".repeat(Math.max(0, 5 - c.dialIndex))}
                </span>
              </header>
              <div className="attack-ledger__controls">
                <label>
                  <span>TARGET</span>
                  <select
                    value={attack?.targetId as number | undefined ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") clearAttack(c.id);
                      else
                        setAttack(
                          c.id,
                          parseInt(v, 10) as unknown as ConstructId,
                          attack?.called ?? false,
                        );
                    }}
                    aria-label={`Target for construct ${c.id as number}`}
                  >
                    <option value="">— no target —</option>
                    {enemies
                      .filter((k) => !k.base.destroyed)
                      .map((k) => (
                        <option key={k.base.id as number} value={k.base.id as number}>
                          #{k.base.id as number} {k.base.chassisCode}{k.confirmed ? "" : " (ghost)"}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={
                    "attack-ledger__called" +
                    (attack?.called ? " attack-ledger__called--on" : "")
                  }
                  disabled={attack === undefined}
                  onClick={() => {
                    if (attack === undefined) return;
                    setAttack(c.id, attack.targetId, !attack.called);
                  }}
                  aria-pressed={attack?.called ?? false}
                  data-testid={`called-toggle-${c.id as number}`}
                >
                  CALLED · 1pt
                </button>
                <button
                  type="button"
                  className={
                    "attack-ledger__posture" +
                    (posture === "POSTURE" ? " attack-ledger__posture--on" : "")
                  }
                  onClick={() => {
                    if (posture === "POSTURE") clearPosture(c.id);
                    else setPosture(c.id, "POSTURE");
                  }}
                  aria-pressed={posture === "POSTURE"}
                  data-testid={`posture-toggle-${c.id as number}`}
                >
                  {posture === "POSTURE" ? "POSTURE · 1pt" : "FLAT · free"}
                </button>
              </div>
              {attack !== undefined ? (
                <ExchangeCard
                  attackerId={c.id}
                  targetId={attack.targetId}
                  called={attack.called}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
