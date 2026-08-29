import * as React from "react";
import { matchSelectors, useMatchStore } from "../../store/match";
import type { ConstructId, Fx } from "../../../engine";
import { fxToInt } from "../../../engine";
import { buildAttackExchangeModel, outcomeReason, type AttackOutcomeCell } from "./attack-model";

/**
 * Exchange card (design.md §5.7). Renders the 2×2 outcome matrix for
 * a single attacker → target pair using the SAME engine helper
 * (`exchangePreview`) that resolution will use. FR-18: what the
 * player sees IS what will happen.
 */
export interface ExchangeCardProps {
  readonly attackerId: ConstructId;
  readonly targetId: ConstructId;
  readonly called: boolean;
}

export function ExchangeCard(props: ExchangeCardProps): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const publicState = useMatchStore(matchSelectors.selectHumanPublicView);
  const model = React.useMemo(() => {
    if (engine === null || catalog === null || publicState === null) return null;
    return buildAttackExchangeModel(engine, publicState, props.attackerId, props.targetId, catalog);
  }, [engine, catalog, publicState, props.attackerId, props.targetId]);

  if (model === null) {
    return (
      <div className="exchange-card exchange-card--empty" aria-label="Exchange card">
        <p>Select a target to preview.</p>
      </div>
    );
  }
  const currentRow = props.called ? model.called : model.normal;
  const reference = currentRow.flat.outcome;
  return (
    <section
      className="exchange-card"
      aria-label={`Exchange card: attacker ${props.attackerId as number} vs target ${props.targetId as number}`}
      data-testid="exchange-card"
    >
      <header className="exchange-card__header">
        <span data-testid="exchange-header">
          #{props.attackerId as number} → #{props.targetId as number}
        </span>
        <span>
          RANGE {formatFx(reference.dist)} / {formatFx(reference.range)} · LOS {reference.reason === "NO_LOS" ? "✗" : "✓"}
        </span>
      </header>
      <p className={model.isTargetConfirmed ? "exchange-card__position" : "exchange-card__position exchange-card__position--ghost"}>
        {model.positionLabel}
      </p>
      <table className="exchange-card__matrix">
        <thead>
          <tr>
            <th></th>
            <th>TARGET FLAT</th>
            <th>TARGET POSTURE</th>
          </tr>
        </thead>
        <tbody>
          <tr className={props.called ? undefined : "exchange-card__row--declared"}>
            <th scope="row">NORMAL</th>
            <OutcomeCell testId="cell-normal-flat" cell={model.normal.flat} />
            <OutcomeCell testId="cell-normal-posture" cell={model.normal.posture} />
          </tr>
          <tr className={props.called ? "exchange-card__row--declared" : undefined}>
            <th scope="row">CALLED · 1pt</th>
            <OutcomeCell testId="cell-called-flat" cell={model.called.flat} />
            <OutcomeCell testId="cell-called-posture" cell={model.called.posture} />
          </tr>
        </tbody>
      </table>
      <p className="exchange-card__reason" role={reference.landed ? undefined : "alert"}>
        {outcomeReason(reference)} · {model.isTargetConfirmed ? "CURRENT POSITION" : "AT LAST CONFIRMED POSITION"}
      </p>
    </section>
  );
}

function OutcomeCell(props: { readonly testId: string; readonly cell: AttackOutcomeCell }): React.ReactElement {
  return (
    <td data-testid={props.testId}>
      <strong>{props.cell.outcome.damage}</strong>
      <span>{outcomeReason(props.cell.outcome)}</span>
      <span>DIAL {props.cell.dial.from} → {props.cell.dial.to}</span>
    </td>
  );
}

function formatFx(value: Fx): string {
  const units = fxToInt(value);
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}
