import * as React from "react";

/**
 * BudgetStepper — a two-button increment/decrement control over a fixed
 * enumeration (design.md §5.3 budget picker). The value display uses the
 * mono numeric type per FR-19 rendering.
 */
export interface BudgetStepperProps {
  readonly label: string;
  readonly value: number;
  readonly options: readonly number[];
  readonly onChange: (next: number) => void;
  readonly id?: string;
  readonly disabled?: boolean;
}

export function BudgetStepper(props: BudgetStepperProps): React.ReactElement {
  const { label, value, options, onChange, id, disabled = false } = props;
  const currentIndex = Math.max(0, options.indexOf(value));
  const canDec = currentIndex > 0 && !disabled;
  const canInc = currentIndex < options.length - 1 && !disabled;
  function step(delta: 1 | -1): void {
    const next = options[currentIndex + delta];
    if (next !== undefined) onChange(next);
  }
  return (
    <div className="sl-stepper" id={id}>
      <span className="sl-stepper__label">{label}</span>
      <div className="sl-stepper__row">
        <button
          type="button"
          className="sl-stepper__btn"
          aria-label="Decrease"
          disabled={!canDec}
          onClick={() => step(-1)}
        >
          −
        </button>
        <output
          className="sl-stepper__value"
          aria-live="polite"
          aria-atomic="true"
        >
          {value}
        </output>
        <button
          type="button"
          className="sl-stepper__btn"
          aria-label="Increase"
          disabled={!canInc}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
