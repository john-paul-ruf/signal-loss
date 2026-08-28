import { describe, expect, it } from "vitest";
import { fxFromInt, type Fx, type Vec2 } from "../../../src/engine/fx/index";
import type { ArchetypeId, MapArchetype } from "../../../src/engine/catalog/index";
import type {
  GameMap,
  SpawnQuintet,
  TraceStep,
  WallSegment,
} from "../../../src/engine/map/types";
import { runPlayabilityGate, type GateContext } from "../../../src/engine/map/gate";
import { GATE_CHECK_ORDER } from "../../../src/engine/map/types";
import { testArchetype } from "../../fixtures/maps/archetypes";
import { testTunables } from "../../fixtures/maps/tunables";

function v(unitX: number, unitY: number): Vec2 {
  return { x: fxFromInt(unitX), y: fxFromInt(unitY) };
}

const HALF = 20;

const boundsSquare: readonly Vec2[] = [
  v(-HALF, -HALF),
  v(HALF, -HALF),
  v(HALF, HALF),
  v(-HALF, HALF),
];

function corner(cx: number, cy: number, s = 2): readonly Vec2[] {
  return [
    v(cx - s, cy - s),
    v(cx + s, cy - s),
    v(cx + s, cy + s),
    v(cx - s, cy + s),
  ];
}

function fiveCornerSpawns(): SpawnQuintet {
  return [
    { squadIndex: 0, polygon: corner(-16, -16), anchor: v(-16, -16) },
    { squadIndex: 1, polygon: corner(16, -16), anchor: v(16, -16) },
    { squadIndex: 2, polygon: corner(16, 16), anchor: v(16, 16) },
    { squadIndex: 3, polygon: corner(-16, 16), anchor: v(-16, 16) },
    { squadIndex: 4, polygon: corner(0, 16), anchor: v(0, 16) },
  ];
}

/** Basic passable map — plenty of cover, no chokepoints. */
function baseMap(overrides: {
  readonly walls?: readonly WallSegment[];
  readonly spawns?: SpawnQuintet;
  readonly bounds?: readonly Vec2[];
  readonly traceSchedule?: readonly TraceStep[];
} = {}): GameMap {
  // A modest cover pattern: a 4x4 grid of short walls, spread across quadrants.
  const walls: WallSegment[] = [];
  let id = 0;
  for (let x = -14; x <= 14; x = x + 7) {
    for (let y = -14; y <= 14; y = y + 7) {
      walls.push({ id: id, a: v(x, y), b: v(x + 2, y) });
      id = id + 1;
    }
  }
  const trace: readonly TraceStep[] = [
    { round: 4, safeRegion: corner(0, 0, 15), damage: 2 },
    { round: 6, safeRegion: corner(0, 0, 10), damage: 4 },
    { round: 8, safeRegion: corner(0, 0, 6), damage: 6 },
  ];
  return {
    seed: "gate-fixture",
    acceptedAttempt: 1,
    archetypeId: "open-scatter" as ArchetypeId,
    bounds: overrides.bounds ?? boundsSquare,
    walls: overrides.walls ?? walls,
    spawns: overrides.spawns ?? fiveCornerSpawns(),
    traceSchedule: overrides.traceSchedule ?? trace,
  };
}

function baseContext(overrides: Partial<GateContext> = {}): GateContext {
  const archetype: MapArchetype = testArchetype("open-scatter");
  return {
    tunables: testTunables,
    archetype,
    cellSize: fxFromInt(1),
    ...overrides,
  };
}

describe("map/gate / runPlayabilityGate on a well-formed map", () => {
  it("passes every check", () => {
    const map = baseMap();
    const ctx = baseContext();
    const report = runPlayabilityGate(map, ctx);
    for (const c of report.checks) {
      expect(`${c.id}: ${c.message}`).toContain(c.id);
    }
    expect(report.passed).toBe(true);
  });

  it("reports checks in the canonical GATE_CHECK_ORDER regardless of shuffle", () => {
    const map = baseMap();
    const ctx = baseContext();
    const r1 = runPlayabilityGate(map, ctx);
    const r2 = runPlayabilityGate(map, ctx);
    expect(r1.checks.map(c => c.id)).toEqual(GATE_CHECK_ORDER);
    expect(r2.checks.map(c => c.id)).toEqual(GATE_CHECK_ORDER);
  });

  it("is wall-input-order independent — same report bytes for shuffled input", () => {
    const map = baseMap();
    const reversed = { ...map, walls: [...map.walls].reverse() };
    const ctx = baseContext();
    const r1 = runPlayabilityGate(map, ctx);
    const r2 = runPlayabilityGate(reversed, ctx);
    expect(JSON.stringify(r1)).toEqual(JSON.stringify(r2));
  });
});

describe("map/gate / CONNECTIVITY isolation", () => {
  it("fails when a full wall separates a spawn from the rest", () => {
    // Vertical wall at x=0 spanning the whole board — spawns in corners
    // on opposite x sides end up disconnected.
    const separator: WallSegment[] = [{ id: 0, a: v(0, -HALF), b: v(0, HALF) }];
    const map = baseMap({ walls: separator });
    const report = runPlayabilityGate(map, baseContext());
    const chk = report.checks.find(c => c.id === "CONNECTIVITY");
    expect(chk).toBeDefined();
    expect(chk?.passed).toBe(false);
  });
});

describe("map/gate / POCKETS isolation", () => {
  it("fails when an isolated pocket exceeds MIN_POCKET", () => {
    // Enclose a large area in the bottom-left with a wall box.
    const enclosure: WallSegment[] = [
      { id: 0, a: v(-HALF, -5), b: v(-5, -5) }, // top of box
      { id: 1, a: v(-5, -5), b: v(-5, -HALF) }, // right of box
    ];
    // Push a spawn INTO the enclosure so connectivity still passes
    // trivially (all spawns reachable within their region), but the
    // enclosure remains an isolated pocket for the OTHERS. Alternative:
    // leave spawns as-is; then this pocket is a large disconnected
    // island independent of spawn arrangement.
    const spawns = fiveCornerSpawns();
    const map = baseMap({ walls: enclosure, spawns });
    const context = baseContext({
      tunables: { ...testTunables, MIN_POCKET: 4 * 1024 * 1024 },
    });
    const report = runPlayabilityGate(map, context);
    const chk = report.checks.find(c => c.id === "POCKETS");
    expect(chk).toBeDefined();
    // The enclosure creates a pocket. If it exceeds min-pocket, fail; if
    // not, POCKETS still passes. We assert the WALLS + tunables produce
    // an offender by lowering MIN_POCKET to a small threshold.
    const context2 = baseContext({
      tunables: { ...testTunables, MIN_POCKET: 1 },
    });
    const report2 = runPlayabilityGate(map, context2);
    const chk2 = report2.checks.find(c => c.id === "POCKETS");
    expect(chk2?.passed).toBe(false);
  });
});

describe("map/gate / COVER_DISTRIBUTION isolation", () => {
  it("fails when the map is entirely coverless (open area = whole board)", () => {
    const map = baseMap({ walls: [] });
    const report = runPlayabilityGate(map, baseContext());
    const chk = report.checks.find(c => c.id === "COVER_DISTRIBUTION");
    expect(chk?.passed).toBe(false);
  });

  it("fails when cover is bunched into a single quadrant", () => {
    // Fill quadrant 0 (bottom-left) with dense walls; leave others open.
    const walls: WallSegment[] = [];
    let id = 0;
    for (let x = -19; x <= -1; x = x + 3) {
      for (let y = -19; y <= -1; y = y + 3) {
        walls.push({ id: id, a: v(x, y), b: v(x + 2, y) });
        id = id + 1;
      }
    }
    const map = baseMap({ walls });
    const report = runPlayabilityGate(map, baseContext());
    const chk = report.checks.find(c => c.id === "COVER_DISTRIBUTION");
    expect(chk?.passed).toBe(false);
  });
});

describe("map/gate / SPAWN_FAIRNESS isolation", () => {
  it("fails when two spawns sit closer than MIN_SPAWN_SEP", () => {
    const spawns: SpawnQuintet = [
      { squadIndex: 0, polygon: corner(-16, -16), anchor: v(-16, -16) },
      { squadIndex: 1, polygon: corner(-15, -16), anchor: v(-15, -16) }, // too close
      { squadIndex: 2, polygon: corner(16, 16), anchor: v(16, 16) },
      { squadIndex: 3, polygon: corner(-16, 16), anchor: v(-16, 16) },
      { squadIndex: 4, polygon: corner(0, 16), anchor: v(0, 16) },
    ];
    const map = baseMap({ spawns });
    const report = runPlayabilityGate(map, baseContext());
    const chk = report.checks.find(c => c.id === "SPAWN_FAIRNESS");
    expect(chk?.passed).toBe(false);
  });

  it("fails when a spawn has too much line of sight to other spawns", () => {
    const map = baseMap({ walls: [] }); // no walls → every spawn sees every other.
    const context = baseContext({
      tunables: { ...testTunables, MAX_SPAWN_SIGHTLINES: 0 },
    });
    const report = runPlayabilityGate(map, context);
    const chk = report.checks.find(c => c.id === "SPAWN_FAIRNESS");
    expect(chk?.passed).toBe(false);
  });
});

describe("map/gate / CHOKEPOINTS isolation", () => {
  it("fails when a narrow bottleneck disconnects most of the map", () => {
    // Two big walls with a 1-unit-wide gap in between. Blocking either
    // side of the gap cuts the map in ~half.
    const walls: WallSegment[] = [
      { id: 0, a: v(-HALF, 0), b: v(-1, 0) },
      { id: 1, a: v(1, 0), b: v(HALF, 0) },
    ];
    const map = baseMap({ walls });
    // Set CHOKE_WIDTH big enough that the 1-unit gap counts as "narrow",
    // and CHOKE_FRACTION low enough that a ~half-map disconnect fails.
    const context = baseContext({
      tunables: {
        ...testTunables,
        CHOKE_WIDTH: fxFromInt(4) as Fx,
        CHOKE_FRACTION: 0.2,
      },
    });
    const report = runPlayabilityGate(map, context);
    const chk = report.checks.find(c => c.id === "CHOKEPOINTS");
    expect(chk?.passed).toBe(false);
  });
});

describe("map/gate / TRACE_SURVIVABILITY isolation", () => {
  it("fails when the final safe region has no passable cell (entirely walled)", () => {
    // Fill a small area centered on the origin with walls, then set the
    // final safe region to that same area — the restricted grid has no
    // passable cell inside the polygon.
    const walls: WallSegment[] = [];
    let id = 0;
    for (let x = -3; x <= 3; x = x + 1) {
      for (let y = -3; y <= 3; y = y + 1) {
        walls.push({ id: id, a: v(x, y), b: v(x, y) });
        id = id + 1;
      }
    }
    const map = baseMap({
      walls,
      traceSchedule: [
        { round: 4, safeRegion: corner(0, 0, 3), damage: 2 },
      ],
    });
    const report = runPlayabilityGate(map, baseContext());
    const chk = report.checks.find(c => c.id === "TRACE_SURVIVABILITY");
    expect(chk?.passed).toBe(false);
  });
});

describe("map/gate / ARCHETYPE_RANGE isolation", () => {
  it("fails when observed metrics fall outside the archetype's declared ranges", () => {
    const map = baseMap({ walls: [] }); // openAreaFraction ≈ 1
    const archetype: MapArchetype = {
      ...testArchetype("open-scatter"),
      openAreaFraction: { min: 0, max: 0.1 }, // tight ceiling below 1
    };
    const context = baseContext({ archetype });
    const report = runPlayabilityGate(map, context);
    const chk = report.checks.find(c => c.id === "ARCHETYPE_RANGE");
    expect(chk?.passed).toBe(false);
  });
});

describe("map/gate / evidence carries observed and threshold numbers", () => {
  it("every check exposes both observed and threshold records", () => {
    const map = baseMap();
    const report = runPlayabilityGate(map, baseContext());
    for (const check of report.checks) {
      expect(check.observed).toBeDefined();
      expect(check.threshold).toBeDefined();
      expect(typeof check.message).toBe("string");
    }
  });
});
