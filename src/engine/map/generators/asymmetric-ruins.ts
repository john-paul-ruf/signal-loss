import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import { param, pushWall, randInt, type GenerationContext } from "./common";

/**
 * Asymmetric ruins: clustered short walls biased toward one half of
 * the board. Produces visibly-lopsided cover distribution — the
 * playability gate's quadrant test guards against ruins skewed too
 * far to be fair.
 *
 * `skew` (default 2): bias factor. `skew=1` is uniform, higher values
 * concentrate more cover on the `+x` side of the map.
 * `clusters` (default 6): number of ruin clusters.
 * `wallsPerCluster` (default 4): short walls per cluster.
 */
export function generateAsymmetricRuinsWalls(
  ctx: GenerationContext,
  rng: Rng,
): readonly WallSegment[] {
  const skew = param(ctx.archetype, "skew", 2);
  const clusters = param(ctx.archetype, "clusters", 6);
  const perCluster = param(ctx.archetype, "wallsPerCluster", 4);
  const half = Math.trunc(ctx.halfSize / 1024);
  const walls: WallSegment[] = [];
  let current = rng;
  for (let ci = 0; ci < clusters; ci = ci + 1) {
    // Cluster center: x biased toward +half by `skew` (higher = more +x).
    // Draw two candidates, take the larger for skew factor. Reserve a
    // 5-unit safety margin so `center ± 2 offset ± 2 wall extent` stays
    // inside bounds without a post-clamp step.
    let bestX = 0;
    for (let s = 0; s < skew; s = s + 1) {
      const [candidate, next] = randInt(current, -half + 5, half - 5);
      current = next;
      if (s === 0 || candidate > bestX) bestX = candidate;
    }
    const [cy, next2] = randInt(current, -half + 5, half - 5);
    current = next2;
    // Emit walls near (bestX, cy) in a small 4×4 cluster area.
    for (let w = 0; w < perCluster; w = w + 1) {
      const [ox, r1] = randInt(current, -2, 2);
      current = r1;
      const [oy, r2] = randInt(current, -2, 2);
      current = r2;
      const [orient, r3] = randInt(current, 0, 1);
      current = r3;
      const dx = orient === 0 ? 2 : 0;
      const dy = orient === 0 ? 0 : 2;
      const wx = bestX + ox;
      const wy = cy + oy;
      const a: Vec2 = { x: fxFromInt(wx) as Fx, y: fxFromInt(wy) as Fx };
      const b: Vec2 = { x: fxFromInt(wx + dx) as Fx, y: fxFromInt(wy + dy) as Fx };
      pushWall(walls, a, b);
    }
  }
  return walls;
}
