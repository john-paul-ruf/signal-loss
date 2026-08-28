/**
 * Playback transport helpers — beat timing and skip. Pure logic so
 * tests can drive the cursor without a real animation frame.
 */

import type { Event } from "../../../engine";

export type SpeedMultiplier = 1 | 2 | 4;

/**
 * Millisecond duration one beat holds on-screen. Uses design.md §5.8's
 * 220ms posture reveal as the canonical unit and scales other kinds
 * relative to that. Speeds beyond 1× shrink linearly.
 */
export function beatDurationMs(event: Event, speed: SpeedMultiplier): number {
  const base = beatBaseMs(event);
  return Math.max(20, Math.floor(base / speed));
}

function beatBaseMs(event: Event): number {
  switch (event.kind) {
    case "DEPLOYMENT_REVEAL":
      return 400;
    case "POOL_REFILL":
      return 120;
    case "MOVED":
      return 320;
    case "HALTED":
      return 200;
    case "POSTURE_REVEAL":
      return 220;
    case "SHOT":
    case "DEFENSE_INFO":
      return 180;
    case "DAMAGE_APPLIED":
      return 200;
    case "DIAL_ADVANCED":
      return 140;
    case "TRACE_DAMAGE":
      return 240;
    case "DESTROYED":
      return 320;
    case "ELIMINATED":
    case "MATCH_COMPLETE":
      return 360;
  }
}
