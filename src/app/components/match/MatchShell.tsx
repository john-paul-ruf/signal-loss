import * as React from "react";
import "./match-shell.css";
import { useMatchStore } from "../../store/match";
import { PhaseHeader } from "./PhaseHeader";
import { TraceTimeline } from "./TraceTimeline";
import { PoolLedger } from "./PoolLedger";
import { SquadRail } from "./SquadRail";
import { InspectorPanel } from "./InspectorPanel";
import { RoundLog } from "./RoundLog";
import { CommandBar } from "./CommandBar";
import { RulesDrawer } from "./RulesDrawer";

/**
 * The persistent match shell — chrome for deployment, movement, attack,
 * and playback modes (design.md §5.4). The board slot is a render
 * prop so each mode swaps its own canvas + input layer without
 * rebuilding the surrounding rails.
 */
export interface MatchShellProps {
  readonly boardSlot: React.ReactNode;
  readonly bodyClassName?: string;
}

export function MatchShell(props: MatchShellProps): React.ReactElement {
  const rulesOpen = useMatchStore((s) => s.selection.rulesDrawerOpen);

  // Global rules-drawer keybinding — `?` or `F1` opens; Escape closes.
  const openRules = useMatchStore((s) => s.openRulesDrawer);
  const closeRules = useMatchStore((s) => s.closeRulesDrawer);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.defaultPrevented) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (!inField && (e.key === "?" || e.key === "F1")) {
        e.preventDefault();
        openRules(null);
        return;
      }
      if (rulesOpen && e.key === "Escape") {
        e.preventDefault();
        closeRules();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRules, closeRules, rulesOpen]);

  return (
    <main className="match-shell" aria-label="Match" role="main">
      <header className="match-shell__top" role="banner">
        <PhaseHeader />
        <TraceTimeline />
        <PoolLedger />
      </header>
      <div className={`match-shell__body ${props.bodyClassName ?? ""}`}>
        <aside
          className="match-shell__rail"
          aria-label="Squad rail — your constructs"
        >
          <SquadRail />
        </aside>
        <section
          className="match-shell__board"
          aria-label="Board"
        >
          {props.boardSlot}
        </section>
        <aside
          className="match-shell__inspector"
          aria-label="Inspector and round log"
        >
          <InspectorPanel />
          <RoundLog />
        </aside>
      </div>
      <footer className="match-shell__command" role="contentinfo">
        <CommandBar />
      </footer>
      {rulesOpen ? <RulesDrawer /> : null}
    </main>
  );
}
