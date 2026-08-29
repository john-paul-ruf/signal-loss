import * as React from "react";
import { BoardCanvas } from "../../board";
import { AttackLedger } from "../../components/match/AttackLedger";
import { matchSelectors, useMatchStore } from "../../store/match";
import { guardCalledToggle, guardPostureToggle, routeAttackHit } from "../../components/match/attack-model";
import "./attack-mode.css";

export function AttackMode(): React.ReactElement {
  const selectedId = useMatchStore((state) => state.selection.selectedConstructId);
  const hoveredId = useMatchStore((state) => state.selection.hoveredTargetId);
  const engine = useMatchStore((state) => state.engine);
  const launch = useMatchStore((state) => state.launch);
  const drafts = useMatchStore((state) => state.drafts);
  const pool = useMatchStore(matchSelectors.selectHumanPool);
  const selectConstruct = useMatchStore((state) => state.selectConstruct);
  const inspectConstruct = useMatchStore((state) => state.inspectConstruct);
  const hoverTarget = useMatchStore((state) => state.hoverTarget);
  const setAttack = useMatchStore((state) => state.setAttackDraft);
  const setPosture = useMatchStore((state) => state.setPostureDraft);
  const clearPosture = useMatchStore((state) => state.clearPostureDraft);
  const [isTargetPicking, setTargetPicking] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");

  const announce = React.useCallback((message: string) => setFeedback(message), []);
  const exhaust = React.useCallback(() => announce("POOL EXHAUSTED — 0 REMAINING"), [announce]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditable(event.target)) return;
      if (engine === null || launch === null || pool === null) return;
      const livingOwn = engine.constructs.filter(
        (construct) => construct.squadId === launch.humanSquadId && !construct.destroyed,
      );
      const key = event.key.toLowerCase();
      if (/^[0-9]$/.test(key)) {
        const index = key === "0" ? 9 : Number(key) - 1;
        const construct = livingOwn[index];
        if (construct !== undefined) selectConstruct(construct.id);
        return;
      }
      if (key === "t") {
        setTargetPicking(true);
        announce("TARGET PICK — SELECT AN EXACT ENEMY");
        return;
      }
      if (key === "i") {
        if (hoveredId !== null) inspectConstruct(hoveredId);
        return;
      }
      if (key === "escape") {
        setTargetPicking(false);
        setFeedback("");
        return;
      }
      if (selectedId === null) return;
      if (key === "c") {
        const result = guardCalledToggle(engine, launch.humanSquadId, drafts, pool.total, selectedId);
        if (!result.accepted) {
          announce(result.reason === "NO_TARGET" ? "DECLARE A TARGET BEFORE CALLED SHOT" : "POOL EXHAUSTED — 0 REMAINING");
          return;
        }
        const attack = drafts.attackDrafts.get(selectedId as number);
        if (attack !== undefined) setAttack(selectedId, attack.targetId, result.active);
      }
      if (key === "p") {
        const result = guardPostureToggle(engine, launch.humanSquadId, drafts, pool.total, selectedId);
        if (!result.accepted) {
          exhaust();
          return;
        }
        if (result.active) setPosture(selectedId, "POSTURE");
        else clearPosture(selectedId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    announce,
    clearPosture,
    drafts,
    engine,
    exhaust,
    hoveredId,
    inspectConstruct,
    launch,
    pool,
    selectConstruct,
    selectedId,
    setAttack,
    setPosture,
  ]);

  return (
    <div className="match-mode match-mode--attack" data-testid="mode-attack">
      <BoardCanvas
        onPointerAction={(kind, _world, _event, hit) => {
          if (kind === "leave") {
            hoverTarget(null);
            return;
          }
          if (kind === "move") {
            hoverTarget(hit.constructId);
            return;
          }
          if (kind !== "click" || engine === null || launch === null) return;
          const command = routeAttackHit(
            engine.constructs,
            launch.humanSquadId,
            selectedId,
            hit.constructId,
          );
          if (command.kind === "SELECT") {
            selectConstruct(command.constructId);
            return;
          }
          if (command.kind === "TARGET") {
            const prior = drafts.attackDrafts.get(command.attackerId as number);
            setAttack(command.attackerId, command.targetId, prior?.called ?? false);
            setTargetPicking(false);
            setFeedback("");
          }
        }}
      />
      <AttackLedger onFeedback={announce} />
      {isTargetPicking ? (
        <p className="attack-mode__target-pick" role="status">TARGET PICK · SELECT AN EXACT ENEMY</p>
      ) : null}
      <p className="attack-mode__feedback" role="status" aria-live="polite">
        {feedback}
      </p>
    </div>
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, select, textarea, button");
}
