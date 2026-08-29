import type {
  Catalog,
  Event,
  MatchState,
  SquadId,
  Vec2,
} from "../../../engine";
import {
  measurePolyline,
  polylinePointAt,
  publicView,
} from "../../../engine";
import { fxRaw } from "../../../engine/fx/index";
import { buildConstructScene, type ConstructScene } from "../scene";

export interface PlaybackPath {
  readonly walked: readonly Vec2[];
  readonly unwalked: readonly Vec2[];
  readonly label: string | null;
}

export interface PlaybackFrame {
  readonly constructs: readonly ConstructScene[];
  readonly shots: readonly {
    readonly attacker: Vec2;
    readonly target: Vec2;
    readonly called: boolean;
    readonly landed: boolean;
    readonly damage: number;
  }[];
  readonly paths: readonly PlaybackPath[];
  readonly announcements: readonly string[];
  readonly matchComplete: boolean;
}

/** Project presentation facts from a pre-resolution snapshot and event prefix. */
export function projectPlaybackFrame(
  beforeSnapshot: MatchState,
  catalog: Catalog,
  observer: SquadId,
  events: readonly Event[],
  completedCursor: number,
  activeProgress: number,
): PlaybackFrame {
  const base = buildConstructScene(publicView(beforeSnapshot, observer, catalog), catalog);
  const constructs = base.map((scene) => ({ ...scene }));
  const byId = new Map(constructs.map((scene) => [scene.id as number, scene]));
  const shots: PlaybackFrame["shots"][number][] = [];
  const paths: PlaybackPath[] = [];
  const announcements: string[] = [];
  let matchComplete = false;
  const cursor = Math.max(0, Math.min(completedCursor, events.length));

  for (let index = 0; index < cursor; index += 1) {
    const event = events[index];
    if (event !== undefined) applyEvent(event, 1);
  }
  const active = events[cursor];
  if (active !== undefined && activeProgress > 0) {
    applyEvent(active, Math.max(0, Math.min(1, activeProgress)));
  }

  return { constructs, shots, paths, announcements, matchComplete };

  function applyEvent(event: Event, progress: number): void {
    switch (event.kind) {
      case "MOVED": {
        const scene = byId.get(event.constructId as number);
        if (scene === undefined || scene.ghost) return;
        const distance = Math.round(event.pathDistance * progress);
        const position = pointAt(event.plottedPath, distance);
        scene.position = progress >= 1 ? event.stopPosition : position;
        const split = splitPath(event.plottedPath, distance, event.pathDistance);
        paths.push({ walked: split.walked, unwalked: split.unwalked, label: null });
        return;
      }
      case "HALTED": {
        const scene = byId.get(event.constructId as number);
        if (scene === undefined || scene.ghost) return;
        scene.position = event.stopPosition;
        announcements.push(
          `HALT — CONTACT · construct ${event.constructId as number} with ${event.withConstructs.map(Number).join(", ")}`,
        );
        const last = paths.at(-1);
        if (last !== undefined) {
          paths[paths.length - 1] = { ...last, label: "HALT — CONTACT" };
        }
        return;
      }
      case "POSTURE_REVEAL": {
        const scene = byId.get(event.constructId as number);
        if (scene !== undefined) scene.posture = event.posture;
        announcements.push(`construct ${event.constructId as number} posture ${event.posture}`);
        return;
      }
      case "SHOT": {
        const attacker = byId.get(event.attackerId as number);
        const target = byId.get(event.targetId as number);
        if (attacker !== undefined && target !== undefined) {
          shots.push({
            attacker: attacker.position,
            target: target.position,
            called: event.called,
            landed: event.landed,
            damage: event.damage,
          });
        }
        return;
      }
      case "DIAL_ADVANCED": {
        const scene = byId.get(event.constructId as number);
        if (scene !== undefined) scene.dialIndex = Math.min(event.to, scene.dialLength);
        return;
      }
      case "TRACE_DAMAGE": {
        const scene = byId.get(event.constructId as number);
        if (scene !== undefined) {
          scene.dialIndex = Math.min(scene.dialLength, scene.dialIndex + event.damage);
        }
        announcements.push(`construct ${event.constructId as number} trace damage ${event.damage}`);
        return;
      }
      case "DESTROYED": {
        const scene = byId.get(event.constructId as number);
        if (scene !== undefined) scene.destroyed = true;
        announcements.push(`construct ${event.constructId as number} destroyed`);
        return;
      }
      case "ELIMINATED":
        announcements.push(`squad ${event.squadId as number} eliminated`);
        return;
      case "MATCH_COMPLETE":
        matchComplete = true;
        announcements.push("MATCH COMPLETE");
        return;
      case "DEFENSE_INFO":
        announcements.push(`defense ${event.reason}`);
        return;
      case "DEPLOYMENT_REVEAL":
      case "POOL_REFILL":
      case "DAMAGE_APPLIED":
        return;
    }
  }
}

function pointAt(path: readonly Vec2[], distance: number): Vec2 {
  if (path.length === 0) return { x: fxRaw(0), y: fxRaw(0) };
  const measure = measurePolyline({ vertices: path });
  return polylinePointAt({ vertices: path }, measure, fxRaw(distance));
}

function splitPath(
  path: readonly Vec2[],
  distance: number,
  walkedLimit: number,
): { readonly walked: readonly Vec2[]; readonly unwalked: readonly Vec2[] } {
  if (path.length < 2) return { walked: path, unwalked: [] };
  const point = pointAt(path, Math.min(distance, walkedLimit));
  const measure = measurePolyline({ vertices: path });
  let segment = 0;
  while (segment + 1 < measure.cumulativeLengths.length &&
    (measure.cumulativeLengths[segment + 1] as number) < Math.min(distance, walkedLimit)) {
    segment += 1;
  }
  return {
    walked: [...path.slice(0, segment + 1), point],
    unwalked: [point, ...path.slice(segment + 1)],
  };
}
