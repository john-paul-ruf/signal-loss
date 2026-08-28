/**
 * Overlay layer — pointer-driven: selection ring, draft path, reach
 * envelopes, shot lines during playback, measuring rules. Redraws
 * every pointer event / frame — must be cheap.
 */

import type { Camera } from "../camera";
import { worldToScreenX, worldToScreenY, worldDistanceOnScreen } from "../camera";
import type { OverlayScene } from "../scene";

export function paintOverlay(
  ctx: CanvasRenderingContext2D,
  scene: OverlayScene,
  cam: Camera,
): void {
  ctx.save();
  ctx.clearRect(0, 0, cam.viewport.width, cam.viewport.height);

  // Selection ring + reach envelope (fx radius → screen pixels).
  if (scene.selectionRing !== null) {
    const cx = worldToScreenX(cam, scene.selectionRing.position.x);
    const cy = worldToScreenY(cam, scene.selectionRing.position.y);
    const rPx = Math.max(6, scene.selectionRing.footprintFx * cam.scale);
    const reachPx = Math.max(rPx, scene.selectionRing.reachFx * cam.scale);
    ctx.strokeStyle = "#4DE1FF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(77,225,255,0.3)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, reachPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draft path — solid up to allowance, dashed warn past.
  if (scene.path.length >= 2) {
    ctx.beginPath();
    for (let i = 0; i < scene.path.length; i = i + 1) {
      const p = scene.path[i];
      if (p === undefined) continue;
      const sx = worldToScreenX(cam, p.x);
      const sy = worldToScreenY(cam, p.y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    if (scene.overAllowance) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#FFB43C";
    } else {
      ctx.strokeStyle = "#4DE1FF";
    }
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    // Waypoint dots.
    ctx.fillStyle = "#4DE1FF";
    for (const p of scene.path) {
      ctx.beginPath();
      ctx.arc(worldToScreenX(cam, p.x), worldToScreenY(cam, p.y), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Length label at the last point.
    const last = scene.path[scene.path.length - 1];
    if (last !== undefined) {
      ctx.font = "10px monospace";
      ctx.fillStyle = scene.overAllowance ? "#FFB43C" : "#E8F2FB";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(
        `${scene.pathLengthFx} / ${scene.allowanceFx}`,
        worldToScreenX(cam, last.x) + 6,
        worldToScreenY(cam, last.y) + 6,
      );
    }
  }

  // Hovered waypoint dot.
  if (scene.hoveredWaypoint !== null) {
    const sx = worldToScreenX(cam, scene.hoveredWaypoint.x);
    const sy = worldToScreenY(cam, scene.hoveredWaypoint.y);
    ctx.strokeStyle = "rgba(77,225,255,0.7)";
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Shot lines.
  for (const shot of scene.shots) {
    const ax = worldToScreenX(cam, shot.attacker.x);
    const ay = worldToScreenY(cam, shot.attacker.y);
    const bx = worldToScreenX(cam, shot.target.x);
    const by = worldToScreenY(cam, shot.target.y);
    ctx.strokeStyle = shot.landed ? "#4BE8A4" : "rgba(155,180,196,0.4)";
    ctx.lineWidth = shot.called ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (shot.called && shot.landed) {
      // Draw a » ligature at the midpoint (design.md §2.3).
      ctx.font = "12px monospace";
      ctx.fillStyle = "#4BE8A4";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("»", (ax + bx) / 2, (ay + by) / 2);
    }
    // Damage number near the target.
    ctx.font = "10px monospace";
    ctx.fillStyle = shot.landed ? "#E8F2FB" : "#9CB0C4";
    ctx.fillText(
      shot.landed ? `${shot.damage}` : "0",
      bx,
      by - 12,
    );
    void worldDistanceOnScreen;
  }

  ctx.restore();
}
