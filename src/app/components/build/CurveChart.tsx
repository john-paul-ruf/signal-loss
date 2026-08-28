import * as React from "react";
import type { CurveFamily } from "../../../engine/index";

/**
 * A sparkline of a stat across dial states (design.md §3 "Dial curve chart").
 * NFR-5 / FR-19: curve meaning is never carried by colour alone — the family
 * label is always rendered as text beside the line, and the line is described
 * by `aria-label`.
 */
export interface CurveChartProps {
  /** One value per dial state, in draw order (state 1 → last). */
  readonly values: readonly number[];
  readonly family: CurveFamily;
  readonly width?: number;
  readonly height?: number;
  /** Optional stroke override; defaults to a family-neutral ink tone. */
  readonly stroke?: string;
}

const FAMILY_LABEL: Record<CurveFamily, string> = {
  degrade: "DEGRADE",
  spike: "SPIKE",
  inversion: "INVERSION",
};

function points(values: readonly number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 2;
  const usableW = w - pad * 2;
  const usableH = h - pad * 2;
  const step = values.length > 1 ? usableW / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + step * i;
      // Higher value → higher on screen (smaller y).
      const y = pad + usableH - ((v - min) / span) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function CurveChart(props: CurveChartProps): React.ReactElement {
  const { values, family, width = 60, height = 16, stroke = "var(--color-ink-3)" } = props;
  const label = FAMILY_LABEL[family];
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="inline-block align-middle"
        role="img"
        aria-label={`${label} curve`}
      >
        <polyline
          points={points(values, width, height)}
          fill="none"
          stroke={stroke}
          strokeWidth={1.2}
        />
      </svg>
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{label}</span>
    </span>
  );
}
