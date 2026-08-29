import * as React from "react";
import { BoardCanvas } from "../../board";
import type { DeploymentBoardState } from "../../board/BoardCanvas";
import { useMatchStore } from "../../store/match";
import { pointInPoly } from "../../../engine";
import type { MatchConstruct, Vec2 } from "../../../engine";

const SELECT_HINT = "SELECT A UNIT, THEN CLICK YOUR SPAWN";

/**
 * Deployment mode (design.md §5.5). The observer's spawn is emphasized as
 * `YOUR SPAWN`; other squads' regions render as empty outlines. Select a
 * construct (this rail, the squad rail, or a placed marker) and click the
 * spawn to stage it; clicking with nothing selected stages the next
 * unplaced construct. Drafts stay in `HumanDraftState` — never on engine,
 * public, or AI state — and enemy positions reveal only at BEGIN MATCH
 * (FR-12).
 */
export function DeploymentMode(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const launch = useMatchStore((s) => s.launch);
  const drafts = useMatchStore((s) => s.drafts);
  const selectedConstructId = useMatchStore((s) => s.selection.selectedConstructId);
  const selectConstruct = useMatchStore((s) => s.selectConstruct);
  const setDeploymentDraft = useMatchStore((s) => s.setDeploymentDraft);
  const clearDraft = useMatchStore((s) => s.clearDeploymentDraft);
  const [reason, setReason] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<{ position: Vec2; valid: boolean } | null>(null);

  if (engine === null || launch === null) {
    return <div className="match-mode" data-testid="mode-deployment">Loading…</div>;
  }

  const humanSquad = launch.humanSquadId as number;
  const spawn = engine.map.spawns[humanSquad];
  const own = engine.constructs.filter((c) => (c.squadId as number) === humanSquad);
  const placedCount = drafts.deploymentDrafts.size;

  // The roster index a board click targets: the selected human construct's
  // index if one is armed, else the first unplaced index.
  const selectedRosterIndex = own.findIndex((c) => c.id === selectedConstructId);
  const nextUnplaced = findNextUnplaced(own.length, drafts.deploymentDrafts);
  const targetRosterIndex =
    selectedRosterIndex >= 0
      ? selectedRosterIndex
      : nextUnplaced < own.length
      ? nextUnplaced
      : null;

  function classify(world: Vec2, index: number): { valid: boolean; reason: string | null } {
    if (spawn === undefined || !pointInPoly(world, spawn.polygon)) {
      return { valid: false, reason: "OUT OF SPAWN REGION" };
    }
    for (const [idx, pos] of drafts.deploymentDrafts) {
      if (idx === index) continue;
      if ((pos.x as number) === (world.x as number) && (pos.y as number) === (world.y as number)) {
        return { valid: false, reason: "SPOT OCCUPIED BY ANOTHER CONSTRUCT" };
      }
    }
    return { valid: true, reason: null };
  }

  const activeConstruct = targetRosterIndex === null ? undefined : own[targetRosterIndex];
  const instruction =
    targetRosterIndex === null
      ? "ALL CONSTRUCTS PLACED"
      : selectedRosterIndex >= 0 && activeConstruct !== undefined
      ? `CLICK YOUR SPAWN TO PLACE ${codeOf(activeConstruct)}`
      : SELECT_HINT;

  const boardDeployment: DeploymentBoardState = {
    humanSquadIndex: humanSquad,
    placements: own.flatMap((c, i) => {
      const pos = drafts.deploymentDrafts.get(i);
      return pos === undefined ? [] : [{ rosterIndex: i, constructId: c.id, position: pos }];
    }),
    activeRosterIndex: targetRosterIndex,
    hover,
  };

  return (
    <div className="match-mode match-mode--deployment" data-testid="mode-deployment">
      <BoardCanvas
        deployment={boardDeployment}
        onPointerAction={(kind, world) => {
          if (kind === "leave") {
            setHover(null);
            return;
          }
          if (kind === "move") {
            if (targetRosterIndex === null) {
              setHover(null);
              return;
            }
            const { valid } = classify(world, targetRosterIndex);
            setHover({ position: world, valid });
            if (valid) setReason(null);
            return;
          }
          if (kind !== "click") return;
          if (targetRosterIndex === null) {
            setReason(SELECT_HINT);
            return;
          }
          const result = classify(world, targetRosterIndex);
          if (!result.valid) {
            setReason(result.reason);
            return;
          }
          setDeploymentDraft(targetRosterIndex, world);
          setReason(null);
          setHover(null);
        }}
      />
      <aside className="deployment-hud" aria-label="Deployment">
        <p className="deployment-hud__count" data-testid="deploy-count">
          {placedCount} / {own.length} PLACED
        </p>
        <p className="deployment-hud__instruction" data-testid="deploy-instruction">
          {instruction}
        </p>
        {reason !== null ? (
          <p className="deployment-hud__reason" role="alert" data-testid="deploy-reason">
            {reason}
          </p>
        ) : null}
        <ul className="deployment-hud__list">
          {own.map((c, i) => {
            const pos = drafts.deploymentDrafts.get(i);
            const isSelected = c.id === selectedConstructId;
            const isActive = i === targetRosterIndex;
            return (
              <li key={c.id as number}>
                <button
                  type="button"
                  className={
                    "deployment-hud__item" +
                    (pos !== undefined ? " deployment-hud__item--placed" : "") +
                    (isSelected || isActive ? " deployment-hud__item--active" : "")
                  }
                  data-testid={`deploy-row-${i}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setReason(null);
                    if (pos !== undefined) clearDraft(i);
                    else selectConstruct(c.id);
                  }}
                  aria-label={
                    pos !== undefined
                      ? `${codeOf(c)} placed at ${pos.x as number}, ${pos.y as number} — click to unplace`
                      : `${codeOf(c)} unplaced — click to select, then click your spawn`
                  }
                >
                  <span className="deployment-hud__code">{codeOf(c)}</span>
                  <span className="deployment-hud__slot">
                    {pos !== undefined ? `✓ ${pos.x as number}, ${pos.y as number}` : "UNPLACED"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

function codeOf(c: MatchConstruct): string {
  return `${c.chassisCode}-${String(c.id as number).padStart(2, "0")}`;
}

function findNextUnplaced(
  ownCount: number,
  drafts: ReadonlyMap<number, unknown>,
): number {
  for (let i = 0; i < ownCount; i = i + 1) {
    if (!drafts.has(i)) return i;
  }
  return ownCount;
}
