import { describe, expect, it } from "vitest";
import { fxFromInt, type Vec2 } from "../../../src/engine/fx/index";
import type { WallSegment } from "../../../src/engine/map/types";
import {
  buildAnalysisGrid,
  cellIndexFor,
  labelRegions,
  largestRegion,
  passableCount,
  passageWidthAt,
  quadrantForCell,
  reachableCount,
  defaultCellSize,
} from "../../../src/engine/map/analysis-grid";

function v(unitX: number, unitY: number): Vec2 {
  return { x: fxFromInt(unitX), y: fxFromInt(unitY) };
}

const bounds: readonly Vec2[] = [
  v(-8, -8),
  v(8, -8),
  v(8, 8),
  v(-8, 8),
];

describe("map/analysis-grid / buildAnalysisGrid", () => {
  it("returns an empty (all-passable) grid when there are no walls", () => {
    const g = buildAnalysisGrid(bounds, [], fxFromInt(2));
    expect(g.cols).toBe(8);
    expect(g.rows).toBe(8);
    expect(g.blocked.every(v => v === 0)).toBe(true);
    expect(passableCount(g)).toBe(64);
  });

  it("marks cells touched by a wall's AABB", () => {
    const walls: readonly WallSegment[] = [
      { id: 0, a: v(-2, 0), b: v(2, 0) },
    ];
    const g = buildAnalysisGrid(bounds, walls, fxFromInt(2));
    // Wall spans y=0 (row 4 boundary) x in [-2, 2] (cols 3..5).
    // Under our AABB rasterization, the row containing y=0 is marked.
    let blockedRow4 = 0;
    for (let c = 3; c <= 5; c = c + 1) {
      if (g.blocked[4 * g.cols + c] === 1) blockedRow4 = blockedRow4 + 1;
    }
    expect(blockedRow4).toBeGreaterThan(0);
  });

  it("rejects a non-positive cell size", () => {
    expect(() => buildAnalysisGrid(bounds, [], fxFromInt(0))).toThrow(/positive integer/);
  });

  it("is wall-input-order independent", () => {
    const walls: readonly WallSegment[] = [
      { id: 0, a: v(-2, 0), b: v(2, 0) },
      { id: 1, a: v(0, -2), b: v(0, 2) },
    ];
    const gA = buildAnalysisGrid(bounds, walls, fxFromInt(2));
    const gB = buildAnalysisGrid(bounds, [...walls].reverse(), fxFromInt(2));
    expect(gA.blocked).toEqual(gB.blocked);
  });
});

describe("map/analysis-grid / labelRegions", () => {
  it("returns a single region on an all-passable grid", () => {
    const g = buildAnalysisGrid(bounds, [], fxFromInt(2));
    const regions = labelRegions(g);
    expect(regions.length).toBe(1);
    expect(regions[0]?.area).toBe(64);
  });

  it("splits the grid along a full wall into two components", () => {
    const walls: readonly WallSegment[] = [
      { id: 0, a: v(-8, 0), b: v(8, 0) },
    ];
    const g = buildAnalysisGrid(bounds, walls, fxFromInt(2));
    const regions = labelRegions(g);
    expect(regions.length).toBe(2);
    // Descending by area then ascending by first cell.
    const [big, small] = regions;
    expect(big).toBeDefined();
    expect(small).toBeDefined();
    if (big !== undefined && small !== undefined) {
      expect(big.area).toBeGreaterThanOrEqual(small.area);
    }
  });

  it("largestRegion returns the biggest by area", () => {
    const g = buildAnalysisGrid(bounds, [], fxFromInt(2));
    const largest = largestRegion(labelRegions(g));
    expect(largest?.area).toBe(64);
  });
});

describe("map/analysis-grid / cellIndexFor", () => {
  const g = buildAnalysisGrid(bounds, [], fxFromInt(2));

  it("returns the correct cell for the origin", () => {
    const idx = cellIndexFor(g, v(0, 0));
    expect(idx).not.toBeNull();
    if (idx === null) return;
    // origin = (0, 0) with cellSize=2 units → col 4, row 4 in an 8×8 grid.
    expect(idx).toBe(4 * g.cols + 4);
  });

  it("returns null for a point outside the grid", () => {
    expect(cellIndexFor(g, v(100, 100))).toBeNull();
  });
});

describe("map/analysis-grid / reachableCount", () => {
  it("counts every passable cell on an unblocked grid", () => {
    const g = buildAnalysisGrid(bounds, [], fxFromInt(2));
    const empty = new Uint8Array(g.blocked.length);
    expect(reachableCount(g, 0, empty)).toBe(64);
  });

  it("honours the blockedOverride mask", () => {
    const g = buildAnalysisGrid(bounds, [], fxFromInt(2));
    const mask = new Uint8Array(g.blocked.length);
    // Block the entire second column.
    for (let r = 0; r < g.rows; r = r + 1) mask[r * g.cols + 1] = 1;
    // Starting from column 0 we can only reach column 0 (8 cells).
    expect(reachableCount(g, 0, mask)).toBe(8);
  });
});

describe("map/analysis-grid / passageWidthAt", () => {
  it("returns wide values on an unobstructed grid", () => {
    const g = buildAnalysisGrid(bounds, [], fxFromInt(2));
    const widths = passageWidthAt(g, 4 * g.cols + 4);
    expect(widths.horizontal).toBe(g.cols);
    expect(widths.vertical).toBe(g.rows);
  });

  it("narrows around a full horizontal wall", () => {
    const walls: readonly WallSegment[] = [
      { id: 0, a: v(-8, 0), b: v(8, 0) },
    ];
    const g = buildAnalysisGrid(bounds, walls, fxFromInt(2));
    // A cell just above the wall has bounded vertical width.
    const above = 5 * g.cols + 4;
    const widths = passageWidthAt(g, above);
    expect(widths.vertical).toBeLessThan(g.rows);
  });
});

describe("map/analysis-grid / quadrantForCell", () => {
  const g = buildAnalysisGrid(bounds, [], fxFromInt(2));

  it("classifies four corners into their expected quadrants", () => {
    expect(quadrantForCell(g, 0)).toBe(0); // BL
    expect(quadrantForCell(g, g.cols - 1)).toBe(1); // BR
    expect(quadrantForCell(g, (g.rows - 1) * g.cols + (g.cols - 1))).toBe(2); // TR
    expect(quadrantForCell(g, (g.rows - 1) * g.cols)).toBe(3); // TL
  });
});

describe("map/analysis-grid / defaultCellSize", () => {
  it("returns half of the given footprint", () => {
    expect(defaultCellSize(fxFromInt(2))).toBe(fxFromInt(1));
  });

  it("returns the input footprint if halving would zero out", () => {
    expect(defaultCellSize(1 as never)).toBe(1 as never);
  });
});
