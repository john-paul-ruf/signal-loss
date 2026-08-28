/**
 * Arithmetic pointer hit-testing (M18, session 08 checkpoint 2).
 *
 * Rule: NO pixel-read hit tests. Every "what's under the pointer?"
 * question is answered by:
 *   1. inverting the camera into world (fx) space
 *   2. computing a squared fx distance against each candidate
 *   3. picking the smallest, tie-broken by stable id
 *
 * This keeps the same code correct under any DPR / zoom / letterbox
 * and — critically — reproducible under headless replay (fx integers
 * are position of record; float pixel positions are a rendering
 * concern only).
 */

import type { ConstructId } from "../../engine";
import type { KnownConstruct } from "../../engine";
import type { Camera } from "./camera";
import { screenToWorldX, screenToWorldY } from "./camera";

/**
 * Return the smallest-index construct within `footprintFx` of the
 * pointer, or null if none. Ordering: by squared distance ASC, then
 * by construct id ASC.
 */
export function pickConstruct(
  cam: Camera,
  constructs: readonly KnownConstruct[],
  screenX: number,
  screenY: number,
  footprintFx: number,
): ConstructId | null {
  const wx = screenToWorldX(cam, screenX);
  const wy = screenToWorldY(cam, screenY);
  const r2 = footprintFx * footprintFx;
  let best: { dist2: number; id: ConstructId } | null = null;
  for (const k of constructs) {
    const kx = k.position.x as number;
    const ky = k.position.y as number;
    const dx = kx - wx;
    const dy = ky - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (best === null || d2 < best.dist2 || (d2 === best.dist2 && (k.base.id as number) < (best.id as number))) {
      best = { dist2: d2, id: k.base.id };
    }
  }
  return best === null ? null : best.id;
}

/**
 * Return the construct id whose `KnownConstruct` position exactly
 * matches the pointer (fx-integer snap). Used by the deployment picker
 * where the pointer is the source of truth for the target grid cell.
 */
export function pickExactConstructAt(
  constructs: readonly KnownConstruct[],
  worldX: number,
  worldY: number,
): ConstructId | null {
  const wx = Math.round(worldX);
  const wy = Math.round(worldY);
  for (const k of constructs) {
    if ((k.position.x as number) === wx && (k.position.y as number) === wy) return k.base.id;
  }
  return null;
}

/**
 * Point-in-polygon (even-odd rule). Reused for spawn-region
 * containment when the deployment mode needs to validate the drop
 * target against the player's spawn zone.
 */
export function pointInPolygonScreen(
  cam: Camera,
  polygon: readonly { x: unknown; y: unknown }[],
  screenX: number,
  screenY: number,
): boolean {
  const wx = screenToWorldX(cam, screenX);
  const wy = screenToWorldY(cam, screenY);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i = i + 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (pi === undefined || pj === undefined) continue;
    const xi = pi.x as number;
    const yi = pi.y as number;
    const xj = pj.x as number;
    const yj = pj.y as number;
    const intersect =
      yi > wy !== yj > wy &&
      wx < ((xj - xi) * (wy - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
