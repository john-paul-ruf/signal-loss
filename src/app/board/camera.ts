/**
 * Camera transform (M18, session 08 checkpoint 2).
 *
 * One transform is shared across the three canvases (terrain, field,
 * overlay) so a redraw on any layer uses the same worldToScreen /
 * screenToWorld — no per-layer drift, no per-marker DOM positioning.
 *
 * The transform is orthographic and axis-aligned. World coordinates
 * are fx integers (Vec2). Screen coordinates are floats in CSS pixels.
 * Rule-affecting computations stay in fx via `hit-test.ts`; only
 * rendering uses the float projection.
 */

import type { Fx, Vec2 } from "../../engine";

/** Axis-aligned bounding box in world (fx) coordinates. */
export interface WorldBounds {
  readonly min: Vec2;
  readonly max: Vec2;
}

/** Screen viewport in CSS pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

/**
 * The linear camera. `scale` is the number of CSS pixels a single fx
 * unit occupies. `originX` / `originY` are the screen-space offset of
 * the world origin. Camera translation is derived from bounds + viewport
 * at construction; there is no interactive pan or zoom in v1.
 */
export interface Camera {
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  readonly viewport: Viewport;
  readonly bounds: WorldBounds;
}

/**
 * Fit the world bounds into the viewport with a uniform scale (letter-
 * box on the larger axis). Adds a small pixel margin so wireframe walls
 * against the world boundary do not sit exactly on the canvas edge.
 */
export function fitCamera(
  bounds: WorldBounds,
  viewport: Viewport,
  paddingPx: number = 12,
): Camera {
  const worldW = (bounds.max.x as number) - (bounds.min.x as number);
  const worldH = (bounds.max.y as number) - (bounds.min.y as number);
  if (worldW <= 0 || worldH <= 0) {
    return {
      scale: 1,
      originX: viewport.width / 2,
      originY: viewport.height / 2,
      viewport,
      bounds,
    };
  }
  const availW = Math.max(1, viewport.width - paddingPx * 2);
  const availH = Math.max(1, viewport.height - paddingPx * 2);
  const scale = Math.min(availW / worldW, availH / worldH);
  const centerX = ((bounds.min.x as number) + (bounds.max.x as number)) / 2;
  const centerY = ((bounds.min.y as number) + (bounds.max.y as number)) / 2;
  const originX = viewport.width / 2 - centerX * scale;
  const originY = viewport.height / 2 - centerY * scale;
  return { scale, originX, originY, viewport, bounds };
}

/**
 * World → screen coordinates. Y is NOT flipped — world Y increases
 * downward on screen. This keeps our numeric distance readouts aligned
 * with the mocks (design.md §5.5, X/Y ledgers).
 */
export function worldToScreenX(cam: Camera, x: Fx): number {
  return cam.originX + (x as number) * cam.scale;
}
export function worldToScreenY(cam: Camera, y: Fx): number {
  return cam.originY + (y as number) * cam.scale;
}

/**
 * Screen → world coordinates. Rule paths should NOT use this directly
 * for legality decisions — snap to the nearest fx integer via
 * `snapPointerToFx` first so we never leak float slop into the plot.
 */
export function screenToWorldX(cam: Camera, px: number): number {
  return (px - cam.originX) / cam.scale;
}
export function screenToWorldY(cam: Camera, py: number): number {
  return (py - cam.originY) / cam.scale;
}

/**
 * Round a screen pointer position back to the nearest integer fx.
 * Ensures every plotted waypoint carries a plain integer coordinate,
 * so hashState remains stable across replays even if the pointer path
 * is subtly different pixel-to-pixel.
 */
export function snapPointerToFx(cam: Camera, screenX: number, screenY: number): Vec2 {
  const wx = screenToWorldX(cam, screenX);
  const wy = screenToWorldY(cam, screenY);
  return {
    x: Math.round(wx) as Fx,
    y: Math.round(wy) as Fx,
  };
}

/**
 * Compute the AABB of a map's bounds polygon. Convenient for building
 * the initial camera.
 */
export function boundsAabb(polygon: readonly Vec2[]): WorldBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const v of polygon) {
    const x = v.x as number;
    const y = v.y as number;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    min: { x: minX as Fx, y: minY as Fx },
    max: { x: maxX as Fx, y: maxY as Fx },
  };
}

/** Screen distance in CSS pixels between two world points. */
export function worldDistanceOnScreen(cam: Camera, a: Vec2, b: Vec2): number {
  const dx = ((b.x as number) - (a.x as number)) * cam.scale;
  const dy = ((b.y as number) - (a.y as number)) * cam.scale;
  return Math.sqrt(dx * dx + dy * dy);
}
