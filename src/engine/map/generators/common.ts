import {
  type Fx,
  type Vec2,
  FX_ONE,
  fxFromInt,
} from "../../fx/index";
import type { Rng } from "../../rng/index";
import { rngFromSeed, stream, nextRange } from "../../rng/index";
import type { MapArchetype, Tunables } from "../../catalog/index";
import type {
  SpawnQuintet,
  SpawnRegion,
  TraceStep,
  WallSegment,
} from "../types";
import { buildTraceSchedule } from "../trace";

/**
 * Shared generation-time state. The RNG streams a generator draws from
 * are derived by label ("walls", "hazards", "spawns", "trace",
 * "cosmetic"); one subsystem never observes another's draw count, so
 * changing wall generation does not shift spawn placement.
 */
export interface GenerationContext {
  readonly seed: string;
  readonly archetype: MapArchetype;
  readonly tunables: Tunables;
  readonly bounds: readonly Vec2[];
  readonly boundsMin: Vec2;
  readonly boundsMax: Vec2;
  readonly halfSize: number;
  readonly rootRng: Rng;
}

/** The union of geometry every archetype produces. */
export interface GeneratedGeometry {
  readonly walls: readonly WallSegment[];
  readonly spawns: SpawnQuintet;
  readonly traceSchedule: readonly TraceStep[];
}

/** Named RNG stream labels — stable, exported for tests. */
export const RNG_LABELS = {
  walls: "walls",
  hazards: "hazards",
  spawns: "spawns",
  trace: "trace",
  cosmetic: "cosmetic",
} as const;

/**
 * Build the generation context from a seed, archetype, and tunables.
 * The play area is an axis-aligned square centered on the origin with
 * side length `tunables.BOARD_SIZE`.
 */
export function buildGenerationContext(
  seed: string,
  archetype: MapArchetype,
  tunables: Tunables,
): GenerationContext {
  const board = tunables.BOARD_SIZE as number;
  if (!Number.isInteger(board) || board <= 0) {
    throw new RangeError(`buildGenerationContext: BOARD_SIZE must be a positive integer; got ${board}.`);
  }
  const halfSize = Math.trunc(board / 2);
  const boundsMin: Vec2 = { x: (-halfSize) as Fx, y: (-halfSize) as Fx };
  const boundsMax: Vec2 = { x: halfSize as Fx, y: halfSize as Fx };
  const bounds: readonly Vec2[] = [
    boundsMin,
    { x: halfSize as Fx, y: (-halfSize) as Fx },
    boundsMax,
    { x: (-halfSize) as Fx, y: halfSize as Fx },
  ];
  return {
    seed,
    archetype,
    tunables,
    bounds,
    boundsMin,
    boundsMax,
    halfSize,
    rootRng: rngFromSeed(seed),
  };
}

/**
 * Standard five-region spawn placement — one region in each of the four
 * corners plus one on the mid-top edge. Regions are 4×4 board-unit
 * squares placed inside the bounds with a fixed inset.
 *
 * The RNG parameter is retained for symmetry (matches the other
 * subsystem builders); the current placement is entirely deterministic
 * from bounds, but keeping the argument means a future variant can add
 * jitter without changing this file's callers.
 */
export function placeStandardSpawns(
  ctx: GenerationContext,
  _rng: Rng,
): SpawnQuintet {
  const inset = Math.trunc(ctx.halfSize / 8);
  const regionHalf = Math.trunc(inset / 2);
  const cx = ctx.halfSize - inset;
  const cy = ctx.halfSize - inset;
  const regions: SpawnRegion[] = [];
  const centers: readonly (readonly [number, number])[] = [
    [-cx, -cy],
    [cx, -cy],
    [cx, cy],
    [-cx, cy],
    [0, cy],
  ];
  for (let i = 0; i < 5; i = i + 1) {
    const c = centers[i];
    if (c === undefined) continue;
    const [x, y] = c;
    const polygon: readonly Vec2[] = [
      { x: (x - regionHalf) as Fx, y: (y - regionHalf) as Fx },
      { x: (x + regionHalf) as Fx, y: (y - regionHalf) as Fx },
      { x: (x + regionHalf) as Fx, y: (y + regionHalf) as Fx },
      { x: (x - regionHalf) as Fx, y: (y + regionHalf) as Fx },
    ];
    regions.push({
      squadIndex: i as 0 | 1 | 2 | 3 | 4,
      polygon,
      anchor: { x: x as Fx, y: y as Fx },
    });
  }
  return [
    regions[0] as SpawnRegion,
    regions[1] as SpawnRegion,
    regions[2] as SpawnRegion,
    regions[3] as SpawnRegion,
    regions[4] as SpawnRegion,
  ];
}

/**
 * Standard trace schedule — shrinking axis-aligned squares centered on
 * the board center. Shrink and min-half-extent are derived from the
 * board size so the schedule scales with the play area.
 */
export function buildStandardTrace(
  ctx: GenerationContext,
  _rng: Rng,
): readonly TraceStep[] {
  const t = ctx.tunables;
  // Total contractions available: shrink until minHalfExtent reached.
  // shrinkPerStep = halfSize / 10, minHalfExtent = halfSize / 6.
  const shrinkUnits = Math.max(1, Math.trunc(ctx.halfSize / 10 / FX_ONE));
  const minUnits = Math.max(1, Math.trunc(ctx.halfSize / 6 / FX_ONE));
  return buildTraceSchedule({
    boundsMin: ctx.boundsMin,
    boundsMax: ctx.boundsMax,
    center: { x: 0 as Fx, y: 0 as Fx },
    firstRound: t.TRACE_FIRST_ROUND,
    interval: t.TRACE_INTERVAL,
    maxRound: t.MAX_EXPECTED_ROUNDS,
    traceBase: t.TRACE_BASE,
    traceStep: t.TRACE_STEP,
    shrinkPerStep: fxFromInt(shrinkUnits),
    minHalfExtent: fxFromInt(minUnits),
  });
}

/**
 * Convenience wrapper — derive a named subsystem RNG stream from the
 * generation context.
 */
export function subsystemStream(ctx: GenerationContext, label: string): Rng {
  return stream(ctx.rootRng, label);
}

/**
 * Draw a random integer in [lo, hi] (inclusive) from `rng`. Returns the
 * value and the successor RNG. Wraps `nextRange`'s half-open [lo, hi+1)
 * contract so archetype code reads naturally.
 */
export function randInt(rng: Rng, lo: number, hi: number): readonly [number, Rng] {
  return nextRange(rng, lo, hi + 1);
}

/**
 * Extract a positive integer parameter from `archetype.parameters` with
 * a stable fallback. Fallbacks exist so a partially-authored archetype
 * still generates a valid map — the fallback is documented per generator.
 */
export function param(
  archetype: MapArchetype,
  key: string,
  fallback: number,
): number {
  const raw = archetype.parameters[key];
  if (raw === undefined) return fallback;
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) return fallback;
  return raw;
}

/**
 * Emit a wall segment with the next available id. The `id` counter is
 * threaded explicitly so generators never rely on Array.push side effects
 * to obtain a stable id.
 */
export function pushWall(
  walls: WallSegment[],
  a: Vec2,
  b: Vec2,
): void {
  const id = walls.length;
  walls.push({ id, a, b });
}
