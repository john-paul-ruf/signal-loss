import * as React from "react";

/**
 * TermTooltip — inline glossary term (design.md §5.10). A term is
 * underlined with a dotted rule; hovering or focusing reveals the
 * definition through a real `<span>` popup positioned by CSS. Uses
 * `aria-describedby` so screen readers get the glossary text in-line
 * with the term itself.
 */
export interface TermTooltipProps {
  readonly term: string;
  readonly definition: string;
  readonly id?: string;
}

export function TermTooltip(props: TermTooltipProps): React.ReactElement {
  const { term, definition, id } = props;
  const generatedId = React.useId();
  const baseId = id ?? generatedId;
  const popId = `${baseId}-def`;
  const [open, setOpen] = React.useState(false);
  return (
    <span className="sl-term" tabIndex={0}
      aria-describedby={popId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="sl-term__label">{term}</span>
      <span
        id={popId}
        role="tooltip"
        className={`sl-term__pop${open ? " is-visible" : ""}`}
      >
        {definition}
      </span>
    </span>
  );
}
