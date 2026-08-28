/**
 * Simple hand-authored map fixture used across engine/map tests. Values
 * satisfy the map type invariants (immutable trace, disjoint spawns,
 * bounds contain all spawns) but are NOT authored release content —
 * Session 06 owns the release archetypes and their tuning.
 *
 * Board is a 32 × 32 board-unit square centered on the origin — small
 * enough that its wall lists are easy to reason about in a test.
 */

import type { Fx, Vec2 } from "../../../src/engine/fx/index";
import { fxFromInt } from "../../../src/engine/fx/index";
import type { ArchetypeId } from "../../../src/engine/catalog/index";
import type {
  GameMap,
  SpawnQuintet,
  TraceStep,
  WallSegment,
} from "../../../src/engine/map/types";

function fxUnit(unit: number): Fx {
  return fxFromInt(unit);
}

function v(unitX: number, unitY: number): Vec2 {
  return { x: fxUnit(unitX), y: fxUnit(unitY) };
}

const HALF = 16;

/** Bounds: a 32×32 axis-aligned square centered on the origin. */
export const simpleBounds: readonly Vec2[] = [
  v(-HALF, -HALF),
  v(HALF, -HALF),
  v(HALF, HALF),
  v(-HALF, HALF),
];

/**
 * Four internal walls, ids 0..3. Together they form a cross-shape in the
 * middle of the board with gaps at the ends so no region is enclosed —
 * useful for LOS and connectivity assertions.
 */
export const simpleWalls: readonly WallSegment[] = [
  { id: 0, a: v(-4, 0), b: v(4, 0) },
  { id: 1, a: v(0, -4), b: v(0, 4) },
  { id: 2, a: v(-10, -6), b: v(-6, -6) },
  { id: 3, a: v(6, 6), b: v(10, 6) },
];

/**
 * Five 4×4 spawn regions, one in each corner and one on the middle of
 * the top edge. They are non-overlapping and each fits inside `bounds`.
 */
function boxRegion(centerX: number, centerY: number, halfSize = 2): readonly Vec2[] {
  return [
    v(centerX - halfSize, centerY - halfSize),
    v(centerX + halfSize, centerY - halfSize),
    v(centerX + halfSize, centerY + halfSize),
    v(centerX - halfSize, centerY + halfSize),
  ];
}

export const simpleSpawns: SpawnQuintet = [
  { squadIndex: 0, polygon: boxRegion(-13, -13), anchor: v(-13, -13) },
  { squadIndex: 1, polygon: boxRegion(13, -13), anchor: v(13, -13) },
  { squadIndex: 2, polygon: boxRegion(13, 13), anchor: v(13, 13) },
  { squadIndex: 3, polygon: boxRegion(-13, 13), anchor: v(-13, 13) },
  { squadIndex: 4, polygon: boxRegion(0, 13), anchor: v(0, 13) },
];

/**
 * Three nested squares centered on the origin — a valid schedule
 * (monotone-shrinking, ascending rounds, contained in bounds).
 */
export const simpleTrace: readonly TraceStep[] = [
  { round: 4, safeRegion: boxRegion(0, 0, 12), damage: 2 },
  { round: 6, safeRegion: boxRegion(0, 0, 8), damage: 4 },
  { round: 8, safeRegion: boxRegion(0, 0, 4), damage: 6 },
];

export function buildSimpleMap(
  seed = "simple",
  archetypeId = "arena" as ArchetypeId,
): GameMap {
  return {
    seed,
    acceptedAttempt: 1,
    archetypeId,
    bounds: simpleBounds,
    walls: simpleWalls,
    spawns: simpleSpawns,
    traceSchedule: simpleTrace,
  };
}

/** Bounding AABB corresponding to `simpleBounds`. Handy for index tests. */
export const simpleBoundsAABB = {
  min: v(-HALF, -HALF),
  max: v(HALF, HALF),
};
