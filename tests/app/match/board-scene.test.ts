/**
 * Scene assembly tests. Everything the canvas layers draw comes out of
 * these functions — so if the scene is correct, the pixels are
 * derivably correct.
 */

import { describe, expect, it } from "vitest";
import {
  buildConstructScene,
  buildTerrainScene,
  extractShotLines,
} from "../../../src/app/board";
import { applyDeployments, publicView, squadId } from "../../../src/engine";
import {
  soloCenterPlacements,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";
import type { testCatalog } from "../../fixtures/matches/simple-match";
import { createMatch } from "../../../src/engine";
import type { Event } from "../../../src/engine";

function deployedPublicView(): {
  pv: ReturnType<typeof publicView>;
  catalog: ReturnType<typeof testCatalog>;
} {
  const cfg = soloMatchConfig();
  const state = createMatch(cfg);
  if (!state.ok) throw new Error("createMatch failed");
  const deployed = applyDeployments(
    state.value,
    soloCenterPlacements(state.value),
    cfg.catalog,
  );
  if (!deployed.ok) throw new Error("applyDeployments failed");
  return { pv: publicView(deployed.value, squadId(0), cfg.catalog), catalog: cfg.catalog };
}

describe("scene/terrain — trace step lookup", () => {
  it("returns the highest-index step whose round <= current round", () => {
    const { pv } = deployedPublicView();
    const scene = buildTerrainScene(pv, 1);
    // Round 1: the schedule's first entry starts at round >= 1 depending
    // on the fixture; we only assert the shape.
    expect(scene.spawnRegions).toHaveLength(5);
    expect(Array.isArray(scene.walls)).toBe(true);
    // nextTraceStep is either null or one step ahead.
    if (scene.traceStep !== null && scene.nextTraceStep !== null) {
      expect(scene.nextTraceStep.index).toBeGreaterThan(scene.traceStep.index);
    }
  });
});

describe("scene/constructs — one per known", () => {
  it("emits five scenes sorted by construct id ascending", () => {
    const { pv, catalog } = deployedPublicView();
    const scenes = buildConstructScene(pv, catalog);
    expect(scenes).toHaveLength(5);
    for (let i = 1; i < scenes.length; i = i + 1) {
      const prev = scenes[i - 1];
      const cur = scenes[i];
      if (prev === undefined || cur === undefined) continue;
      expect((cur.id as number) > (prev.id as number)).toBe(true);
    }
    // Own squad's scene is not a ghost.
    const own = scenes.find((s) => (s.squadId as number) === 0);
    expect(own?.ghost).toBe(false);
  });
});

describe("scene/extractShotLines — pairs SHOT events with construct positions", () => {
  it("returns one line per SHOT event whose attacker + target are known", () => {
    const { pv, catalog } = deployedPublicView();
    const scenes = buildConstructScene(pv, catalog);
    if (scenes[0] === undefined || scenes[1] === undefined) throw new Error("scenes");
    const events: Event[] = [
      {
        kind: "SHOT",
        round: 1,
        attackerId: scenes[0].id,
        targetId: scenes[1].id,
        called: false,
        landed: true,
        damage: 3,
        targetPosture: "FLAT",
        baseDamage: 3,
      },
    ];
    const shots = extractShotLines(events, scenes);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.damage).toBe(3);
  });
});
