import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import { param, pushWall, randInt, type GenerationContext } from "./common";

/**
 * Long avenues: horizontal wall segments spaced by `avenueWidth` board
 * units, each broken into two halves by a randomly-placed gap. The
 * resulting board is corridor-shaped — long uninterrupted sightlines
 * along y-lines, short traversal distance across x.
 *
 * `avenueWidth` (default 8): board-unit vertical spacing between wall
 * lines.
 */
export function generateLongAvenuesWalls(
  ctx: GenerationContext,
  rng: Rng,
): readonly WallSegment[] {
  const avenueWidth = param(ctx.archetype, "avenueWidth", 8);
  const half = Math.trunc(ctx.halfSize / 1024);
  const walls: WallSegment[] = [];
  let current = rng;
  for (let y = -half + avenueWidth; y <= half - avenueWidth; y = y + avenueWidth) {
    // Gap width is roughly 20% of the board; centered at a random x.
    const gapHalf = Math.max(1, Math.trunc((half * 2) / 10));
    const [gapCenterOffset, r1] = randInt(current, -half + gapHalf, half - gapHalf);
    current = r1;
    const leftA: Vec2 = { x: fxFromInt(-half) as Fx, y: fxFromInt(y) as Fx };
    const leftB: Vec2 = { x: fxFromInt(gapCenterOffset - gapHalf) as Fx, y: fxFromInt(y) as Fx };
    const rightA: Vec2 = { x: fxFromInt(gapCenterOffset + gapHalf) as Fx, y: fxFromInt(y) as Fx };
    const rightB: Vec2 = { x: fxFromInt(half) as Fx, y: fxFromInt(y) as Fx };
    pushWall(walls, leftA, leftB);
    pushWall(walls, rightA, rightB);
  }
  return walls;
}
