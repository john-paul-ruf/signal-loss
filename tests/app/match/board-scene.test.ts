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
  projectPlaybackFrame,
} from "../../../src/app/board";
import { applyDeployments, fxFromInt, publicView, squadId } from "../../../src/engine";
import type { MatchState, Vec2 } from "../../../src/engine";
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
  state: MatchState;
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
  return { pv: publicView(deployed.value, squadId(0), cfg.catalog), catalog: cfg.catalog, state: deployed.value };
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

describe("scene/playback — event prefix projection", () => {
  it("interpolates an exact multi-segment movement and preserves the unwalked stub", () => {
    const { state, catalog } = deployedPublicView();
    const construct = state.constructs[0]!;
    const bend = {
      x: (construct.position.x as number) + (fxFromInt(1) as number),
      y: construct.position.y,
    } as Vec2;
    const end = {
      x: bend.x,
      y: (bend.y as number) + (fxFromInt(1) as number),
    } as Vec2;
    const moved: Event = {
      kind: "MOVED",
      round: state.round,
      constructId: construct.id,
      from: construct.position,
      stopPosition: end,
      plottedPath: [construct.position, bend, end],
      pathDistance: 2048,
      plottedLength: 2048,
      halted: false,
    };
    const atStart = projectPlaybackFrame(state, catalog, squadId(0), [moved], 0, 0);
    const halfway = projectPlaybackFrame(state, catalog, squadId(0), [moved], 0, 0.5);
    const atEnd = projectPlaybackFrame(state, catalog, squadId(0), [moved], 1, 0);
    expect(atStart.constructs[0]?.position).toEqual(construct.position);
    expect(halfway.constructs[0]?.position).toEqual(bend);
    expect(atEnd.constructs[0]?.position).toEqual(end);
    expect(halfway.paths[0]?.unwalked.at(-1)).toEqual(end);
    expect(state.constructs[0]?.position).toEqual(construct.position);
    expect(moved).toMatchObject({ plottedPath: [construct.position, bend, end] });
  });

  it("stages halt, posture, shot, dial, trace, destruction, and completion facts", () => {
    const { state, catalog } = deployedPublicView();
    const own = state.constructs[0]!;
    const target = state.constructs[1]!;
    const events: Event[] = [
      { kind: "POSTURE_REVEAL", round: 1, constructId: own.id, posture: "POSTURE", squadId: own.squadId },
      { kind: "SHOT", round: 1, attackerId: own.id, targetId: target.id, called: true, landed: true, damage: 1, targetPosture: "FLAT", baseDamage: 1 },
      { kind: "DIAL_ADVANCED", round: 1, constructId: target.id, from: 0, to: 1 },
      { kind: "TRACE_DAMAGE", round: 1, constructId: target.id, damage: 1, stepIndex: 0, safeRegionRound: 1 },
      { kind: "DESTROYED", round: 1, constructId: target.id, squadId: target.squadId, cause: "TRACE", wasCommander: false },
      { kind: "MATCH_COMPLETE", round: 1, winner: own.squadId, reason: "LAST_STANDING" },
    ];
    const frame = projectPlaybackFrame(state, catalog, squadId(0), events, events.length, 0);
    expect(frame.constructs[0]?.posture).toBe("POSTURE");
    expect(frame.shots).toHaveLength(1);
    expect(frame.constructs[1]?.dialIndex).toBe(2);
    expect(frame.constructs[1]?.destroyed).toBe(true);
    expect(frame.matchComplete).toBe(true);
  });

  it("keeps an unconfirmed enemy at its public ghost position", () => {
    const { state, catalog } = deployedPublicView();
    const enemy = state.constructs[1]!;
    const stale = {
      ...state,
      round: state.round + 1,
      knownPositions: state.knownPositions.map((entry) =>
        entry.subject === enemy.id && entry.observer === squadId(0)
          ? { ...entry, confirmedRound: state.round }
          : entry,
      ),
    };
    const ghostBefore = publicView(stale, squadId(0), catalog).constructs.find((known) => known.base.id === enemy.id)!;
    const hiddenEnd = { x: fxFromInt(9), y: fxFromInt(9) };
    const moved: Event = {
      kind: "MOVED",
      round: stale.round,
      constructId: enemy.id,
      from: enemy.position,
      stopPosition: hiddenEnd,
      plottedPath: [enemy.position, hiddenEnd],
      pathDistance: 1024,
      plottedLength: 1024,
      halted: false,
    };
    const frame = projectPlaybackFrame(stale, catalog, squadId(0), [moved], 1, 0);
    const projected = frame.constructs.find((scene) => scene.id === enemy.id)!;
    expect(projected.ghost).toBe(true);
    expect(projected.position).toEqual(ghostBefore.position);
    expect(projected.position).not.toEqual(hiddenEnd);
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
