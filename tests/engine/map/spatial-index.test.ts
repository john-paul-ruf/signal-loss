import { describe, expect, it } from "vitest";
import { fxFromInt, type Vec2 } from "../../../src/engine/fx/index";
import type { WallSegment } from "../../../src/engine/map/types";
import {
  buildWallIndex,
  hasLineOfSight,
  queryWalls,
  segmentBlocked,
} from "../../../src/engine/map/spatial-index";
import { simpleBoundsAABB, simpleWalls } from "../../fixtures/maps/simple";

function v(unitX: number, unitY: number): Vec2 {
  return { x: fxFromInt(unitX), y: fxFromInt(unitY) };
}

describe("map/spatial-index / buildWallIndex", () => {
  it("indexes the fixture walls without error", () => {
    const idx = buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(4));
    expect(idx.cols).toBeGreaterThan(0);
    expect(idx.rows).toBeGreaterThan(0);
    expect(idx.wallsById.size).toBe(simpleWalls.length);
  });

  it("rejects duplicate wall ids", () => {
    const dupes: readonly WallSegment[] = [
      { id: 0, a: v(-1, -1), b: v(1, 1) },
      { id: 0, a: v(2, 2), b: v(3, 3) },
    ];
    expect(() => buildWallIndex(dupes, simpleBoundsAABB, fxFromInt(4))).toThrow(/duplicate wall id/);
  });

  it("rejects a non-positive cell size", () => {
    expect(() => buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(0))).toThrow(/positive integer/);
  });
});

describe("map/spatial-index / query results are wall-input-order independent", () => {
  it("returns identical sorted-by-id lists for two shufflings", () => {
    const shuffled = [...simpleWalls].reverse();
    const idxA = buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(4));
    const idxB = buildWallIndex(shuffled, simpleBoundsAABB, fxFromInt(4));
    const query = { min: v(-16, -16), max: v(16, 16) };
    const a = queryWalls(idxA, query).map(w => w.id);
    const b = queryWalls(idxB, query).map(w => w.id);
    expect(a).toEqual(b);
    expect(a).toEqual([0, 1, 2, 3]);
  });

  it("returns walls sorted ascending by id even when the query hits several bins", () => {
    const idx = buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(4));
    const query = { min: v(-16, -16), max: v(16, 16) };
    const ids = queryWalls(idx, query).map(w => w.id);
    for (let i = 1; i < ids.length; i = i + 1) {
      expect((ids[i] ?? 0) > (ids[i - 1] ?? 0)).toBe(true);
    }
  });

  it("returns only walls whose AABB touches the query rectangle", () => {
    const idx = buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(4));
    // Query the upper-right quadrant only.
    const query = { min: v(4, 4), max: v(16, 16) };
    const ids = queryWalls(idx, query).map(w => w.id);
    // Wall 3 (id=3) lives at y=6 across x=6..10. Wall 1 (id=1) is x=0, y=-4..4
    // — its AABB max.y === query min.y (touching) which counts. Wall 0 is
    // similarly on the boundary. Wall 2 is far away.
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });

  it("clips a query outside the index bounds to the boundary cells", () => {
    const idx = buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(4));
    const farAway = { min: v(1000, 1000), max: v(1010, 1010) };
    // Legal, returns whatever lives in the clamped cell (nothing in the
    // fixture reaches that corner).
    expect(queryWalls(idx, farAway)).toEqual([]);
  });
});

describe("map/spatial-index / LOS helpers use exact geometry over index candidates", () => {
  const idx = buildWallIndex(simpleWalls, simpleBoundsAABB, fxFromInt(4));

  it("reports blocked when a segment crosses the horizontal wall", () => {
    // Cross wall id 0 which spans (-4,0)→(4,0).
    expect(segmentBlocked(idx, v(0, -2), v(0, 2))).toBe(true);
    expect(hasLineOfSight(idx, v(0, -2), v(0, 2))).toBe(false);
  });

  it("reports clear when a segment passes around every wall", () => {
    // Sight along y=8 from left to right — nothing blocks it.
    expect(segmentBlocked(idx, v(-15, 8), v(-2, 8))).toBe(false);
    expect(hasLineOfSight(idx, v(-15, 8), v(-2, 8))).toBe(true);
  });

  it("treats a shared endpoint as an intersection (closed-segment)", () => {
    // Segment ending exactly on wall id 0's endpoint at (4, 0).
    expect(segmentBlocked(idx, v(10, 10), v(4, 0))).toBe(true);
  });

  it("query independence: LOS result is unchanged by wall-input ordering", () => {
    const reversed = [...simpleWalls].reverse();
    const idxRev = buildWallIndex(reversed, simpleBoundsAABB, fxFromInt(4));
    expect(hasLineOfSight(idxRev, v(0, -2), v(0, 2)))
      .toBe(hasLineOfSight(idx, v(0, -2), v(0, 2)));
    expect(hasLineOfSight(idxRev, v(-15, 8), v(-2, 8)))
      .toBe(hasLineOfSight(idx, v(-15, 8), v(-2, 8)));
  });
});
