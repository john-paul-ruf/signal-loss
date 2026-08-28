import { describe, expect, it } from "vitest";
import { canonicalHash } from "../../../src/engine/catalog/index";
import {
  buildGenerationContext,
} from "../../../src/engine/map/generators/common";
import { generateGeometry, wallStrategyFor } from "../../../src/engine/map/generators/index";
import { subsystemStream, RNG_LABELS } from "../../../src/engine/map/generators/common";
import { spawnRegionsDisjoint, validateTraceSchedule } from "../../../src/engine/map/types";
import { testArchetypes } from "../../fixtures/maps/archetypes";
import { testTunables } from "../../fixtures/maps/tunables";

describe("map/generators / all seven strategies produce structurally-valid geometry", () => {
  for (const archetype of testArchetypes) {
    it(`${archetype.id}: walls, spawns, and trace are all well-formed`, () => {
      const ctx = buildGenerationContext("test-seed", archetype, testTunables);
      const geo = generateGeometry(ctx);
      // Walls: stable ids 0..n-1 in order.
      for (let i = 0; i < geo.walls.length; i = i + 1) {
        expect(geo.walls[i]?.id).toBe(i);
      }
      // Spawns: five, disjoint.
      expect(geo.spawns.length).toBe(5);
      expect(spawnRegionsDisjoint(geo.spawns)).toBe(true);
      // Trace: validates against the ctx bounds.
      expect(validateTraceSchedule(ctx.bounds, geo.traceSchedule)).toBeNull();
    });
  }
});

describe("map/generators / determinism — same seed produces byte-identical output", () => {
  for (const archetype of testArchetypes) {
    it(`${archetype.id}: two runs at seed "abc" hash identically`, () => {
      const ctx1 = buildGenerationContext("abc", archetype, testTunables);
      const ctx2 = buildGenerationContext("abc", archetype, testTunables);
      const g1 = generateGeometry(ctx1);
      const g2 = generateGeometry(ctx2);
      expect(canonicalHash(g1)).toBe(canonicalHash(g2));
    });
  }

  it("distinct seeds produce distinct geometry (for the same archetype)", () => {
    const arche = testArchetypes[0];
    expect(arche).toBeDefined();
    if (arche === undefined) return;
    const ctxA = buildGenerationContext("seed-a", arche, testTunables);
    const ctxB = buildGenerationContext("seed-b", arche, testTunables);
    const gA = generateGeometry(ctxA);
    const gB = generateGeometry(ctxB);
    expect(canonicalHash(gA)).not.toBe(canonicalHash(gB));
  });
});

describe("map/generators / named-stream isolation", () => {
  it("independently-derived subsystem RNGs from the same root do not collide", () => {
    const arche = testArchetypes[0];
    expect(arche).toBeDefined();
    if (arche === undefined) return;
    const ctx = buildGenerationContext("iso", arche, testTunables);
    const wallRng = subsystemStream(ctx, RNG_LABELS.walls);
    const spawnRng = subsystemStream(ctx, RNG_LABELS.spawns);
    const traceRng = subsystemStream(ctx, RNG_LABELS.trace);
    // Streams should differ from one another and from the root.
    expect(wallRng.state).not.toEqual(spawnRng.state);
    expect(wallRng.state).not.toEqual(traceRng.state);
    expect(spawnRng.state).not.toEqual(traceRng.state);
    expect(wallRng.state).not.toEqual(ctx.rootRng.state);
  });

  it("hazard-field: changing wall stream draw count does not shift hazard positions", () => {
    // Cover the invariant by re-running with a change that alters the wall
    // stream (a smaller cover count) but should NOT change hazard walls.
    const original = testArchetypes.find(a => (a.id as unknown as string) === "hazard-field");
    expect(original).toBeDefined();
    if (original === undefined) return;
    const shifted = {
      ...original,
      parameters: { ...original.parameters, cover: 0 },
    };
    const ctxA = buildGenerationContext("iso-haz", original, testTunables);
    const ctxB = buildGenerationContext("iso-haz", shifted, testTunables);
    const gA = generateGeometry(ctxA);
    const gB = generateGeometry(ctxB);
    // Hazards are emitted first, ids 0..hazardCount-1. Compare that prefix.
    const hazardCount = original.parameters["hazards"] ?? 12;
    for (let i = 0; i < hazardCount; i = i + 1) {
      expect(gA.walls[i]?.a).toEqual(gB.walls[i]?.a);
      expect(gA.walls[i]?.b).toEqual(gB.walls[i]?.b);
    }
  });
});

describe("map/generators / geometry stays inside bounds", () => {
  for (const archetype of testArchetypes) {
    it(`${archetype.id}: every wall endpoint is inside bounds`, () => {
      const ctx = buildGenerationContext(`bounds-${archetype.id}`, archetype, testTunables);
      const geo = generateGeometry(ctx);
      const minX = ctx.boundsMin.x as number;
      const minY = ctx.boundsMin.y as number;
      const maxX = ctx.boundsMax.x as number;
      const maxY = ctx.boundsMax.y as number;
      for (let i = 0; i < geo.walls.length; i = i + 1) {
        const w = geo.walls[i];
        if (w === undefined) continue;
        for (const p of [w.a, w.b]) {
          expect(p.x as number).toBeGreaterThanOrEqual(minX);
          expect(p.x as number).toBeLessThanOrEqual(maxX);
          expect(p.y as number).toBeGreaterThanOrEqual(minY);
          expect(p.y as number).toBeLessThanOrEqual(maxY);
        }
      }
    });
  }
});

describe("map/generators / dispatch", () => {
  it("throws for an unknown archetype id", () => {
    expect(() => wallStrategyFor("not-real" as never)).toThrow(/no strategy/);
  });
});
