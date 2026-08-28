import { describe, expect, it } from "vitest";
import { fxFromInt, type Vec2 } from "../../../src/engine/fx/index";
import {
  GATE_CHECK_ORDER,
  polygonContains,
  spawnRegionsDisjoint,
  validateTraceSchedule,
  type SpawnQuintet,
  type TraceStep,
} from "../../../src/engine/map/types";
import {
  buildSimpleMap,
  simpleBounds,
  simpleSpawns,
  simpleTrace,
} from "../../fixtures/maps/simple";

function v(unitX: number, unitY: number): Vec2 {
  return { x: fxFromInt(unitX), y: fxFromInt(unitY) };
}

describe("map/types / GameMap fixture is well-formed", () => {
  it("is structurally cloneable via JSON round-trip", () => {
    const map = buildSimpleMap();
    const json = JSON.stringify(map);
    const roundTripped = JSON.parse(json) as unknown;
    expect(roundTripped).toEqual(map);
  });

  it("has five spawn regions in squad-index order 0..4", () => {
    const map = buildSimpleMap();
    for (let i = 0; i < map.spawns.length; i = i + 1) {
      expect(map.spawns[i]?.squadIndex).toBe(i);
    }
  });

  it("carries the seed and acceptedAttempt through the fixture", () => {
    const map = buildSimpleMap("abc");
    expect(map.seed).toBe("abc");
    expect(map.acceptedAttempt).toBe(1);
  });
});

describe("map/types / polygonContains", () => {
  const outer: readonly Vec2[] = [
    v(-10, -10),
    v(10, -10),
    v(10, 10),
    v(-10, 10),
  ];

  it("returns true when inner is strictly inside outer", () => {
    const inner: readonly Vec2[] = [
      v(-5, -5),
      v(5, -5),
      v(5, 5),
      v(-5, 5),
    ];
    expect(polygonContains(outer, inner)).toBe(true);
  });

  it("returns true when inner shares outer's boundary", () => {
    const inner: readonly Vec2[] = [
      v(-10, -10),
      v(10, -10),
      v(10, 10),
      v(-10, 10),
    ];
    expect(polygonContains(outer, inner)).toBe(true);
  });

  it("returns false when inner pokes outside", () => {
    const inner: readonly Vec2[] = [
      v(-5, -5),
      v(15, -5),
      v(15, 5),
      v(-5, 5),
    ];
    expect(polygonContains(outer, inner)).toBe(false);
  });

  it("returns false for degenerate polygons", () => {
    expect(polygonContains(outer, [v(0, 0), v(1, 1)])).toBe(false);
    expect(polygonContains([v(0, 0), v(1, 1)], outer)).toBe(false);
  });
});

describe("map/types / validateTraceSchedule", () => {
  it("accepts the simple fixture schedule", () => {
    expect(validateTraceSchedule(simpleBounds, simpleTrace)).toBeNull();
  });

  it("rejects a schedule whose round is not strictly increasing", () => {
    const bad: readonly TraceStep[] = [
      simpleTrace[0]!,
      { ...simpleTrace[1]!, round: simpleTrace[0]!.round },
    ];
    expect(validateTraceSchedule(simpleBounds, bad)).toMatch(/not > previous/);
  });

  it("rejects a schedule whose regions are not nested", () => {
    // Second region larger than the first — nesting broken.
    const bad: readonly TraceStep[] = [
      simpleTrace[0]!,
      {
        round: simpleTrace[1]!.round,
        damage: simpleTrace[1]!.damage,
        safeRegion: [
          v(-14, -14),
          v(14, -14),
          v(14, 14),
          v(-14, 14),
        ],
      },
    ];
    expect(validateTraceSchedule(simpleBounds, bad)).toMatch(/not nested/);
  });

  it("rejects a schedule whose first region escapes bounds", () => {
    const bad: readonly TraceStep[] = [
      {
        round: 4,
        damage: 2,
        safeRegion: [
          v(-30, -30),
          v(30, -30),
          v(30, 30),
          v(-30, 30),
        ],
      },
    ];
    expect(validateTraceSchedule(simpleBounds, bad)).toMatch(/not inside bounds/);
  });
});

describe("map/types / spawnRegionsDisjoint", () => {
  it("accepts the simple fixture's five corner regions", () => {
    expect(spawnRegionsDisjoint(simpleSpawns)).toBe(true);
  });

  it("rejects a configuration where two regions cover the same point", () => {
    const overlapping: SpawnQuintet = [
      simpleSpawns[0],
      simpleSpawns[1],
      {
        squadIndex: 2,
        polygon: [
          v(-14, -14),
          v(-12, -14),
          v(-12, -12),
          v(-14, -12),
        ],
        anchor: v(-13, -13),
      },
      simpleSpawns[3],
      simpleSpawns[4],
    ];
    expect(spawnRegionsDisjoint(overlapping)).toBe(false);
  });
});

describe("map/types / trace overlays terrain — immutability", () => {
  it("frozen fixture retains the same walls after trace inspection", () => {
    const map = buildSimpleMap();
    const wallsBefore = map.walls.slice();
    // Walk the schedule and read every polygon; walls must be untouched.
    for (const step of map.traceSchedule) {
      expect(step.safeRegion.length).toBeGreaterThanOrEqual(3);
    }
    expect(map.walls).toEqual(wallsBefore);
  });
});

describe("map/types / GATE_CHECK_ORDER is stable and complete", () => {
  it("lists the seven canonical ids in a fixed order", () => {
    expect(GATE_CHECK_ORDER).toEqual([
      "CONNECTIVITY",
      "POCKETS",
      "COVER_DISTRIBUTION",
      "SPAWN_FAIRNESS",
      "CHOKEPOINTS",
      "TRACE_SURVIVABILITY",
      "ARCHETYPE_RANGE",
    ]);
  });
});
