import * as React from "react";
import { useMatchStore, matchSelectors } from "../../store/match";
import { OUTCOME_MATRIX } from "../../../engine";
import { FocusTrap } from "../shared/FocusTrap";

/**
 * Rules drawer (design.md §5.10). Right-side overlay opened by `?`/F1.
 * Fixed section order: outcome matrix, pool formula with substituted
 * numbers, trace schedule with current round marked, glossary.
 */
export function RulesDrawer(): React.ReactElement {
  const closeRules = useMatchStore((s) => s.closeRulesDrawer);
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const launch = useMatchStore((s) => s.launch);
  const anchor = useMatchStore((s) => s.selection.rulesDrawerAnchor);
  const pool = matchSelectors.selectHumanPool(
    { engine, catalog, launch } as unknown as Parameters<typeof matchSelectors.selectHumanPool>[0],
  );
  const round = engine?.round ?? 0;
  const schedule = engine?.map.traceSchedule ?? [];
  const headingId = React.useId();

  React.useEffect(() => {
    if (anchor === null) return;
    const el = document.getElementById(`rule-${anchor}`);
    if (el !== null) {
      el.scrollIntoView({ block: "start" });
      if (typeof (el as HTMLElement).focus === "function") {
        (el as HTMLElement).focus({ preventScroll: true });
      }
    }
  }, [anchor]);

  return (
    <div className="rules-drawer" data-testid="rules-drawer">
      <FocusTrap active={true} onEscape={closeRules} labelId={headingId}>
        <header className="rules-drawer__header">
          <h2 id={headingId} className="rules-drawer__title">
            RULES REFERENCE
          </h2>
          <button
            type="button"
            className="rules-drawer__close"
            onClick={closeRules}
            aria-label="Close rules drawer"
            data-testid="rules-close"
          >
            ×
          </button>
        </header>
        <div className="rules-drawer__body">
          <section id="rule-matrix" tabIndex={-1}>
            <h3>Outcome matrix (FR-18)</h3>
            <table className="rules-drawer__matrix">
              <thead>
                <tr>
                  <th></th>
                  <th>TARGET FLAT</th>
                  <th>TARGET POSTURED</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">NORMAL</th>
                  <td>{describeCell(OUTCOME_MATRIX.normal.flat)}</td>
                  <td>{describeCell(OUTCOME_MATRIX.normal.posture)}</td>
                </tr>
                <tr>
                  <th scope="row">CALLED</th>
                  <td>{describeCell(OUTCOME_MATRIX.called.flat)}</td>
                  <td>{describeCell(OUTCOME_MATRIX.called.posture)}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section id="rule-pool" tabIndex={-1}>
            <h3>Reaction pool (FR-17)</h3>
            {pool !== null ? (
              <p className="rules-drawer__formula">
                pool = 1 base + {pool.terms[1].value} commander + ⌊
                {pool.terms[2].alive}/{pool.terms[2].divisor}⌋={pool.terms[2].value} ={" "}
                <strong>{pool.total}</strong>
                {pool.commanderLost
                  ? " · commander lost — collapsed to 1 · permanent"
                  : ""}
              </p>
            ) : (
              <p>pool = 1 base + commander_base + ⌊alive/R⌋</p>
            )}
          </section>
          <section id="rule-trace-schedule" tabIndex={-1}>
            <h3>Trace schedule (FR-20)</h3>
            {schedule.length === 0 ? (
              <p>No schedule loaded.</p>
            ) : (
              <ol className="rules-drawer__schedule">
                {schedule.map((step, i) => (
                  <li
                    key={i}
                    className={
                      round >= step.round ? "rules-drawer__schedule--past" : ""
                    }
                    aria-current={round === step.round ? "step" : undefined}
                  >
                    R{step.round} · {step.damage} dmg
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section id="rule-glossary" tabIndex={-1}>
            <h3>Glossary</h3>
            <dl className="rules-drawer__glossary">
              <div id="rule-posture" tabIndex={-1}>
                <dt>POSTURE</dt>
                <dd>
                  Costs 1 pool. Halves incoming damage from a called shot;
                  blocks a normal shot entirely.
                </dd>
              </div>
              <div id="rule-called" tabIndex={-1}>
                <dt>CALLED SHOT</dt>
                <dd>
                  Costs 1 pool. 3/2 damage against a flat target; 1/2 against
                  a postured target.
                </dd>
              </div>
              <div id="rule-trace" tabIndex={-1}>
                <dt>TRACE</dt>
                <dd>
                  Contracting damage zone. Damage advances your dial the same
                  as an attack.
                </dd>
              </div>
              <div id="rule-commander" tabIndex={-1}>
                <dt>COMMANDER</dt>
                <dd>
                  One per squad. Loss collapses the reaction pool to 1
                  permanently.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </FocusTrap>
    </div>
  );
}

function describeCell(
  cell:
    | { readonly zero: true }
    | { readonly zero: false; readonly num: number; readonly den: number },
): string {
  if (cell.zero) return "0";
  if (cell.num === cell.den) return "1× (min 1)";
  return `${cell.num}/${cell.den}× (min 1)`;
}
