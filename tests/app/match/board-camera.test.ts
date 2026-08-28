/**
 * Camera / hit-test / squad-visual — pure math tests.
 */

import { describe, expect, it } from "vitest";
import {
  boundsAabb,
  fitCamera,
  screenToWorldX,
  screenToWorldY,
  snapPointerToFx,
  worldToScreenX,
  worldToScreenY,
} from "../../../src/app/board";
import {
  pickConstruct,
  pointInPolygonScreen,
} from "../../../src/app/board";
import { separabilityTriples, visualFor } from "../../../src/app/board";
import type { Fx, KnownConstruct } from "../../../src/engine";
import { squadId } from "../../../src/engine";

const BOUNDS = {
  min: { x: -16 as Fx, y: -16 as Fx },
  max: { x: 16 as Fx, y: 16 as Fx },
};
const VIEWPORT = { width: 640, height: 480, devicePixelRatio: 1 };

describe("board/camera — round trip", () => {
  it("worldToScreen(screenToWorld(x)) is identity within 1 pixel", () => {
    const cam = fitCamera(BOUNDS, VIEWPORT);
    for (let sx = 10; sx < 620; sx = sx + 50) {
      for (let sy = 10; sy < 470; sy = sy + 50) {
        const wx = screenToWorldX(cam, sx);
        const wy = screenToWorldY(cam, sy);
        const sx2 = worldToScreenX(cam, wx as Fx);
        const sy2 = worldToScreenY(cam, wy as Fx);
        expect(Math.abs(sx2 - sx)).toBeLessThan(0.01);
        expect(Math.abs(sy2 - sy)).toBeLessThan(0.01);
      }
    }
  });

  it("snapPointerToFx returns integer fx coordinates", () => {
    const cam = fitCamera(BOUNDS, VIEWPORT);
    const p = snapPointerToFx(cam, 123.4, 456.7);
    expect(Number.isInteger(p.x as number)).toBe(true);
    expect(Number.isInteger(p.y as number)).toBe(true);
  });

  it("boundsAabb takes AABB of a polygon", () => {
    const box = boundsAabb([
      { x: -3 as Fx, y: -4 as Fx },
      { x: 5 as Fx, y: -4 as Fx },
      { x: 5 as Fx, y: 7 as Fx },
      { x: -3 as Fx, y: 7 as Fx },
    ]);
    expect(box.min.x as number).toBe(-3);
    expect(box.min.y as number).toBe(-4);
    expect(box.max.x as number).toBe(5);
    expect(box.max.y as number).toBe(7);
  });
});

describe("board/hit-test — pickConstruct", () => {
  it("picks the closest construct within footprint", () => {
    const cam = fitCamera(BOUNDS, VIEWPORT);
    const items: KnownConstruct[] = [
      makeKnown(0, 0, 0),
      makeKnown(1, 4, 0),
      makeKnown(2, 10, 0),
    ];
    // Screen at world (2, 0) — closest to id 0.
    const sx = worldToScreenX(cam, 2 as Fx);
    const sy = worldToScreenY(cam, 0 as Fx);
    const picked = pickConstruct(cam, items, sx, sy, 3);
    expect(picked as number).toBe(0);
  });

  it("returns null if no construct within footprint", () => {
    const cam = fitCamera(BOUNDS, VIEWPORT);
    const items = [makeKnown(7, 15, 15)];
    const picked = pickConstruct(cam, items, 0, 0, 2);
    expect(picked).toBeNull();
  });

  it("ties break to lower construct id", () => {
    const cam = fitCamera(BOUNDS, VIEWPORT);
    const items = [makeKnown(5, 0, 0), makeKnown(1, 0, 0)];
    const sx = worldToScreenX(cam, 0 as Fx);
    const sy = worldToScreenY(cam, 0 as Fx);
    const picked = pickConstruct(cam, items, sx, sy, 2);
    expect(picked as number).toBe(1);
  });

  it("pointInPolygonScreen recognises a square", () => {
    const cam = fitCamera(BOUNDS, VIEWPORT);
    const square = [
      { x: -4, y: -4 },
      { x: 4, y: -4 },
      { x: 4, y: 4 },
      { x: -4, y: 4 },
    ];
    const inside = worldToScreenY(cam, 0 as Fx);
    expect(pointInPolygonScreen(cam, square, worldToScreenX(cam, 0 as Fx), inside)).toBe(true);
    expect(pointInPolygonScreen(cam, square, worldToScreenX(cam, 10 as Fx), inside)).toBe(false);
  });
});

describe("board/squad-visual", () => {
  it("has 5 distinct visuals", () => {
    const triples = separabilityTriples();
    expect(triples).toHaveLength(5);
  });

  it("each squad has a unique (lightness, glyph, pattern) triple", () => {
    const triples = separabilityTriples();
    const keys = new Set(triples.map((t) => `${t.lightness}|${t.glyph}|${t.pattern}`));
    expect(keys.size).toBe(5);
  });

  it("visualFor(sq) returns the same object for the same id", () => {
    const a = visualFor(squadId(2));
    const b = visualFor(squadId(2));
    expect(a).toBe(b);
  });
});

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function makeKnown(id: number, x: number, y: number): KnownConstruct {
  return {
    base: {
      id: id as never,
      squadId: 0 as never,
      chassisCode: 10 as never,
      commanderCode: null,
      mounts: [],
      dialIndex: 0,
      destroyed: false,
      destroyedRound: null,
      damageDealt: 0,
      damageTaken: 0,
      roundsAlive: 0,
      calledShotsFired: 0,
      posturesHeld: 0,
    },
    position: { x: x as Fx, y: y as Fx },
    confirmedRound: 1,
    confirmed: true,
    driftRadius: 0 as Fx,
  };
}
