import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import {
  param,
  pushWall,
  randInt,
  subsystemStream,
  RNG_LABELS,
  type GenerationContext,
} from "./common";

/**
 * Hazard field: interspersed regular hazards on a coarse grid plus
 * short random cover walls that break sightlines locally. The hazard
 * placements use a dedicated `hazards` RNG stream so cover density
 * adjustments (via the wall stream) do not shift hazard positions.
 *
 * `hazards` (default 12): number of hazard stubs placed by the hazard
 * stream.
 * `cover` (default 6): number of short cover walls placed by the wall
 * stream.
 */
export function generateHazardFieldWalls(
  ctx: GenerationContext,
  wallRng: Rng,
): readonly WallSegment[] {
  const hazardCount = param(ctx.archetype, "hazards", 12);
  const coverCount = param(ctx.archetype, "cover", 6);
  const half = Math.trunc(ctx.halfSize / 1024);
  const walls: WallSegment[] = [];
  // Hazards from the isolated "hazards" stream — order matters for
  // determinism, so we emit hazards first (ids 0..) then cover.
  let hazardRng = subsystemStream(ctx, RNG_LABELS.hazards);
  for (let i = 0; i < hazardCount; i = i + 1) {
    const [x, r1] = randInt(hazardRng, -half + 2, half - 2);
    hazardRng = r1;
    const [y, r2] = randInt(hazardRng, -half + 2, half - 2);
    hazardRng = r2;
    const a: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y) as Fx };
    const b: Vec2 = { x: fxFromInt(x + 1) as Fx, y: fxFromInt(y + 1) as Fx };
    pushWall(walls, a, b);
  }
  // Cover walls from the wall stream.
  let current = wallRng;
  for (let i = 0; i < coverCount; i = i + 1) {
    const [x, r1] = randInt(current, -half + 3, half - 3);
    current = r1;
    const [y, r2] = randInt(current, -half + 3, half - 3);
    current = r2;
    const [orient, r3] = randInt(current, 0, 1);
    current = r3;
    const dx = orient === 0 ? 3 : 0;
    const dy = orient === 0 ? 0 : 3;
    const a: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y) as Fx };
    const b: Vec2 = { x: fxFromInt(x + dx) as Fx, y: fxFromInt(y + dy) as Fx };
    pushWall(walls, a, b);
  }
  return walls;
}
