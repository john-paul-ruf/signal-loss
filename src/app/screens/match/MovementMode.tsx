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
 * Movement plot mode (design.md §5.6). A canvas click on a living own
 * marker selects and inspects it; a click on empty terrain appends a
 * legal waypoint to the selected construct; a click on an enemy or
 * destroyed marker only inspects it. Pointer motion previews the next
 * waypoint. `1`–`9` / `0` select; `Backspace` drops the last waypoint;
 * `Esc` clears; `H` sets HOLD; `Enter` / double-click finish the path;
 * `Ctrl/Cmd+Enter` (owned by CommandBar) opens the commit confirmation.
 *
 * Every stored path came from `legalMovePlot` — the engine is the sole
 * FR-14 authority. A rejected candidate never replaces the last valid
 * draft; the rule-specific reason is surfaced immediately instead.
 */
export function MovementMode(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const selectedId = useMatchStore((s) => s.selection.selectedConstructId);
  const selectConstruct = useMatchStore((s) => s.selectConstruct);
  const inspectConstruct = useMatchStore((s) => s.inspectConstruct);
  const hoverWaypoint = useMatchStore((s) => s.hoverWaypoint);
  const setMoveDraft = useMatchStore((s) => s.setMoveDraft);
  const clearMoveDraft = useMatchStore((s) => s.clearMoveDraft);
  const setHold = useMatchStore((s) => s.setHold);
  const drafts = useMatchStore((s) => s.drafts);
  const own = useMatchStore(matchSelectors.selectHumanConstructs);
  const [pathReason, setPathReason] = React.useState<string | null>(null);

  const ownById = React.useMemo(
    () => new Map(own.map((c) => [c.id as number, c])),
    [own],
  );
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

  // Keyboard: 1-9/0 select living own only, Backspace drop last,
  // Esc clear, H hold, Enter finish. Ctrl/Cmd+Enter is CommandBar's.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.key >= "1" && e.key <= "9") || e.key === "0") {
        const idx = e.key === "0" ? 9 : parseInt(e.key, 10) - 1;
        const c = own[idx];
        if (c !== undefined && !c.destroyed) {
          selectConstruct(c.id);
          inspectConstruct(c.id);
          hoverWaypoint(null);
          setPathReason(null);
          e.preventDefault();
        }
        return;
      }

      if (selected === null) return;

      if (e.key === "Backspace") {
        if (draft.length === 0) return;
        const next = dropLastWaypoint(draft);
        // If only the origin would remain, clear the draft so the rail's
        // UNPLOTTED state and the implicit-HOLD count stay in agreement.
        if (next.length <= 1) clearMoveDraft(selected.id);
        else setMoveDraft(selected.id, next);
        setPathReason(null);
        e.preventDefault();
      } else if (e.key === "Escape") {
        clearMoveDraft(selected.id);
        hoverWaypoint(null);
        setPathReason(null);
        e.preventDefault();
      } else if (e.key === "h" || e.key === "H") {
        setHold(selected.id, true);
        hoverWaypoint(null);
        setPathReason(null);
        e.preventDefault();
      } else if (e.key === "Enter") {
        // Finish the current click-waypoint path — commit is separate.
        hoverWaypoint(null);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    own,
    selected,
    draft,
    selectConstruct,
    inspectConstruct,
    hoverWaypoint,
    setMoveDraft,
    clearMoveDraft,
    setHold,
  ]);

  return (
    <div className="match-mode match-mode--movement" data-testid="mode-movement">
      <BoardCanvas
        onPointerAction={(kind, world, _event, hit) => {
          if (engine === null || catalog === null) return;
          if (kind === "leave") {
            hoverWaypoint(null);
            return;
          }
          if (kind === "double-click") {
            // Enter equivalent: finish the click-waypoint path (no commit).
            hoverWaypoint(null);
            return;
          }
          if (kind === "move") {
            if (selected !== null && !selected.destroyed) hoverWaypoint(world);
            return;
          }
          // kind === "click"
          const hitId = hit.constructId;
          if (hitId !== null) {
            const hitOwn = ownById.get(hitId as number);
            if (hitOwn !== undefined && !hitOwn.destroyed) {
              // Living own marker → select + inspect, no waypoint.
              selectConstruct(hitId);
              inspectConstruct(hitId);
              hoverWaypoint(null);
              setPathReason(null);
              return;
            }
            // Enemy or destroyed marker → inspect only, never arm a move.
            inspectConstruct(hitId);
            return;
          }
          // Empty terrain → append a waypoint for the selected living own.
          if (selected === null || selected.destroyed) return;
          const base = draft.length > 0 ? draft : [selected.position];
          let candidate = appendWaypoint(base, world);
          let reason: string | null = null;
          if (pathLengthFx(candidate) > allowance) {
            candidate = clampPathToAllowance(candidate, allowance);
            reason = `PATH CLAMPED TO ${allowance}`;
          }
          const legality = legalMovePlot(engine, selected.id, candidate, catalog);
          if (!legality.ok) {
            setPathReason(rejectionReason(legality.error[0], allowance));
            return; // preserve the previous valid draft
          }
          setMoveDraft(selected.id, legality.value.path);
          setPathReason(reason);
        }}
      />
      <aside className="movement-hud" aria-label="Movement plotting">
        <p className="movement-hud__selected" data-testid="mv-selected">
          {selected === null
            ? "SELECT A CONSTRUCT (1–9 or click)"
            : `${selected.chassisCode}-${String(selected.id as number).padStart(2, "0")} · allowance ${allowance}`}
        </p>
        <p className="movement-hud__length" data-testid="mv-length">
          {pathLengthFx(draft)}{" / "}
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

/**
 * Map an engine movement violation to a short, rule-specific plot-time
 * message. Every branch names why the waypoint was refused so the
 * player can correct it without opening the rules drawer.
 */
function rejectionReason(
  violation: { readonly kind: string; readonly message: string } | undefined,
  allowanceFx: number,
): string {
  if (violation === undefined) return "WAYPOINT REJECTED";
  switch (violation.kind) {
    case "PATH_CROSSES_WALL":
      return "WALL — WAYPOINT REJECTED";
    case "PATH_OUT_OF_BOUNDS":
      return "OUT OF BOUNDS — WAYPOINT REJECTED";
    case "OVER_MOVEMENT_ALLOWANCE":
      return `OVER ALLOWANCE ${allowanceFx}`;
    default:
      return violation.message;
  }
}
