import * as React from "react";
import { BoardCanvas } from "../../board";
import { useMatchStore } from "../../store/match";
import { pointInPoly } from "../../../engine";

/**
 * Deployment mode (design.md §5.5). Human player's spawn region is
 * emphasized; other squads' regions render as outlines. Click inside
 * the spawn region to place the next undeployed construct; auto-deploy
 * calls the engine's deterministic placement helper.
 *
 * Enemy deployment reveals SIMULTANEOUSLY at BEGIN MATCH (FR-12) — we
 * NEVER render enemy positions before the commit.
 */
export function DeploymentMode(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const launch = useMatchStore((s) => s.launch);
  const drafts = useMatchStore((s) => s.drafts);
  const setDeploymentDraft = useMatchStore((s) => s.setDeploymentDraft);
  const clearDraft = useMatchStore((s) => s.clearDeploymentDraft);
  const [reason, setReason] = React.useState<string | null>(null);

  if (engine === null || launch === null) {
    return <div className="match-mode" data-testid="mode-deployment">Loading…</div>;
  }

  const humanSquad = launch.humanSquadId as number;
  const spawn = engine.map.spawns[humanSquad];
  const own = engine.constructs.filter((c) => (c.squadId as number) === humanSquad);
  const nextRosterIndex = findNextUnplaced(own.length, drafts.deploymentDrafts);
  const placed = drafts.deploymentDrafts.size;

  return (
    <div className="match-mode match-mode--deployment" data-testid="mode-deployment">
      <BoardCanvas
        onPointerAction={(kind, world) => {
          if (kind !== "click") return;
          if (spawn === undefined) return;
          if (nextRosterIndex >= own.length) return;
          if (!pointInPoly(world, spawn.polygon)) {
            setReason("OUT OF SPAWN REGION");
            return;
          }
          // Reject if this exact spot is already occupied by a prior draft.
          for (const [, pos] of drafts.deploymentDrafts) {
            if ((pos.x as number) === (world.x as number) && (pos.y as number) === (world.y as number)) {
              setReason("SPOT OCCUPIED BY ANOTHER CONSTRUCT");
              return;
            }
          }
          setDeploymentDraft(nextRosterIndex, world);
          setReason(null);
        }}
      />
      <aside className="deployment-hud" aria-label="Deployment progress">
        <p className="deployment-hud__count" data-testid="deploy-count">
          {placed} / {own.length} PLACED
        </p>
        {reason !== null ? (
          <p className="deployment-hud__reason" role="alert" data-testid="deploy-reason">
            {reason}
          </p>
        ) : null}
        <ul className="deployment-hud__list">
          {own.map((c, i) => {
            const pos = drafts.deploymentDrafts.get(i);
            return (
              <li key={c.id as number}>
                <button
                  type="button"
                  className={pos !== undefined ? "deployment-hud__item--placed" : ""}
                  onClick={() => (pos !== undefined ? clearDraft(i) : undefined)}
                  aria-label={
                    pos !== undefined
                      ? `Construct ${c.id as number} placed at ${pos.x as number}, ${pos.y as number} — click to unplace`
                      : `Construct ${c.id as number} unplaced`
                  }
                >
                  {c.chassisCode}-{String(c.id as number).padStart(2, "0")}{" "}
                  {pos !== undefined
                    ? `✓ ${pos.x as number}, ${pos.y as number}`
                    : "unplaced"}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
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
