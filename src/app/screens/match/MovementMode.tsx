import * as React from "react";
import { BoardCanvas } from "../../board";
import { useMatchStore, matchSelectors } from "../../store/match";
import {
  appendWaypoint,
  clampPathToAllowance,
  dropLastWaypoint,
  pathLengthFx,
} from "../../board/input";
import {
  currentDialState,
  legalMovePlot,
} from "../../../engine";

/**
 * Movement plot mode (design.md §5.6). Select construct → click for
 * waypoints → double-click / Enter to finish → Ctrl+Enter to commit.
 * Backspace drops last waypoint; Esc clears; `H` sets HOLD; `1`–`9`
 * select. Path clamping and wall refusal defer to `legalMovePlot`.
 */
export function MovementMode(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const selectedId = useMatchStore((s) => s.selection.selectedConstructId);
  const setSelectedId = useMatchStore((s) => s.selectConstruct);
  const setMoveDraft = useMatchStore((s) => s.setMoveDraft);
  const clearMoveDraft = useMatchStore((s) => s.clearMoveDraft);
  const setHold = useMatchStore((s) => s.setHold);
  const drafts = useMatchStore((s) => s.drafts);
  const own = useMatchStore(matchSelectors.selectHumanConstructs);
  const [pathReason, setPathReason] = React.useState<string | null>(null);

  const selected = React.useMemo(
    () =>
      selectedId === null
        ? null
        : engine?.constructs.find((c) => c.id === selectedId) ?? null,
    [selectedId, engine],
  );
  const draft = React.useMemo(
    () =>
      selected === null ? [] : drafts.moveDrafts.get(selected.id as number) ?? [],
    [selected, drafts.moveDrafts],
  );
  const dial = selected === null || catalog === null ? undefined : currentDialState(selected, catalog);
  const allowance = dial === undefined ? 0 : (dial.movementAllowance as number);

  // Keyboard: 1-9 select, Backspace drop last, Esc clear, H hold.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        const c = own[idx];
        if (c !== undefined) {
          setSelectedId(c.id);
          e.preventDefault();
        }
      } else if (e.key === "0") {
        const c = own[9];
        if (c !== undefined) {
          setSelectedId(c.id);
          e.preventDefault();
        }
      } else if (e.key === "Backspace" && selected !== null && draft.length > 0) {
        setMoveDraft(selected.id, dropLastWaypoint(draft));
        e.preventDefault();
      } else if (e.key === "Escape" && selected !== null) {
        clearMoveDraft(selected.id);
        setPathReason(null);
        e.preventDefault();
      } else if ((e.key === "h" || e.key === "H") && selected !== null) {
        setHold(selected.id, true);
        setPathReason(null);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [own, selected, draft, setSelectedId, setMoveDraft, clearMoveDraft, setHold]);

  return (
    <div className="match-mode match-mode--movement" data-testid="mode-movement">
      <BoardCanvas
        onPointerAction={(kind, world) => {
          if (selected === null || catalog === null || engine === null) return;
          if (kind === "click") {
            // Start path at construct position if empty.
            const base = draft.length > 0 ? draft : [selected.position];
            let next = appendWaypoint(base, world);
            // Clamp if over allowance.
            if (pathLengthFx(next) > allowance) {
              next = clampPathToAllowance(next, allowance);
              setPathReason(`PATH CLAMPED TO ${allowance}`);
            } else {
              setPathReason(null);
            }
            // Validate through engine.
            const legality = legalMovePlot(engine, selected.id, next, catalog);
            if (!legality.ok) {
              const v = legality.error[0];
              if (v?.kind === "PATH_CROSSES_WALL") {
                setPathReason("WALL — WAYPOINT REJECTED");
                return; // do not append
              }
              // Otherwise accept and let commit surface the message.
            }
            setMoveDraft(selected.id, next);
          } else if (kind === "double-click") {
            // Finish path — Enter equivalent. Nothing else to do; commit
            // is a separate action.
            e_preventDefault();
          }
        }}
      />
      <aside className="movement-hud" aria-label="Movement plotting">
        <p className="movement-hud__selected" data-testid="mv-selected">
          {selected === null
            ? "SELECT A CONSTRUCT (1–9 or click)"
            : `${selected.chassisCode}-${String(selected.id as number).padStart(2, "0")} · allowance ${allowance}`}
        </p>
        <p className="movement-hud__length" data-testid="mv-length">
          {pathLengthFx(draft.length > 0 ? draft : (selected !== null ? [selected.position] : []))}{" / "}
          {allowance}
        </p>
        {pathReason !== null ? (
          <p className="movement-hud__reason" role="alert" data-testid="mv-reason">
            {pathReason}
          </p>
        ) : null}
        <p className="movement-hud__hint">
          Click for waypoints · Backspace drop · Esc clear · H set HOLD · Ctrl+Enter commit
        </p>
      </aside>
    </div>
  );
}

function e_preventDefault(): void {
  /* placeholder — the DOM event was consumed by BoardCanvas already */
}
