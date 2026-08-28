import * as React from "react";

/**
 * StatRow — a labeled numeric readout. The number uses the mono type
 * (per FR-19 requirement that exact numbers use IBM Plex Mono). A visual
 * "bar" never substitutes for the number.
 */
export interface StatRowProps {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly unit?: string;
  readonly emphasis?: "default" | "warn" | "ok" | "bad";
  readonly id?: string;
}

export function StatRow(props: StatRowProps): React.ReactElement {
  const { label, value, unit, emphasis = "default", id } = props;
  return (
    <div className={`sl-stat sl-stat--${emphasis}`} id={id}>
      <span className="sl-stat__label">{label}</span>
      <span className="sl-stat__value">
        <span className="sl-stat__number">{value}</span>
        {unit !== undefined && <span className="sl-stat__unit">{unit}</span>}
      </span>
    </div>
  );
}
