import type { Fx, Vec2 } from "../fx/index";
import type { TraceStep } from "./types";
import { validateTraceSchedule } from "./types";

/**
 * Deterministic construction of the trace schedule (FR-20).
 *
 * The schedule is a sequence of nested shrinking axis-aligned rectangles
 * anchored on a `center` point. Each subsequent rectangle is strictly
 * inside the previous by an integer step; the last rectangle is capped by
 * `minHalfExtent` so it never collapses to a degenerate polygon.
 *
 * The schedule is pure geometry — it does not touch walls, spawns, or any
 * other map field (AD-1: trace overlays immutable terrain).
 *
 * Damage escalates as `traceBase + traceStep × i` for step `i ≥ 0`,
 * matching the mocks' 2 · 4 · 6 · 8 · 10 sequence at the default tunables.
 */

export interface TraceScheduleInput {
  readonly boundsMin: Vec2;
  readonly boundsMax: Vec2;
  readonly center: Vec2;
  readonly firstRound: number;
  readonly interval: number;
  readonly maxRound: number;
  readonly traceBase: number;
  readonly traceStep: number;
  /** Shrink per contraction, applied symmetrically on each axis. Fx units. */
  readonly shrinkPerStep: Fx;
  /** Minimum half-extent (fx) below which no further step is emitted. */
  readonly minHalfExtent: Fx;
}

/**
 * Build the trace schedule. Returns an array of `TraceStep` sorted by
 * round; the array is empty when the first contraction is past `maxRound`
 * or when the initial safe region cannot fit `minHalfExtent`.
 *
 * Validation runs at the end — malformed schedules throw. This is a
 * generation-time invariant; the gate never sees a broken schedule.
 */
export function buildTraceSchedule(input: TraceScheduleInput): readonly TraceStep[] {
  const {
    boundsMin,
    boundsMax,
    center,
    firstRound,
    interval,
    maxRound,
    traceBase,
    traceStep,
    shrinkPerStep,
    minHalfExtent,
  } = input;
  if (interval < 1) {
    throw new RangeError(`buildTraceSchedule: interval must be ≥ 1; got ${interval}.`);
  }
  if (firstRound < 1) {
    throw new RangeError(`buildTraceSchedule: firstRound must be ≥ 1; got ${firstRound}.`);
  }
  const shrink = shrinkPerStep as number;
  const minHalf = minHalfExtent as number;
  if (shrink <= 0 || minHalf <= 0) {
    throw new RangeError("buildTraceSchedule: shrinkPerStep and minHalfExtent must be > 0.");
  }
  const bMinX = boundsMin.x as number;
  const bMinY = boundsMin.y as number;
  const bMaxX = boundsMax.x as number;
  const bMaxY = boundsMax.y as number;
  const cx = center.x as number;
  const cy = center.y as number;
  const halfInit = Math.min(
    cx - bMinX,
    bMaxX - cx,
    cy - bMinY,
    bMaxY - cy,
  );
  if (halfInit < minHalf) {
    return [];
  }
  const steps: TraceStep[] = [];
  let round = firstRound;
  let half = halfInit - shrink;
  let idx = 0;
  while (round <= maxRound && half >= minHalf) {
    const rectMinX = cx - half;
    const rectMinY = cy - half;
    const rectMaxX = cx + half;
    const rectMaxY = cy + half;
    const polygon: readonly Vec2[] = [
      { x: rectMinX as Fx, y: rectMinY as Fx },
      { x: rectMaxX as Fx, y: rectMinY as Fx },
      { x: rectMaxX as Fx, y: rectMaxY as Fx },
      { x: rectMinX as Fx, y: rectMaxY as Fx },
    ];
    steps.push({
      round,
      safeRegion: polygon,
      damage: traceBase + traceStep * idx,
    });
    round = round + interval;
    half = half - shrink;
    idx = idx + 1;
  }
  const bounds: readonly Vec2[] = [
    { x: bMinX as Fx, y: bMinY as Fx },
    { x: bMaxX as Fx, y: bMinY as Fx },
    { x: bMaxX as Fx, y: bMaxY as Fx },
    { x: bMinX as Fx, y: bMaxY as Fx },
  ];
  const err = validateTraceSchedule(bounds, steps);
  if (err !== null) {
    throw new Error(`buildTraceSchedule: internal invariant broken: ${err}`);
  }
  return steps;
}
