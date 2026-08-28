/**
 * Terrain layer — bounds, walls, spawn regions, trace hatches.
 * Redraws ONLY when the map or the trace-step index changes.
 */

import type { Fx } from "../../../engine";
import type { Camera } from "../camera";
import { worldToScreenX, worldToScreenY } from "../camera";
import type { TerrainScene } from "../scene";

/**
 * Paint the terrain scene onto a 2D canvas context. All strokes are
 * 1px + faint glow — walls are topology, not architecture
 * (design.md §2.1).
 */
export function paintTerrain(
  ctx: CanvasRenderingContext2D,
  scene: TerrainScene,
  cam: Camera,
): void {
  ctx.save();
  ctx.clearRect(0, 0, cam.viewport.width, cam.viewport.height);

  // Grid ticks — every 10 fx units.
  ctx.strokeStyle = "rgba(28,39,51,0.5)";
  ctx.lineWidth = 1;
  drawGridTicks(ctx, cam);

  // Bounds polygon.
  ctx.strokeStyle = "#2A3946";
  ctx.lineWidth = 1;
  drawPolygon(ctx, scene.bounds, cam);
  ctx.stroke();

  // Spawn regions.
  ctx.strokeStyle = "rgba(155,180,196,0.3)";
  ctx.setLineDash([4, 4]);
  for (const region of scene.spawnRegions) {
    drawPolygon(ctx, region.polygon, cam);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Trace safe region — hatched fill.
  if (scene.traceStep !== null) {
    drawPolygon(ctx, scene.traceStep.safeRegion, cam);
    ctx.strokeStyle = "#FF3B6B";
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (scene.nextTraceStep !== null) {
    drawPolygon(ctx, scene.nextTraceStep.safeRegion, cam);
    ctx.strokeStyle = "rgba(255,59,107,0.4)";
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Walls.
  ctx.strokeStyle = "#2A3946";
  ctx.lineWidth = 1;
  for (const wall of scene.walls) {
    ctx.beginPath();
    ctx.moveTo(worldToScreenX(cam, wall.a.x), worldToScreenY(cam, wall.a.y));
    ctx.lineTo(worldToScreenX(cam, wall.b.x), worldToScreenY(cam, wall.b.y));
    ctx.stroke();
  }

  ctx.restore();
}

function drawGridTicks(ctx: CanvasRenderingContext2D, cam: Camera): void {
  const step = 10;
  ctx.beginPath();
  const worldMinX = (cam.bounds.min.x as number);
  const worldMaxX = (cam.bounds.max.x as number);
  const worldMinY = (cam.bounds.min.y as number);
  const worldMaxY = (cam.bounds.max.y as number);
  const startX = Math.ceil(worldMinX / step) * step;
  const startY = Math.ceil(worldMinY / step) * step;
  for (let x = startX; x <= worldMaxX; x = x + step) {
    const sx = cam.originX + x * cam.scale;
    ctx.moveTo(sx, cam.originY + worldMinY * cam.scale);
    ctx.lineTo(sx, cam.originY + worldMaxY * cam.scale);
  }
  for (let y = startY; y <= worldMaxY; y = y + step) {
    const sy = cam.originY + y * cam.scale;
    ctx.moveTo(cam.originX + worldMinX * cam.scale, sy);
    ctx.lineTo(cam.originX + worldMaxX * cam.scale, sy);
  }
  ctx.stroke();
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: readonly { x: unknown; y: unknown }[],
  cam: Camera,
): void {
  ctx.beginPath();
  for (let i = 0; i < polygon.length; i = i + 1) {
    const p = polygon[i];
    if (p === undefined) continue;
    const sx = worldToScreenX(cam, p.x as Fx);
    const sy = worldToScreenY(cam, p.y as Fx);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
}
