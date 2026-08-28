import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import { param, pushWall, randInt, type GenerationContext } from "./common";

/**
 * Arena: an open central area ringed by a broken perimeter of walls
 * plus a few short central obstacles. Sightlines from the center are
 * long; sightlines from behind a rim wall are short.
 *
 * `rimInset` (default 3): board-unit distance from the outer bounds
 * at which the perimeter walls are placed.
 * `centralObstacles` (default 4): number of short interior walls.
 */
export function generateArenaWalls(
  ctx: GenerationContext,
  rng: Rng,
): readonly WallSegment[] {
  const rimInset = param(ctx.archetype, "rimInset", 3);
  const central = param(ctx.archetype, "centralObstacles", 4);
  const half = Math.trunc(ctx.halfSize / 1024);
  const walls: WallSegment[] = [];
  // Rim walls — four sides with a central gap on each so the arena is
  // not enclosed.
  const rim = half - rimInset;
  const gapHalf = Math.max(1, Math.trunc(rim / 4));
  // Bottom
  pushWall(walls,
    { x: fxFromInt(-rim) as Fx, y: fxFromInt(-rim) as Fx },
    { x: fxFromInt(-gapHalf) as Fx, y: fxFromInt(-rim) as Fx });
  pushWall(walls,
    { x: fxFromInt(gapHalf) as Fx, y: fxFromInt(-rim) as Fx },
    { x: fxFromInt(rim) as Fx, y: fxFromInt(-rim) as Fx });
  // Top
  pushWall(walls,
    { x: fxFromInt(-rim) as Fx, y: fxFromInt(rim) as Fx },
    { x: fxFromInt(-gapHalf) as Fx, y: fxFromInt(rim) as Fx });
  pushWall(walls,
    { x: fxFromInt(gapHalf) as Fx, y: fxFromInt(rim) as Fx },
    { x: fxFromInt(rim) as Fx, y: fxFromInt(rim) as Fx });
  // Left
  pushWall(walls,
    { x: fxFromInt(-rim) as Fx, y: fxFromInt(-rim) as Fx },
    { x: fxFromInt(-rim) as Fx, y: fxFromInt(-gapHalf) as Fx });
  pushWall(walls,
    { x: fxFromInt(-rim) as Fx, y: fxFromInt(gapHalf) as Fx },
    { x: fxFromInt(-rim) as Fx, y: fxFromInt(rim) as Fx });
  // Right
  pushWall(walls,
    { x: fxFromInt(rim) as Fx, y: fxFromInt(-rim) as Fx },
    { x: fxFromInt(rim) as Fx, y: fxFromInt(-gapHalf) as Fx });
  pushWall(walls,
    { x: fxFromInt(rim) as Fx, y: fxFromInt(gapHalf) as Fx },
    { x: fxFromInt(rim) as Fx, y: fxFromInt(rim) as Fx });
  // Central obstacles — short 2-unit stubs at random positions.
  let current = rng;
  for (let i = 0; i < central; i = i + 1) {
    const [x, r1] = randInt(current, -rim + 2, rim - 2);
    current = r1;
    const [y, r2] = randInt(current, -rim + 2, rim - 2);
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
