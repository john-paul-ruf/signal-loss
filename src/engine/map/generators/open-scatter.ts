import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import { param, pushWall, randInt, type GenerationContext } from "./common";

/**
 * Open scatter: sparse random short segments scattered around the map,
 * with a large open middle. Each segment is a randomly-oriented
 * 2-unit stub — enough cover for footprint-scale hides, but not enough
 * to break sightlines across most of the board.
 *
 * `scatter` (default 3): density factor. Segment count ≈ scatter × (half²/12).
 */
export function generateOpenScatterWalls(
  ctx: GenerationContext,
  rng: Rng,
): readonly WallSegment[] {
  const density = param(ctx.archetype, "scatter", 3);
  const half = Math.trunc(ctx.halfSize / 1024);
  const walls: WallSegment[] = [];
  const count = Math.max(4, Math.trunc((density * half * half) / 12));
  let current = rng;
  for (let i = 0; i < count; i = i + 1) {
    const [x, r1] = randInt(current, -half + 2, half - 2);
    current = r1;
    const [y, r2] = randInt(current, -half + 2, half - 2);
    current = r2;
    const [orient, r3] = randInt(current, 0, 1);
    current = r3;
    const dx = orient === 0 ? 2 : 0;
    const dy = orient === 0 ? 0 : 2;
    const a: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y) as Fx };
    const b: Vec2 = { x: fxFromInt(x + dx) as Fx, y: fxFromInt(y + dy) as Fx };
    pushWall(walls, a, b);
  }
  return walls;
}
