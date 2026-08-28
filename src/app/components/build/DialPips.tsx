import * as React from "react";

/**
 * The public dial-position pip row (design.md §2.2). Filled pips = states
 * reached/spent, the current pip is emphasised, empty pips remain. FR-19
 * makes dial position public, and NFR-5 forbids colour-only meaning — so the
 * position is also stated in the visually-hidden and adjacent mono label the
 * caller renders (`N/M`), and each pip carries a title.
 */
export interface DialPipsProps {
  /** Total number of dial states. */
  readonly length: number;
  /** Current 0-based dial position. */
  readonly current: number;
  /** When true, every pip renders as reached (used in the result ladder). */
  readonly exhausted?: boolean;
}

export function DialPips(props: DialPipsProps): React.ReactElement {
  const { length, current, exhausted = false } = props;
  const label = exhausted ? `${length}/${length} exhausted` : `dial ${current + 1} of ${length}`;
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={label}>
      {Array.from({ length }, (_, i) => {
        const reached = exhausted || i < current;
        const isCurrent = !exhausted && i === current;
        const cls = isCurrent
          ? "bg-sys border-sys"
          : exhausted
            ? "bg-bad border-bad"
            : reached
              ? "bg-vector border-vector"
              : "border-line-2";
        return (
          <span
            key={i}
            className={`inline-block h-[7px] w-[7px] rounded-full border ${cls}`}
          />
        );
      })}
    </span>
  );
}
