import * as React from "react";
import { useMatchStore, matchSelectors } from "../../store/match";
import type { ConstructId } from "../../../engine";
import { currentDialState, effectiveDialLength } from "../../../engine";

/**
 * Squad rail (design.md §5.4, §5.7). One row per own construct — the
 * ledger line for every phase. Reads only the drafts + engine slices;
 * pointer overlay changes must NOT rerender this list.
 */
export function SquadRail(): React.ReactElement {
  const own = useMatchStore(matchSelectors.selectHumanConstructs, sameArray);
  const catalog = useMatchStore((s) => s.catalog);
  const mode = useMatchStore((s) => s.mode);
  const selected = useMatchStore((s) => s.selection.selectedConstructId);
  const selectConstruct = useMatchStore((s) => s.selectConstruct);
  const inspectConstruct = useMatchStore((s) => s.inspectConstruct);
  const drafts = useMatchStore((s) => s.drafts);

  if (catalog === null || own.length === 0) {
    return (
      <div className="squad-rail squad-rail--empty" aria-label="Squad rail">
        <p className="squad-rail__empty">No constructs yet.</p>
      </div>
    );
  }

  return (
    <div className="squad-rail" aria-label="Own constructs">
      <header className="squad-rail__header">
        <span className="squad-rail__badge">VC</span>
        <span className="squad-rail__title">VECTOR</span>
        <span className="squad-rail__count" data-testid="rail-count">
          {own.filter((c) => !c.destroyed).length} / {own.length} LIVE
        </span>
      </header>
      <ol className="squad-rail__list" role="listbox" aria-label="Own construct rows">
        {own.map((c, i) => {
          const dial = currentDialState(c, catalog);
          const dialLen = effectiveDialLength(c, catalog);
          const move = dial === undefined ? "—" : String(dial.movementAllowance as number);
          const dmg = dial === undefined ? "—" : String(dial.damage);
          const isSelected = (c.id as number) === (selected as number | null);
          const hold = drafts.holdSet.has(c.id as number);
          const path = drafts.moveDrafts.get(c.id as number);
          const attackDraft = drafts.attackDrafts.get(c.id as number);
          const posture = drafts.postureDrafts.get(c.id as number);
          const lineState = c.destroyed
            ? "DESTROYED"
            : hold
            ? "HOLD"
            : mode === "MOVEMENT_PLOT" && path !== undefined && path.length > 1
            ? `PLOTTED ${path.length - 1} PT${path.length - 1 === 1 ? "" : "S"}`
            : mode === "MOVEMENT_PLOT"
            ? "UNPLOTTED"
            : mode === "ATTACK_PLOT" && attackDraft !== undefined
            ? `TARGETING #${attackDraft.targetId as number}${attackDraft.called ? " · CALLED" : ""}`
            : mode === "ATTACK_PLOT"
            ? "NO TARGET"
            : "";
          return (
            <li
              key={c.id as number}
              className={
                "squad-rail__row" +
                (isSelected ? " squad-rail__row--selected" : "") +
                (c.destroyed ? " squad-rail__row--destroyed" : "")
              }
              role="option"
              aria-selected={isSelected}
              aria-label={`Row ${i + 1}: construct ${c.id as number}, dial ${c.dialIndex}/${dialLen}, ${lineState}`}
              tabIndex={0}
              onClick={() => {
                selectConstruct(c.id);
                inspectConstruct(c.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectConstruct(c.id);
                  inspectConstruct(c.id);
                }
              }}
              data-construct-id={c.id as number}
            >
              <span className="squad-rail__glyph" aria-hidden="true">▲</span>
              <span className="squad-rail__code">{c.chassisCode}-{String(c.id as number).padStart(2, "0")}</span>
              {c.commanderCode !== null ? (
                <span className="squad-rail__cmd" aria-label="Commander">◆CMD</span>
              ) : null}
              <span className="squad-rail__dial" aria-label={`Dial ${c.dialIndex} of ${dialLen}`}>
                {"●".repeat(c.dialIndex) + "○".repeat(Math.max(0, dialLen - c.dialIndex))}
              </span>
              <span className="squad-rail__stats">
                MOVE <span className="squad-rail__num">{move}</span> DMG{" "}
                <span className="squad-rail__num">{dmg}</span>
              </span>
              {mode === "ATTACK_PLOT" && posture !== undefined ? (
                <span className="squad-rail__posture" aria-label={`Posture ${posture}`}>
                  {posture === "POSTURE" ? "⌐POSTURE¬" : "FLAT"}
                </span>
              ) : null}
              <span className="squad-rail__state" data-testid={`row-state-${c.id as number}`}>
                {lineState}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function sameArray<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i = i + 1) if (a[i] !== b[i]) return false;
  return true;
}

// Export for the accessible tree fallback.
export function railKeybindingSelectId(digit: string, own: readonly { id: ConstructId }[]): ConstructId | null {
  if (digit === "0") {
    const c = own[9];
    return c?.id ?? null;
  }
  const n = parseInt(digit, 10);
  if (!Number.isFinite(n) || n < 1 || n > 9) return null;
  const c = own[n - 1];
  return c?.id ?? null;
}
