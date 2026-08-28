import * as React from "react";
import { useMatchStore, matchSelectors } from "../store/match";
import type { KnownConstruct } from "../../engine";
import { visualFor } from "./squad-visual";

/**
 * Focusable DOM equivalent of the canvas scene (design.md §5.4,
 * NFR-5). Every construct visible on the board gets a `<button>` here
 * so a keyboard user reaches identical information without a pointer.
 *
 * The list is visually presented off-screen but remains in the accessible
 * tree — reduced motion / screen readers use this exclusively.
 */
export function AccessibleBoardTree(): React.ReactElement {
  const pv = useMatchStore(matchSelectors.selectHumanPublicView);
  const catalog = useMatchStore((s) => s.catalog);
  const selectConstruct = useMatchStore((s) => s.selectConstruct);
  const inspectConstruct = useMatchStore((s) => s.inspectConstruct);

  if (pv === null || catalog === null) {
    return (
      <div
        className="accessible-tree"
        aria-label="Board — semantic mirror"
        role="list"
      />
    );
  }

  const own: KnownConstruct[] = [];
  const enemy: KnownConstruct[] = [];
  const destroyed: KnownConstruct[] = [];
  for (const k of pv.constructs) {
    if (k.base.destroyed) destroyed.push(k);
    else if ((k.base.squadId as number) === (pv.observer as number)) own.push(k);
    else enemy.push(k);
  }

  return (
    <div
      className="accessible-tree"
      aria-label="Board — semantic mirror of every construct"
    >
      <section aria-label="Own constructs">
        <h3 className="accessible-tree__heading">Own constructs</h3>
        <ul role="list">
          {own.map((k) => (
            <TreeItem key={k.base.id as number} known={k} kind="own"
                      onSelect={() => { selectConstruct(k.base.id); inspectConstruct(k.base.id); }} />
          ))}
        </ul>
      </section>
      <section aria-label="Enemy constructs">
        <h3 className="accessible-tree__heading">Enemy constructs</h3>
        <ul role="list">
          {enemy.map((k) => (
            <TreeItem key={k.base.id as number} known={k} kind={k.confirmed ? "enemy" : "ghost"}
                      onSelect={() => { selectConstruct(k.base.id); inspectConstruct(k.base.id); }} />
          ))}
        </ul>
      </section>
      <section aria-label="Destroyed constructs">
        <h3 className="accessible-tree__heading">Destroyed</h3>
        <ul role="list">
          {destroyed.map((k) => (
            <TreeItem key={k.base.id as number} known={k} kind="destroyed"
                      onSelect={() => { selectConstruct(k.base.id); inspectConstruct(k.base.id); }} />
          ))}
        </ul>
      </section>
    </div>
  );
}

interface TreeItemProps {
  readonly known: KnownConstruct;
  readonly kind: "own" | "enemy" | "ghost" | "destroyed";
  readonly onSelect: () => void;
}

function TreeItem(props: TreeItemProps): React.ReactElement {
  const { known, kind, onSelect } = props;
  const visual = visualFor(known.base.squadId);
  const positionText =
    kind === "own" || known.confirmed
      ? `at ${known.position.x as number}, ${known.position.y as number} · position confirmed`
      : `last seen round ${known.confirmedRound} · position unconfirmed · drift ±${known.driftRadius as number}`;
  const dialText = `dial ${known.base.dialIndex}`;
  const label = `${visual.name} · construct ${known.base.id as number} · ${kind.toUpperCase()} · ${positionText} · ${dialText}`;
  return (
    <li>
      <button
        type="button"
        className="accessible-tree__item"
        aria-label={label}
        data-construct-id={known.base.id as number}
        data-kind={kind}
        onClick={onSelect}
      >
        <span aria-hidden="true">
          {visual.glyph} {visual.tag}-{String(known.base.id as number).padStart(2, "0")} · {kind}
        </span>
      </button>
    </li>
  );
}
