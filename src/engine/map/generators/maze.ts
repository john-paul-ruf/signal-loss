import { type Fx, type Vec2, fxFromInt } from "../../fx/index";
import type { Rng } from "../../rng/index";
import type { WallSegment } from "../types";
import { param, pushWall, randInt, type GenerationContext } from "./common";

/**
 * Maze: recursive backtracker on a coarse grid of super-cells. Each
 * cell is `cellSize` board units on a side; between-cell walls are
 * emitted for every neighbor pair NOT carved by the backtracker.
 *
 * `cellSize` (default 5): board-unit side of a maze cell.
 * `branchFactor` (default 2): retained in the API for future variance;
 * the current backtracker consumes it via a per-step probability of
 * revisiting a random neighbor rather than the top of the stack.
 */
export function generateMazeWalls(
  ctx: GenerationContext,
  rng: Rng,
): readonly WallSegment[] {
  const cellSize = param(ctx.archetype, "cellSize", 5);
  const branch = param(ctx.archetype, "branchFactor", 2);
  const half = Math.trunc(ctx.halfSize / 1024);
  const cols = Math.max(2, Math.trunc((half * 2) / cellSize));
  const rows = cols;
  // 2D boolean grid of carved edges: horizontalEdge[r][c] = wall between
  // cell (c, r) and (c, r+1); verticalEdge[r][c] = wall between (c, r)
  // and (c+1, r). Start all-walled, carve as we visit.
  const horiz: boolean[][] = [];
  const vert: boolean[][] = [];
  for (let r = 0; r < rows; r = r + 1) {
    const hRow: boolean[] = [];
    const vRow: boolean[] = [];
    for (let c = 0; c < cols; c = c + 1) {
      hRow.push(true);
      vRow.push(true);
    }
    horiz.push(hRow);
    vert.push(vRow);
  }
  const visited: boolean[][] = [];
  for (let r = 0; r < rows; r = r + 1) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c = c + 1) row.push(false);
    visited.push(row);
  }
  const stack: (readonly [number, number])[] = [[0, 0]];
  (visited[0] as boolean[])[0] = true;
  let current = rng;
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top === undefined) break;
    const [c, r] = top;
    const options: (readonly [number, number, "N" | "S" | "E" | "W"])[] = [];
    if (r > 0 && !((visited[r - 1] as boolean[])[c] as boolean)) options.push([c, r - 1, "N"]);
    if (r + 1 < rows && !((visited[r + 1] as boolean[])[c] as boolean)) options.push([c, r + 1, "S"]);
    if (c + 1 < cols && !((visited[r] as boolean[])[c + 1] as boolean)) options.push([c + 1, r, "E"]);
    if (c > 0 && !((visited[r] as boolean[])[c - 1] as boolean)) options.push([c - 1, r, "W"]);
    if (options.length === 0) {
      // If branchFactor > 1, occasionally pop MORE than one — creates
      // dead ends that feel less predictable. Cheap variance knob.
      for (let k = 0; k < branch && stack.length > 0; k = k + 1) {
        stack.pop();
      }
      continue;
    }
    const [pickIdx, next] = randInt(current, 0, options.length - 1);
    current = next;
    const pick = options[pickIdx];
    if (pick === undefined) continue;
    const [nc, nr, dir] = pick;
    // Carve the wall between (c,r) and (nc,nr) by clearing the boundary.
    if (dir === "N") (horiz[nr] as boolean[])[c] = false;       // wall between (c, nr) and (c, nr+1==r)
    else if (dir === "S") (horiz[r] as boolean[])[c] = false;   // wall between (c, r) and (c, r+1==nr)
    else if (dir === "E") (vert[r] as boolean[])[c] = false;    // wall between (c, r) and (c+1==nc, r)
    else if (dir === "W") (vert[r] as boolean[])[nc] = false;   // wall between (nc, r) and (nc+1==c, r)
    (visited[nr] as boolean[])[nc] = true;
    stack.push([nc, nr]);
  }
  // Convert remaining walls into segments. Cell (c, r) has world origin
  // (-half + c*cellSize, -half + r*cellSize).
  const walls: WallSegment[] = [];
  // Horizontal walls: emit only INTERNAL ones (r in [0, rows-2]).
  for (let r = 0; r + 1 < rows; r = r + 1) {
    for (let c = 0; c < cols; c = c + 1) {
      if (!((horiz[r] as boolean[])[c] as boolean)) continue;
      const x0 = -half + c * cellSize;
      const y = -half + (r + 1) * cellSize;
      const a: Vec2 = { x: fxFromInt(x0) as Fx, y: fxFromInt(y) as Fx };
      const b: Vec2 = { x: fxFromInt(x0 + cellSize) as Fx, y: fxFromInt(y) as Fx };
      pushWall(walls, a, b);
    }
  }
  // Vertical walls: emit only INTERNAL ones (c in [0, cols-2]).
  for (let r = 0; r < rows; r = r + 1) {
    for (let c = 0; c + 1 < cols; c = c + 1) {
      if (!((vert[r] as boolean[])[c] as boolean)) continue;
      const x = -half + (c + 1) * cellSize;
      const y0 = -half + r * cellSize;
      const a: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y0) as Fx };
      const b: Vec2 = { x: fxFromInt(x) as Fx, y: fxFromInt(y0 + cellSize) as Fx };
      pushWall(walls, a, b);
    }
  }
  return walls;
}
