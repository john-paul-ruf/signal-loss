import * as React from "react";
import { BoardCanvas } from "../../board";
import { AttackLedger } from "../../components/match";
import { useMatchStore, matchSelectors } from "../../store/match";
import type { ConstructId } from "../../../engine";

/**
 * Attack plot mode (design.md §5.7). Board + attack ledger + inline
 * exchange cards. Pointer clicks on enemy markers set the currently
 * selected construct's target draft.
 */
export function AttackMode(): React.ReactElement {
  const selectedId = useMatchStore((s) => s.selection.selectedConstructId);
  const setAttack = useMatchStore((s) => s.setAttackDraft);
  const enemies = useMatchStore(matchSelectors.selectKnownEnemyList);
  const drafts = useMatchStore((s) => s.drafts);

  return (
    <div className="match-mode match-mode--attack" data-testid="mode-attack">
      <BoardCanvas
        onPointerAction={(kind, world) => {
          if (kind !== "click") return;
          if (selectedId === null) return;
          // Pick nearest enemy within a small tolerance.
          let bestId: ConstructId | null = null;
          let bestD2 = Number.POSITIVE_INFINITY;
          for (const enemy of enemies) {
            if (enemy.base.destroyed) continue;
            const dx = (enemy.position.x as number) - (world.x as number);
            const dy = (enemy.position.y as number) - (world.y as number);
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestId = enemy.base.id;
            }
          }
          if (bestId !== null) {
            const prior = drafts.attackDrafts.get(selectedId as number);
            setAttack(selectedId, bestId, prior?.called ?? false);
          }
        }}
      />
      <AttackLedger />
    </div>
  );
}
