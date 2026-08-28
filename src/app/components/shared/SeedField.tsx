import * as React from "react";
import { Button } from "./Button";
import { TextInput } from "./TextInput";

/**
 * SeedField — a text input paired with a "generate" button. Seed
 * generation is delegated to the caller so this component stays free
 * of engine/rng imports (per architecture — no engine dependency from
 * UI primitives except via the app store).
 */
export interface SeedFieldProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onGenerate: () => void;
  readonly label?: string;
  readonly errorMessage?: string;
}

export function SeedField(props: SeedFieldProps): React.ReactElement {
  const { value, onChange, onGenerate, label = "SEED", errorMessage } = props;
  const commonProps = {
    label,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    spellCheck: false,
    autoComplete: "off",
  };
  return (
    <div className="sl-seed">
      {errorMessage !== undefined ? (
        <TextInput {...commonProps} errorMessage={errorMessage} />
      ) : (
        <TextInput {...commonProps} />
      )}
      <Button variant="ghost" onClick={onGenerate}>
        GENERATE
      </Button>
    </div>
  );
}
