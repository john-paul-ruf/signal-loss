/**
 * Terrain layer — bounds, walls, spawn regions, trace hatches.
 * Redraws ONLY when the map or the trace-step index changes.
 */

import type { Fx } from "../../../engine";
import type { Camera } from "../camera";
import { worldToScreenX, worldToScreenY } from "../camera";
import type { TerrainScene } from "../scene";

/* ------------------------------------------------------------------------- */
/* Grid step (CA-02)                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Smallest on-screen spacing the minor grid may render at, in CSS px.
 * The fitted 65,536-fx board leaves ~18 px between minor lines — dense
 * enough to measure against, sparse enough to stop being fog.
 */
export const MIN_GRID_SPACING_PX = 12;

/** Base minor grid step in world fx units (design.md §2.1). */
export const GRID_BASE_FX = 10;

/** One line in every `MAJOR_EVERY` is emphasized (mock 06 `gridMaj`). */
export const MAJOR_EVERY = 5;

/**
 * Minor grid line spacing in fx for a given camera scale (px per fx).
 * Returns the smallest `GRID_BASE_FX × 2^k` whose screen spacing is at
 * least `MIN_GRID_SPACING_PX`. Pure — headless-tested for CA-02.
 */
export function gridStepForScale(scale: number): number {
  let step = GRID_BASE_FX;
  while (step * scale < MIN_GRID_SPACING_PX) step = step * 2;
  return step;
}

/**
 * True when the world-space grid line at `worldCoord` is a major line
 * for the given minor `step` (CA-02: `worldCoord % (step·MAJOR_EVERY) === 0`).
 * World coords are exact integers, so the modulo is exact.
 */
export function isMajorGridLine(worldCoord: number, step: number): boolean {
  return worldCoord % (step * MAJOR_EVERY) === 0;
}

/**
 * Deployment-only paint options. When present the terrain layer marks the
 * observer's own spawn as the active placement affordance and dims the map
 * outside it, leaving enemy regions as empty outlines (design.md §5.5).
 * The value is render-only — no draft position ever reaches the engine.
 */
export interface TerrainDeploymentOptions {
  readonly humanSquadIndex: number;
}

/**
 * Paint the terrain scene onto a 2D canvas context. All strokes are
 * 1px + faint glow — walls are topology, not architecture
 * (design.md §2.1).
 *
 * When `deployment` is supplied the observer's spawn becomes a solid-edged
 * `YOUR SPAWN` zone, enemy regions stay outlined-but-empty, and everything
 * outside the observer's region is dimmed. Passing `null` reproduces the
 * pre-deployment output byte-for-byte.
 */
export function paintTerrain(
  ctx: CanvasRenderingContext2D,
  scene: TerrainScene,
  cam: Camera,
  deployment: TerrainDeploymentOptions | null = null,
): void {
  ctx.save();
  ctx.clearRect(0, 0, cam.viewport.width, cam.viewport.height);

  // Grid ticks — screen-space adaptive step with major/minor emphasis
  // (CA-02; design.md §2.1, mock 06 `grid` / `gridMaj`).
  drawGridTicks(ctx, cam);

  // Bounds polygon.
  ctx.strokeStyle = "#2A3946";
  ctx.lineWidth = 1;
  drawPolygon(ctx, scene.bounds, cam);
  ctx.stroke();

  const humanRegion =
    deployment === null
      ? null
      : scene.spawnRegions.find(
          (r) => r.squadIndex === deployment.humanSquadIndex,
        ) ?? null;

  // Spawn regions. During deployment the observer's own region is drawn
  // separately as a solid affordance, so the dashed outline pass skips it.
  ctx.strokeStyle = "rgba(155,180,196,0.3)";
  ctx.setLineDash([4, 4]);
  for (const region of scene.spawnRegions) {
    if (deployment !== null && region.squadIndex === deployment.humanSquadIndex) {
      continue;
    }
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

  // Deployment affordance — dim the map outside the observer's region and
  // paint that region as the solid `YOUR SPAWN` target.
  if (humanRegion !== null) {
    paintYourSpawn(ctx, humanRegion.polygon, cam);
  }

  ctx.restore();
}

/**
 * Dim everything outside the observer's spawn polygon, then draw the
 * polygon as a solid `#vector`-edged zone with a `YOUR SPAWN · VECTOR`
 * label. The dim is a translucent scrim punched through by the region, so
 * the overlay canvas and its pointer target are untouched.
 */
function paintYourSpawn(
  ctx: CanvasRenderingContext2D,
  polygon: readonly { x: unknown; y: unknown }[],
  cam: Camera,
): void {
  // Scrim: fill the viewport with dim void, then clear the region.
  ctx.save();
  ctx.fillStyle = "rgba(4,6,10,0.72)";
  ctx.fillRect(0, 0, cam.viewport.width, cam.viewport.height);
  ctx.globalCompositeOperation = "destination-out";
  drawPolygon(ctx, polygon, cam);
  ctx.fill();
  ctx.restore();

  // Solid vector-hued region edge + faint fill.
  drawPolygon(ctx, polygon, cam);
  ctx.fillStyle = "rgba(168,251,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = "#A8FBFF";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Label anchored to the region's top-left corner.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const p of polygon) {
    const sx = worldToScreenX(cam, p.x as Fx);
    const sy = worldToScreenY(cam, p.y as Fx);
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
  }
  ctx.font = "600 11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#A8FBFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("YOUR SPAWN · VECTOR", minX + 2, minY - 4);
}

/**
 * Grid — the player's measuring aid (design.md §2.1, mock 06 `grid` /
 * `gridMaj` patterns). World-snapped lines at a screen-space step: the
 * smallest `GRID_BASE_FX × 2^k` whose on-screen spacing clears
 * `MIN_GRID_SPACING_PX`, so the fitted 65,536-fx board shows ~18 px
 * between minor lines instead of a 0.07 px sub-pixel flood. Every
 * `MAJOR_EVERY`-th line is restroked darker as the major emphasis.
 */
function drawGridTicks(ctx: CanvasRenderingContext2D, cam: Camera): void {
  const step = gridStepForScale(cam.scale);
  const worldMinX = cam.bounds.min.x as number;
  const worldMaxX = cam.bounds.max.x as number;
  const worldMinY = cam.bounds.min.y as number;
  const worldMaxY = cam.bounds.max.y as number;
  const startX = Math.ceil(worldMinX / step) * step;
  const startY = Math.ceil(worldMinY / step) * step;

  // Minor pass — every step line.
  ctx.strokeStyle = "rgba(28,39,51,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
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

  // Major pass — every MAJOR_EVERY-th line restroked at full emphasis.
  ctx.strokeStyle = "rgba(28,39,51,0.9)";
  ctx.beginPath();
  for (let x = startX; x <= worldMaxX; x = x + step) {
    if (!isMajorGridLine(x, step)) continue;
    const sx = cam.originX + x * cam.scale;
    ctx.moveTo(sx, cam.originY + worldMinY * cam.scale);
    ctx.lineTo(sx, cam.originY + worldMaxY * cam.scale);
  }
  for (let y = startY; y <= worldMaxY; y = y + step) {
    if (!isMajorGridLine(y, step)) continue;
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