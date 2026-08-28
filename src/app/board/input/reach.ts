/**
 * Reach envelope construction — the outline of everywhere a construct
 * can legally end this round (design.md §5.6). Computed from PUBLIC
 * stats only: chassis footprint + current dial's movement allowance.
 * The engine's `legalMovePlot` is still the source of truth at commit
 * time; the envelope is a visual aid so the player doesn't have to
 * probe with clicks.
 */

import type { Catalog, Fx, MatchConstruct, Vec2 } from "../../../engine";
import { currentDialState } from "../../../engine";

/**
 * Approximate reach: sample an N-vertex polygon around the origin
 * position at the allowance radius. Walls are NOT respected here — the
 * envelope is an outer bound; the engine refuses wall-crossing paths.
 */
export function reachOutlineOf(
  construct: MatchConstruct,
  catalog: Catalog,
  sides: number = 24,
): readonly Vec2[] {
  const dial = currentDialState(construct, catalog);
  if (dial === undefined) return [];
  const radius = dial.movementAllowance as number;
  if (radius <= 0) return [];
  const cx = construct.position.x as number;
  const cy = construct.position.y as number;
  const out: Vec2[] = [];
  // Deterministic — no clocks; a fixed-angle sample loop. `sides` must
  // be > 2. Uses a small trig table so we avoid Math.sin/cos in the
  // engine (this file lives under ./src/app so the ban does not apply).
  for (let i = 0; i < sides; i = i + 1) {
    const t = (i / sides) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * radius);
    const y = Math.round(cy + Math.sin(t) * radius);
    out.push({ x: x as Fx, y: y as Fx });
  }
  return out;
}
