/**
 * Field layer — construct markers, dial pips, commander rings, ghost
 * marks, wrecks. Redraws when engine state changes or during playback
 * animation frames.
 */

import type { Camera } from "../camera";
import { worldToScreenX, worldToScreenY } from "../camera";
import type { ConstructScene } from "../scene";
import { visualFor, highContrastLightness } from "../squad-visual";

export interface FieldPaintOptions {
  readonly highContrast: boolean;
}

/**
 * Paint every alive + dead construct. Order (design.md §2.2):
 *   1. Drift rings (ghosts)
 *   2. Footprint circles (or wreck cross for destroyed)
 *   3. Squad glyph
 *   4. Dial pips
 *   5. Commander double ring + badge
 */
export function paintField(
  ctx: CanvasRenderingContext2D,
  scenes: readonly ConstructScene[],
  cam: Camera,
  options: FieldPaintOptions,
): void {
  ctx.save();
  ctx.clearRect(0, 0, cam.viewport.width, cam.viewport.height);

  // 1. Drift rings first so they sit behind everything.
  for (const s of scenes) {
    if (!s.ghost || s.driftFx <= 0) continue;
    const cx = worldToScreenX(cam, s.position.x);
    const cy = worldToScreenY(cam, s.position.y);
    const rPx = Math.max(4, s.driftFx * cam.scale);
    ctx.strokeStyle = "rgba(155,180,196,0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 2 + 3 + 4 + 5: paint each construct in a stable pass.
  for (const s of scenes) {
    const visual = visualFor(s.squadId);
    const cx = worldToScreenX(cam, s.position.x);
    const cy = worldToScreenY(cam, s.position.y);
    const rPx = Math.max(6, s.footprintFx * cam.scale);
    const strokeColor = options.highContrast
      ? highContrastLightness(visual)
      : visual.fillHex;

    if (s.destroyed) {
      // Wreck: 45deg cross.
      ctx.strokeStyle = "#FF4D6D";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - rPx * 0.6, cy - rPx * 0.6);
      ctx.lineTo(cx + rPx * 0.6, cy + rPx * 0.6);
      ctx.moveTo(cx + rPx * 0.6, cy - rPx * 0.6);
      ctx.lineTo(cx - rPx * 0.6, cy + rPx * 0.6);
      ctx.stroke();
      continue;
    }

    // Footprint circle.
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = s.ghost ? 0.34 : 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();

    // Squad glyph at the center (canvas fillText is intentional — this is
    // a visual, not a text-rendered semantic label; a11y equivalent is
    // in the accessible tree).
    ctx.fillStyle = strokeColor;
    ctx.font = `${Math.max(10, Math.floor(rPx * 0.8))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(visual.glyph, cx, cy);

    // Dial pips above the marker.
    paintDialPips(
      ctx,
      cx,
      cy - rPx - 6,
      rPx * 2,
      s.dialIndex,
      s.dialLength,
      strokeColor,
    );

    // Commander double ring + badge below.
    if (s.isCommander) {
      ctx.strokeStyle = "#FFB43C";
      ctx.beginPath();
      ctx.arc(cx, cy, rPx + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = "8px monospace";
      ctx.fillStyle = "#FFB43C";
      ctx.fillText("◆CMD", cx, cy + rPx + 10);
    }

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function paintDialPips(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  dialIndex: number,
  dialLength: number,
  color: string,
): void {
  const pips = Math.max(0, dialLength);
  if (pips === 0) return;
  const step = Math.min(6, width / Math.max(pips, 1));
  const startX = cx - ((pips - 1) * step) / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < pips; i = i + 1) {
    ctx.beginPath();
    ctx.arc(startX + i * step, cy, 1.6, 0, Math.PI * 2);
    if (i < dialIndex) ctx.fill();
    else ctx.stroke();
  }
}
