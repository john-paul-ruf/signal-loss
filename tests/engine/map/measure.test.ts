import { describe, expect, it } from "vitest";
import { fxFromInt, type Vec2 } from "../../../src/engine/fx/index";
import { buildGenerationContext } from "../../../src/engine/map/generators/common";
import { generateGeometry } from "../../../src/engine/map/generators/index";
import type { WallSegment } from "../../../src/engine/map/types";
import {
  DEFAULT_MEASURE_OPTIONS,
  measureArchetype,
} from "../../../src/engine/map/measure";
import { testArchetypes } from "../../fixtures/maps/archetypes";
import { testTunables } from "../../fixtures/maps/tunables";
import { simpleBounds, simpleWalls } from "../../fixtures/maps/simple";

describe("map/measure / measureArchetype", () => {
  it("returns zero wall density for an empty wall set", () => {
    const bounds: readonly Vec2[] = [
      { x: fxFromInt(-16), y: fxFromInt(-16) },
      { x: fxFromInt(16), y: fxFromInt(-16) },
      { x: fxFromInt(16), y: fxFromInt(16) },
      { x: fxFromInt(-16), y: fxFromInt(16) },
    ];
    const m = measureArchetype([], bounds, DEFAULT_MEASURE_OPTIONS);
    expect(m.wallDensity).toBe(0);
    // No walls → the sightline probe hits max range every time. That
    // value is exact, positive, and finite.
    expect(m.meanSightlineLength as number).toBe(
      DEFAULT_MEASURE_OPTIONS.sightMaxRange as number,
    );
    expect(m.openAreaFraction).toBeCloseTo(1, 5);
  });

  it("returns higher wall density when more segments are added", () => {
    const bounds: readonly Vec2[] = [
      { x: fxFromInt(-16), y: fxFromInt(-16) },
      { x: fxFromInt(16), y: fxFromInt(-16) },
      { x: fxFromInt(16), y: fxFromInt(16) },
      { x: fxFromInt(-16), y: fxFromInt(16) },
    ];
    const few: readonly WallSegment[] = simpleWalls.slice(0, 1);
    const many = simpleWalls;
    const mFew = measureArchetype(few, bounds, DEFAULT_MEASURE_OPTIONS);
    const mMany = measureArchetype(many, bounds, DEFAULT_MEASURE_OPTIONS);
    expect(mMany.wallDensity).toBeGreaterThan(mFew.wallDensity);
  });

  it("returns a shorter mean sightline in the presence of walls than without", () => {
    const bounds = simpleBounds;
    const withoutWalls = measureArchetype([], bounds, DEFAULT_MEASURE_OPTIONS);
    const withWalls = measureArchetype(simpleWalls, bounds, DEFAULT_MEASURE_OPTIONS);
    expect(withWalls.meanSightlineLength as number)
      .toBeLessThan(withoutWalls.meanSightlineLength as number);
  });

  it("is deterministic — repeated calls on the same map produce identical metrics", () => {
    const bounds = simpleBounds;
    const first = measureArchetype(simpleWalls, bounds, DEFAULT_MEASURE_OPTIONS);
    const second = measureArchetype(simpleWalls, bounds, DEFAULT_MEASURE_OPTIONS);
    expect(first).toEqual(second);
  });
});

describe("map/measure / archetype outputs land inside their declared metric ranges", () => {
  // The test fixtures use deliberately wide ranges so this always passes;
  // Session 06 will supply tight ranges after tuning. This test guards
  // the shape of the invariant, not the balance of the numbers.
  for (const archetype of testArchetypes) {
    it(`${archetype.id}: metrics fall inside the declared archetype ranges`, () => {
      const ctx = buildGenerationContext(`m-${archetype.id}`, archetype, testTunables);
      const geo = generateGeometry(ctx);
      const m = measureArchetype(geo.walls, ctx.bounds, DEFAULT_MEASURE_OPTIONS);
      expect(m.wallDensity).toBeGreaterThanOrEqual(archetype.wallDensity.min);
      expect(m.wallDensity).toBeLessThanOrEqual(archetype.wallDensity.max);
      expect(m.meanSightlineLength as number)
        .toBeGreaterThanOrEqual(archetype.meanSightlineLength.min as number);
      expect(m.meanSightlineLength as number)
        .toBeLessThanOrEqual(archetype.meanSightlineLength.max as number);
      expect(m.openAreaFraction)
        .toBeGreaterThanOrEqual(archetype.openAreaFraction.min);
      expect(m.openAreaFraction)
        .toBeLessThanOrEqual(archetype.openAreaFraction.max);
    });
  }
});
