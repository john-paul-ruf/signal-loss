/**
 * Engine-backed deployment preflight (SESSION-02, FR-12). These tests prove
 * the adapter delegates every legality decision to `legalDeployment()` and
 * ignores only the incremental-staging `PARTIAL_DEPLOYMENT` noise. Distances
 * and regions come from the real pair fixture; no distance formula is
 * reproduced here.
 */

import { describe, expect, it } from "vitest";
import { createMatch, fxFromInt, squadId } from "../../../src/engine";
import type { Fx, GameMap, MatchState, Vec2 } from "../../../src/engine";
import { classifyDeploymentPlacement } from "../../../src/app/screens/match/deployment-placement";
import { pairMatchConfig } from "../../fixtures/matches/simple-match";

function vec(unitX: number, unitY: number): Vec2 {
  return { x: fxFromInt(unitX) as Fx, y: fxFromInt(unitY) as Fx };
}

function deploymentState(): { state: MatchState; catalog: ReturnType<typeof pairMatchConfig>["catalog"] } {
  const config = pairMatchConfig();
  const created = createMatch(config);
  if (!created.ok) {
    throw new Error(`createMatch failed: ${JSON.stringify(created.error.slice(0, 3))}`);
  }
  return { state: created.value, catalog: config.catalog };
}

const SQUAD = squadId(0);

describe("classifyDeploymentPlacement — engine-backed preflight", () => {
  it("rejects an out-of-spawn candidate with OUT OF SPAWN REGION", () => {
    const { state, catalog } = deploymentState();
    const check = classifyDeploymentPlacement(
      state,
      SQUAD,
      0,
      vec(0, 0), // board center — squad 0's spawn is the (-13,-13) corner box
      new Map(),
      catalog,
    );
    expect(check.valid).toBe(false);
    if (!check.valid) {
      expect(check.reason).toBe("OUT OF SPAWN REGION");
      expect(check.violationKind).toBe("OUTSIDE_SPAWN_REGION");
    }
  });

  it("rejects a candidate within the footprint sum of another staged construct", () => {
    const { state, catalog } = deploymentState();
    // Roster 1 staged one board unit (1024 fx) from the candidate; each
    // HARDLINE footprint is 1024, so the inclusive overlap rule fires.
    const staged = new Map<number, Vec2>([[1, vec(-13, -13)]]);
    const check = classifyDeploymentPlacement(state, SQUAD, 0, vec(-12, -13), staged, catalog);
    expect(check.valid).toBe(false);
    if (!check.valid) {
      expect(check.reason).toBe("SPOT OCCUPIED BY ANOTHER CONSTRUCT");
      expect(check.violationKind).toBe("PLACEMENTS_OVERLAP");
    }
  });

  it("accepts a diagonally separated in-region candidate beyond the footprint sum", () => {
    const { state, catalog } = deploymentState();
    const staged = new Map<number, Vec2>([[1, vec(-14, -14)]]);
    const check = classifyDeploymentPlacement(state, SQUAD, 0, vec(-12, -12), staged, catalog);
    expect(check.valid).toBe(true);
  });

  it("does not treat repositioning a construct at its own spot as self-overlap", () => {
    const { state, catalog } = deploymentState();
    const spot = vec(-13, -13);
    const staged = new Map<number, Vec2>([[0, spot]]);
    const check = classifyDeploymentPlacement(state, SQUAD, 0, spot, staged, catalog);
    expect(check.valid).toBe(true);
  });

  it("rejects a candidate on a wall with SPOT BLOCKED BY WALL", () => {
    const { state, catalog } = deploymentState();
    // The fixture walls sit at board center, away from the corner spawns, so
    // clone the map with a wall crossing squad 0's spawn at y = -13.
    const walled: MatchState = {
      ...state,
      map: {
        ...state.map,
        walls: [...state.map.walls, { id: 99, a: vec(-15, -13), b: vec(-11, -13) }],
      } as GameMap,
    };
    const check = classifyDeploymentPlacement(walled, SQUAD, 0, vec(-13, -13), new Map(), catalog);
    expect(check.valid).toBe(false);
    if (!check.valid) {
      expect(check.reason).toBe("SPOT BLOCKED BY WALL");
      expect(check.violationKind).toBe("PLACEMENT_ON_WALL");
    }
  });
});
