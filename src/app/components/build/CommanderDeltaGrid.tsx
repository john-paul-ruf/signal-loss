import * as React from "react";
import {
  applyCommanderType,
  fxAdd,
  fxClamp,
  type Chassis,
  type CommanderType,
  type DialState,
  type Fx,
} from "../../../engine/index";
import { fxUnits, signed } from "./format";

/**
 * The dial as a horizontal state grid with the commander's before/after
 * delta visible per cell (design.md §5.2: "you see the before value struck
 * and the after value beside it", FR-3). With no commander tagged this
 * renders the plain base dial — struck-through base values only appear
 * once a commander modification actually changes that cell.
 */
export interface CommanderDeltaGridProps {
  readonly chassis: Chassis;
  readonly commander: CommanderType | null;
  readonly caption?: string;
}

interface RowSpec {
  readonly key: string;
  readonly label: string;
  readonly value: (s: DialState) => string;
  readonly changed: (base: DialState, after: DialState) => boolean;
}

const ROWS: readonly RowSpec[] = [
  {
    key: "move",
    label: "MOVE",
    value: (s) => fxUnits(s.movementAllowance),
    changed: (b, a) => b.movementAllowance !== a.movementAllowance,
  },
  {
    key: "dmg",
    label: "DMG",
    value: (s) => String(s.damage),
    changed: (b, a) => b.damage !== a.damage,
  },
  {
    key: "def",
    label: "DEF",
    value: (s) => signed(s.defenseModifier),
    changed: (b, a) => b.defenseModifier !== a.defenseModifier,
  },
];

/** Same composition rule as `format.ts#dialStateRange`, over any chassis-shaped range source. */
function rangeAt(
  source: { readonly baseRange: Fx; readonly rangeClamp: { readonly min: Fx; readonly max: Fx } },
  state: DialState,
): Fx {
  return fxClamp(fxAdd(source.baseRange, state.rangeModifier), source.rangeClamp.min, source.rangeClamp.max);
}

export function CommanderDeltaGrid(props: CommanderDeltaGridProps): React.ReactElement {
  const { chassis, commander, caption } = props;
  const effective = commander !== null ? applyCommanderType(chassis, commander) : null;
  const states = effective?.dial ?? chassis.dial;

  return (
    <table className="w-full border border-line font-mono text-[12px] tabular-nums">
      {caption !== undefined ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr className="bg-panel-3">
          <th scope="col" className="w-20 px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3">
            Stat
          </th>
          {states.map((s) => (
            <th key={s.index} scope="col" className="px-2 py-1 text-center text-[10px] uppercase tracking-[0.14em] text-ink-3">
              S{s.index + 1}
            </th>
          ))}
          <th scope="col" className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3">
            Curve
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.key} className="border-t border-line">
            <th scope="row" className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3">
              {row.label}
            </th>
            {states.map((s, i) => {
              const base = chassis.dial[i];
              const isExtra = base === undefined;
              const afterValue = row.value(s);
              const baseValue = isExtra ? null : row.value(base);
              const changed = !isExtra && commander !== null && base !== undefined && row.changed(base, s);
              return (
                <td key={s.index} className="px-2 py-1 text-center text-ink">
                  {changed && baseValue !== null ? (
                    <>
                      <span className="text-ink-4 line-through">{baseValue}</span>{" "}
                      <span className="text-ok">{afterValue}</span>
                    </>
                  ) : (
                    <span className={isExtra ? "text-sys" : undefined}>{afterValue}</span>
                  )}
                </td>
              );
            })}
            <td className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3">
              {chassis.curveFamily}
            </td>
          </tr>
        ))}
        <tr className="border-t border-line">
          <th scope="row" className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3">
            RANGE
          </th>
          {states.map((s, i) => {
            const base = chassis.dial[i];
            const isExtra = base === undefined;
            const afterFx = rangeAt(effective ?? chassis, s);
            const baseFx = isExtra ? null : rangeAt(chassis, base);
            const changed = !isExtra && commander !== null && baseFx !== afterFx;
            return (
              <td key={s.index} className="px-2 py-1 text-center text-ink">
                {changed && baseFx !== null ? (
                  <>
                    <span className="text-ink-4 line-through">{fxUnits(baseFx)}</span>{" "}
                    <span className="text-ok">{fxUnits(afterFx)}</span>
                  </>
                ) : (
                  <span className={isExtra ? "text-sys" : undefined}>{fxUnits(afterFx)}</span>
                )}
              </td>
            );
          })}
          <td className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-ink-3">
            {chassis.curveFamily}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={states.length + 2} className="px-2 py-1.5 font-mono text-[9.5px] text-ink-4">
            STRUCK = BASE CHASSIS · GREEN = AFTER COMMANDER TAG. NO STAT SHOWN HERE DIFFERS FROM THE STAT USED IN
            RESOLUTION.
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
