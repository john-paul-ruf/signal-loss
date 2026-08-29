/**
 * App-side deployment placement preflight (FR-12).
 *
 * The engine's `legalDeployment()` is the sole legality authority for spawn,
 * bounds, wall footprint, roster indexing, and chassis-radius overlap. This
 * adapter assembles the player's currently staged placements plus the
 * candidate under evaluation and delegates the decision to that function, so
 * the deployment screen never re-implements the geometry. The only violation
 * suppressed here is `PARTIAL_DEPLOYMENT`, which is the normal state while the
 * player is still placing the remaining constructs.
 */

import { legalDeployment } from "../../../engine";
import type { Catalog, MatchState, Placement, SquadId, Vec2, Violation } from "../../../engine";

export type DeploymentPlacementCheck =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: string;
      readonly violationKind: Violation["kind"] | null;
    };

/**
 * Deterministic priority over the engine violation kinds this adapter maps to
 * stable UI copy. The first kind present (after ignoring the incremental-set
 * `PARTIAL_DEPLOYMENT` noise) determines the reason shown.
 */
const REASON_BY_KIND: ReadonlyMap<string, string> = new Map([
  ["OUTSIDE_SPAWN_REGION", "OUT OF SPAWN REGION"],
  ["OUTSIDE_BOUNDS", "OUT OF MAP BOUNDS"],
  ["PLACEMENT_ON_WALL", "SPOT BLOCKED BY WALL"],
  ["PLACEMENTS_OVERLAP", "SPOT OCCUPIED BY ANOTHER CONSTRUCT"],
]);

const PRIORITY: readonly string[] = [
  "OUTSIDE_SPAWN_REGION",
  "OUTSIDE_BOUNDS",
  "PLACEMENT_ON_WALL",
  "PLACEMENTS_OVERLAP",
];

/**
 * Classify a candidate deployment position for one roster construct by
 * delegating to the engine. The candidate replaces any existing staged entry
 * for `rosterIndex`, so a placed construct can be repositioned without being
 * treated as overlapping itself.
 */
export function classifyDeploymentPlacement(
  state: MatchState,
  squad: SquadId,
  rosterIndex: number,
  candidate: Vec2,
  staged: ReadonlyMap<number, Vec2>,
  catalog: Catalog,
): DeploymentPlacementCheck {
  const placements: Placement[] = [];
  for (const [idx, position] of staged) {
    if (idx === rosterIndex) continue;
    placements.push({ rosterIndex: idx, position });
  }
  placements.push({ rosterIndex, position: candidate });
  placements.sort((a, b) => a.rosterIndex - b.rosterIndex);

  const violations = legalDeployment(state, squad, placements, catalog).filter(
    (v) => v.kind !== "PARTIAL_DEPLOYMENT",
  );
  if (violations.length === 0) return { valid: true };

  for (const kind of PRIORITY) {
    const hit = violations.find((v) => v.kind === kind);
    if (hit !== undefined) {
      const reason = REASON_BY_KIND.get(kind);
      if (reason !== undefined) return { valid: false, reason, violationKind: kind };
    }
  }

  const first = violations[0];
  if (first === undefined) return { valid: true };
  return { valid: false, reason: first.kind, violationKind: first.kind };
}
