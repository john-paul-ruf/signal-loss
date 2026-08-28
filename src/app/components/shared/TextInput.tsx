import * as React from "react";

/**
 * TextInput — single-line native input with a label and optional
 * inline-error message. Errors are rendered as `<p role="alert">` so
 * screen readers announce them once on change.
 */
export interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  readonly label: string;
  readonly errorMessage?: string;
  readonly hint?: string;
}

export function TextInput(props: TextInputProps): React.ReactElement {
  const { label, errorMessage, hint, id, ...rest } = props;
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const hintId = hint !== undefined ? `${inputId}-hint` : undefined;
  const errorId = errorMessage !== undefined ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter((v) => v !== undefined).join(" ") || undefined;
  return (
    <label htmlFor={inputId} className="sl-input">
      <span className="sl-input__label">{label}</span>
      <input
        {...rest}
        id={inputId}
        className={`sl-input__field${errorMessage !== undefined ? " is-invalid" : ""}`}
        aria-invalid={errorMessage !== undefined || undefined}
        aria-describedby={describedBy}
      />
      {hint !== undefined && (
        <p id={hintId} className="sl-input__hint">
          {hint}
        </p>
      )}
      {errorMessage !== undefined && (
        <p id={errorId} className="sl-input__error" role="alert">
          {errorMessage}
        </p>
      )}
    </label>
  );
}

/**
 * TextArea — multi-line variant with the same label/error/hint semantics.
 */
export interface TextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  readonly label: string;
  readonly errorMessage?: string;
  readonly hint?: string;
}

export function TextArea(props: TextAreaProps): React.ReactElement {
  const { label, errorMessage, hint, id, ...rest } = props;
  const generatedAreaId = React.useId();
  const areaId = id ?? generatedAreaId;
  const hintId = hint !== undefined ? `${areaId}-hint` : undefined;
  const errorId = errorMessage !== undefined ? `${areaId}-error` : undefined;
  const describedBy = [hintId, errorId].filter((v) => v !== undefined).join(" ") || undefined;
  return (
    <label htmlFor={areaId} className="sl-input">
      <span className="sl-input__label">{label}</span>
      <textarea
        {...rest}
        id={areaId}
        className={`sl-input__field sl-input__field--area${errorMessage !== undefined ? " is-invalid" : ""}`}
        aria-invalid={errorMessage !== undefined || undefined}
        aria-describedby={describedBy}
      />
      {hint !== undefined && (
        <p id={hintId} className="sl-input__hint">
          {hint}
        </p>
      )}
      {errorMessage !== undefined && (
        <p id={errorId} className="sl-input__error" role="alert">
          {errorMessage}
        </p>
      )}
    </label>
  );
}
