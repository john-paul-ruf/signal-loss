import * as React from "react";

/**
 * A chassis' hardpoint layout as typed port badges (design.md §5.2 "hardpoint
 * layout as typed glyph row"). Type is carried as text (the port name), never
 * by colour alone. Port count and order are meaningful, so ports render in
 * hardpoint-index order.
 */
export interface HardpointBadgesProps {
  /** Resolved hardpoint-type display names, in hardpoint-index order. */
  readonly typeNames: readonly string[];
}

export function HardpointBadges(props: HardpointBadgesProps): React.ReactElement {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {props.typeNames.map((name, i) => (
        <span
          key={i}
          className="border border-line-2 px-1 font-mono text-[10px] uppercase tracking-[0.02em] text-ink-2"
        >
          {name}
        </span>
      ))}
    </span>
  );
}
