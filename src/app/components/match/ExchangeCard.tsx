import * as React from "react";
import { useMatchStore } from "../../store/match";
import type { ConstructId } from "../../../engine";
import { exchangePreview } from "../../../engine";

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
  const card = React.useMemo(() => {
    if (engine === null || catalog === null) return null;
    return exchangePreview(engine, props.attackerId, props.targetId, props.called, catalog);
  }, [engine, catalog, props.attackerId, props.targetId, props.called]);

  if (card === null) {
    return (
      <div className="exchange-card exchange-card--empty" aria-label="Exchange card">
        <p>Select a target to preview.</p>
      </div>
    );
  }
  const inRange = card.vsFlat.reason === "OK" || card.vsPosture.reason === "OK";
  const losOk = card.vsFlat.reason !== "NO_LOS" && card.vsPosture.reason !== "NO_LOS";
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
          RANGE {card.vsFlat.dist as number} / {card.vsFlat.range as number} · LOS {losOk ? "✓" : "✗"}
        </span>
      </header>
      <table className="exchange-card__matrix">
        <thead>
          <tr>
            <th></th>
            <th>TARGET FLAT</th>
            <th>TARGET POSTURE</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">NORMAL</th>
            <td data-testid="cell-normal-flat">
              {formatDamage(card.vsFlat.landed && !props.called ? card.vsFlat.damage : normalIntoFlat(card))}
            </td>
            <td data-testid="cell-normal-posture">0</td>
          </tr>
          <tr>
            <th scope="row">CALLED · 1pt</th>
            <td data-testid="cell-called-flat">
              {formatDamage(calledDamage(card, "FLAT"))}
            </td>
            <td data-testid="cell-called-posture">
              {formatDamage(calledDamage(card, "POSTURE"))}
            </td>
          </tr>
        </tbody>
      </table>
      {!inRange ? (
        <p className="exchange-card__reason" role="alert">
          {card.vsFlat.reason === "OUT_OF_RANGE"
            ? `OUT OF RANGE ${card.vsFlat.dist as number} / ${card.vsFlat.range as number}`
            : card.vsFlat.reason === "NO_LOS"
            ? "NO LINE OF SIGHT"
            : card.vsFlat.reason}
        </p>
      ) : null}
    </section>
  );
}

function normalIntoFlat(card: NonNullable<ReturnType<typeof exchangePreview>>): number {
  // The stored card uses the `called` flag we passed in; but we always
  // want to display both rows. Recompute here with an integer floor.
  const base = card.vsFlat.baseDamage;
  return base > 0 ? base : 0;
}

function calledDamage(
  card: NonNullable<ReturnType<typeof exchangePreview>>,
  posture: "FLAT" | "POSTURE",
): number {
  // Compute called damage against the given posture from base damage
  // (same formula as engine's applyMatrix).
  const base = card.vsFlat.baseDamage;
  if (base <= 0) return 0;
  if (posture === "FLAT") {
    const raw = Math.floor((base * 3) / 2);
    return raw < 1 ? 1 : raw;
  }
  const raw = Math.floor(base / 2);
  return raw < 1 ? 1 : raw;
}

function formatDamage(n: number): string {
  return n <= 0 ? "0" : `${n}`;
}
