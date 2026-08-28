import * as React from "react";

/**
 * Toggle — a two-state ARIA switch. Uses a native `<button>` with
 * `role="switch"` and `aria-checked` for keyboard-first semantics.
 *
 * Never conveys state by color alone: a leading "ON" / "OFF" label is
 * always visible.
 */
export interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (next: boolean) => void;
  readonly describedById?: string;
}

export function Toggle(props: ToggleProps): React.ReactElement {
  const { label, checked, disabled = false, onChange, describedById } = props;
  return (
    <label className="sl-toggle">
      <span className="sl-toggle__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedById}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`sl-toggle__track${checked ? " is-on" : ""}`}
      >
        <span aria-hidden="true" className="sl-toggle__glyph">
          {checked ? "ON" : "OFF"}
        </span>
      </button>
    </label>
  );
}

/**
 * SegmentedControl — an ARIA radiogroup rendered as tab-like segments.
 * Arrow keys move focus and selection; Home/End jump to the ends.
 */
export interface SegmentOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  readonly label: string;
  readonly options: readonly SegmentOption<V>[];
  readonly value: V;
  readonly onChange: (next: V) => void;
  readonly id?: string;
}

export function SegmentedControl<V extends string>(
  props: SegmentedControlProps<V>,
): React.ReactElement {
  const { label, options, value, onChange, id } = props;
  const currentIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  function move(delta: number, event: React.KeyboardEvent<HTMLButtonElement>): void {
    event.preventDefault();
    const total = options.length;
    if (total === 0) return;
    let next = (currentIndex + delta + total) % total;
    // Skip disabled segments.
    for (let i = 0; i < total; i = i + 1) {
      const candidate = options[next];
      if (candidate !== undefined && candidate.disabled !== true) {
        onChange(candidate.value);
        return;
      }
      next = (next + delta + total) % total;
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      id={id}
      className="sl-segmented"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={selected}
            disabled={option.disabled === true}
            tabIndex={selected ? 0 : -1}
            className={`sl-segmented__item${selected ? " is-selected" : ""}`}
            onClick={() => option.disabled !== true && onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") move(1, event);
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(-1, event);
              else if (event.key === "Home") {
                event.preventDefault();
                const first = options.find((o) => o.disabled !== true);
                if (first !== undefined) onChange(first.value);
              } else if (event.key === "End") {
                event.preventDefault();
                for (let i = options.length - 1; i >= 0; i = i - 1) {
                  const candidate = options[i];
                  if (candidate !== undefined && candidate.disabled !== true) {
                    onChange(candidate.value);
                    return;
                  }
                }
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
