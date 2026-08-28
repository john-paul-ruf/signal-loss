/**
 * Board scene (M18, session 08 checkpoint 2).
 *
 * A pure function that lays out drawable primitives from a
 * `PublicState` + camera. Layer renderers consume this to draw canvas
 * geometry; no renderer imports engine state directly.
 *
 * Separating layout from painting lets the accessible tree consume
 * the same primitives to render focusable DOM equivalents.
 */

import type {
  Catalog,
  ConstructId,
  Event,
  KnownConstruct,
  PublicState,
  SquadId,
  Vec2,
  WallSegment,
} from "../../engine";
import {
  currentDialStateOf,
  effectiveAttackRangeOf,
  effectiveDialLengthOf,
  effectiveDamageOf,
} from "../../engine";
import type { Camera } from "./camera";
import { worldToScreenX, worldToScreenY, worldDistanceOnScreen } from "./camera";

/* ------------------------------------------------------------------------- */
/* Layer primitives                                                           */
/* ------------------------------------------------------------------------- */

export interface TerrainScene {
  readonly walls: readonly WallSegment[];
  readonly bounds: readonly Vec2[];
  readonly spawnRegions: readonly {
    readonly squadIndex: number;
    readonly polygon: readonly Vec2[];
  }[];
  readonly traceStep: {
    readonly index: number;
    readonly safeRegion: readonly Vec2[];
    readonly damage: number;
    readonly round: number;
  } | null;
  readonly nextTraceStep: {
    readonly index: number;
    readonly safeRegion: readonly Vec2[];
    readonly round: number;
  } | null;
}

export interface ConstructScene {
  readonly id: ConstructId;
  readonly squadId: SquadId;
  readonly position: Vec2;
  readonly footprintFx: number;
  readonly dialIndex: number;
  readonly dialLength: number;
  readonly damage: number;
  readonly rangeFx: number;
  readonly isCommander: boolean;
  readonly destroyed: boolean;
  /** True iff this construct is a ghost (unconfirmed position). */
  readonly ghost: boolean;
  readonly driftFx: number;
  readonly lastSeenRound: number;
}

export interface OverlayScene {
  readonly selectionRing: {
    readonly cid: ConstructId;
    readonly position: Vec2;
    readonly footprintFx: number;
    readonly reachFx: number;
  } | null;
  readonly hoveredWaypoint: Vec2 | null;
  readonly path: readonly Vec2[]; // draft path for the selected construct
  readonly pathLengthFx: number;
  readonly allowanceFx: number;
  readonly overAllowance: boolean;
  readonly shots: readonly {
    readonly attacker: Vec2;
    readonly target: Vec2;
    readonly called: boolean;
    readonly landed: boolean;
    readonly damage: number;
  }[];
}

/**
 * A whole scene assembled from state + camera + interaction context.
 * Layer renderers consume the sub-scenes independently so a pointer-
 * only overlay change does not touch the terrain layer.
 */
export interface BoardScene {
  readonly camera: Camera;
  readonly terrain: TerrainScene;
  readonly constructs: readonly ConstructScene[];
}

/* ------------------------------------------------------------------------- */
/* Terrain scene                                                              */
/* ------------------------------------------------------------------------- */

export function buildTerrainScene(pv: PublicState, round: number): TerrainScene {
  const spawn = pv.map.spawns.map((s) => ({
    squadIndex: s.squadIndex as number,
    polygon: s.polygon,
  }));
  const schedule = pv.map.traceSchedule;
  let activeIndex = -1;
  for (let i = 0; i < schedule.length; i = i + 1) {
    const step = schedule[i];
    if (step === undefined) continue;
    if (round >= step.round) activeIndex = i;
    else break;
  }
  const active = activeIndex >= 0 ? schedule[activeIndex] : undefined;
  const next =
    activeIndex + 1 < schedule.length ? schedule[activeIndex + 1] : undefined;
  return {
    walls: pv.map.walls,
    bounds: pv.map.bounds,
    spawnRegions: spawn,
    traceStep:
      active !== undefined
        ? {
            index: activeIndex,
            safeRegion: active.safeRegion,
            damage: active.damage,
            round: active.round,
          }
        : null,
    nextTraceStep:
      next !== undefined && activeIndex >= 0
        ? { index: activeIndex + 1, safeRegion: next.safeRegion, round: next.round }
        : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Field scene (constructs)                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Build one ConstructScene per known construct. Ghosts read stale
 * positions from `knownPositions`; own constructs read fresh
 * positions from PublicState directly.
 */
export function buildConstructScene(
  pv: PublicState,
  catalog: Catalog,
): readonly ConstructScene[] {
  const scenes: ConstructScene[] = [];
  for (const known of pv.constructs) {
    const chassis = catalog.indexes.chassisByCode.get(known.base.chassisCode);
    if (chassis === undefined) continue;
    const isOwn = (known.base.squadId as number) === (pv.observer as number);
    const ghost = !isOwn && !known.confirmed;
    scenes.push({
      id: known.base.id,
      squadId: known.base.squadId,
      position: known.position,
      footprintFx: chassis.footprint as number,
      dialIndex: known.base.dialIndex,
      dialLength: effectiveDialLengthOf(known, catalog),
      damage: effectiveDamageOf(known, catalog),
      rangeFx: effectiveAttackRangeOf(known, catalog) as number,
      isCommander: known.base.commanderCode !== null,
      destroyed: known.base.destroyed,
      ghost,
      driftFx: known.driftRadius as number,
      lastSeenRound: known.confirmedRound,
    });
  }
  scenes.sort((a, b) => (a.id as number) - (b.id as number));
  return scenes;
}

/* ------------------------------------------------------------------------- */
/* Assemble                                                                   */
/* ------------------------------------------------------------------------- */

export function buildBoardScene(
  pv: PublicState,
  catalog: Catalog,
  camera: Camera,
): BoardScene {
  return {
    camera,
    terrain: buildTerrainScene(pv, pv.round),
    constructs: buildConstructScene(pv, catalog),
  };
}

/* ------------------------------------------------------------------------- */
/* Playback derivatives                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Extract shot lines from an Event[] window (0..cursor). Used by
 * playback overlay renderers so a shot pulses in the moment its SHOT
 * event is visible.
 */
export function extractShotLines(
  events: readonly Event[],
  constructScenes: readonly ConstructScene[],
): OverlayScene["shots"] {
  const byId = new Map<number, ConstructScene>();
  for (const c of constructScenes) byId.set(c.id as number, c);
  const shots: OverlayScene["shots"][number][] = [];
  for (const e of events) {
    if (e.kind !== "SHOT") continue;
    const attacker = byId.get(e.attackerId as number);
    const target = byId.get(e.targetId as number);
    if (attacker === undefined || target === undefined) continue;
    shots.push({
      attacker: attacker.position,
      target: target.position,
      called: e.called,
      landed: e.landed,
      damage: e.damage,
    });
  }
  return shots;
}

/**
 * Rangefinder helper — labels a segment with its fx length in mono
 * digits (design.md §2.1 measuring rule). Returned as a screen-pixel
 * midpoint + label so the overlay renderer can draw it inline.
 */
export function measureLabel(
  cam: Camera,
  a: Vec2,
  b: Vec2,
): { readonly midX: number; readonly midY: number; readonly lengthFx: number; readonly screenLenPx: number } {
  const midX = (worldToScreenX(cam, a.x) + worldToScreenX(cam, b.x)) / 2;
  const midY = (worldToScreenY(cam, a.y) + worldToScreenY(cam, b.y)) / 2;
  const dx = (b.x as number) - (a.x as number);
  const dy = (b.y as number) - (a.y as number);
  const lengthFx = Math.round(Math.sqrt(dx * dx + dy * dy));
  const screenLenPx = worldDistanceOnScreen(cam, a, b);
  return { midX, midY, lengthFx, screenLenPx };
}

/**
 * Helper used by inspector tests — read a construct's damage without
 * dragging the whole scene assembly in.
 */
export function readDamageFrom(known: KnownConstruct, catalog: Catalog): number {
  const dial = currentDialStateOf(known, catalog);
  if (dial === undefined) return 0;
  return effectiveDamageOf(known, catalog);
}
