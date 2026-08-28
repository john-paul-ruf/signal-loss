import * as React from "react";
import type { Chassis, DialState } from "../../../engine/index";
import { dialStateRange, fxUnits, signed } from "./format";

/**
 * The full dial as a horizontal state grid (design.md §5.2 / §5.3): one column
 * per state, one row per stat (MOVE · DMG · RANGE · DEF). Every value is mono
 * and is the exact value used in resolution (FR-1, FR-19). Not a bar — a state
 * machine grid.
 */
export interface DialStatGridProps {
  readonly chassis: Chassis;
  /** Optional 0-based current state to emphasise (in-match / composer use). */
  readonly current?: number;
  readonly caption?: string;
}

interface StatRowSpec {
  readonly key: string;
  readonly label: string;
  readonly cell: (state: DialState) => string;
}

export function DialStatGrid(props: DialStatGridProps): React.ReactElement {
  const { chassis, current, caption } = props;
  const states = chassis.dial;
  const rows: readonly StatRowSpec[] = [
    { key: "move", label: "MOVE", cell: (s) => fxUnits(s.movementAllowance) },
    { key: "dmg", label: "DMG", cell: (s) => String(s.damage) },
    { key: "range", label: "RANGE", cell: (s) => fxUnits(dialStateRange(chassis, s)) },
    { key: "def", label: "DEF", cell: (s) => signed(s.defenseModifier) },
  ];
  return (
    <table className="w-full border border-line font-mono text-[12px] tabular-nums">
      {caption !== undefined ? (
        <caption className="sr-only">{caption}</caption>
      ) : null}
      <thead>
        <tr className="bg-panel-3">
          <th
            scope="col"
            className="w-20 px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3"
          >
            Stat
          </th>
          {states.map((s) => (
            <th
              key={s.index}
              scope="col"
              aria-current={current === s.index ? "true" : undefined}
              className={`px-2 py-1 text-center text-[10px] uppercase tracking-[0.14em] ${
                current === s.index ? "text-sys" : "text-ink-3"
              }`}
            >
              S{s.index + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-line">
            <th
              scope="row"
              className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3"
            >
              {row.label}
            </th>
            {states.map((s) => (
              <td
                key={s.index}
                className={`px-2 py-1 text-center ${
                  current === s.index ? "text-sys" : "text-ink"
                }`}
              >
                {row.cell(s)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
