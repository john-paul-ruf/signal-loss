import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import { param, pushWall, randInt, type GenerationContext } from "./common";

/**
 * Dense grid: a regular lattice of horizontal and vertical wall segments
 * on `spacing`-board-unit intervals, with per-cell RNG-controlled gaps
 * so the grid stays connected.
 *
 * `spacing` (default 6): board-unit distance between grid lines.
 * Each grid intersection contributes at most one horizontal and one
 * vertical segment; roughly 1/3 are omitted (RNG-driven) to open paths.
 */
export function generateDenseGridWalls(
  ctx: GenerationContext,
  rng: Rng,
): readonly WallSegment[] {
  const spacing = param(ctx.archetype, "spacing", 6);
  const half = Math.trunc(ctx.halfSize / 1024);
  const walls: WallSegment[] = [];
  const step = spacing;
  let current = rng;
  // Interior grid — leave a one-cell margin around the edges.
  for (let x = -half + step; x <= half - step; x = x + step) {
    for (let y = -half + step; y <= half - step; y = y + step) {
      const [horizRoll, r1] = randInt(current, 0, 2);
      current = r1;
      const [vertRoll, r2] = randInt(current, 0, 2);
      current = r2;
      if (horizRoll !== 0) {
        const a: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y) as Fx };
        const b: Vec2 = { x: fxFromInt(x + step) as Fx, y: fxFromInt(y) as Fx };
        pushWall(walls, a, b);
      }
      if (vertRoll !== 0) {
        const a: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y) as Fx };
        const b: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y + step) as Fx };
        pushWall(walls, a, b);
      }
    }
  }
  return walls;
}
