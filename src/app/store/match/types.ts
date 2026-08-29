/**
 * Types shared across the match-store slices. Kept in one file so
 * consumers can import without pulling the store implementation itself.
 *
 * Every field is a plain value or an id — no engine construct is stored
 * indirectly through a class instance, no live worker handle escapes
 * into store state. The AI-pending map's `requestId` is the ONLY
 * cross-boundary reference held.
 */

import type {
  ConstructId,
  Event,
  ExchangeCard,
  MatchConfigDigest,
  MatchState,
  Placement,
  Posture,
  SquadAttackPlot,
  SquadId,
  SquadMovePlots,
  Vec2,
} from "../../../engine";
import type { CompleteMatchLaunchConfig } from "../core/flow-store";

/** The kind of mode the match shell is currently rendering. */
export type MatchModeId =
  | "DEPLOYMENT"
  | "MOVEMENT_PLOT"
  | "MOVEMENT_PLAYBACK"
  | "ATTACK_PLOT"
  | "ATTACK_PLAYBACK"
  | "RESULT";

/** One AI slot's pending state — mapped by squadId 1..4. */
export type AiStatus =
  | { readonly kind: "IDLE" }
  | { readonly kind: "PENDING"; readonly requestId: number; readonly since: number }
  | {
      readonly kind: "READY";
      readonly plot: SquadMovePlots | SquadAttackPlot;
      readonly diagnosticsSeed: string;
    }
  | { readonly kind: "READY_DEPLOY"; readonly placements: readonly Placement[] }
  | {
      readonly kind: "ERROR";
      readonly errorKind: string;
      readonly message: string;
      readonly requestId: number;
    };

/** Human draft — never a MatchState field. Kept per-construct so the
 *  UI can render "unplotted / HOLD / path-N" without walking the whole
 *  draft array. */
export interface HumanDraftState {
  readonly deploymentDrafts: ReadonlyMap<number, Vec2>; // rosterIndex → position
  readonly moveDrafts: ReadonlyMap<number, readonly Vec2[]>; // constructId → waypoints (path[0] not required to equal position)
  readonly holdSet: ReadonlySet<number>; // constructIds explicitly set to HOLD
  readonly attackDrafts: ReadonlyMap<number, { readonly targetId: ConstructId; readonly called: boolean }>;
  readonly postureDrafts: ReadonlyMap<number, Posture>;
}

/** UI selection state — kept OUT of engine state per the boundary rule. */
export interface SelectionState {
  readonly selectedConstructId: ConstructId | null;
  readonly inspectedConstructId: ConstructId | null;
  readonly hoveredTargetId: ConstructId | null;
  readonly hoveredWaypoint: Vec2 | null;
  readonly showEnemyReach: boolean;
  readonly rulesDrawerOpen: boolean;
  readonly rulesDrawerAnchor: string | null;
}

/** Playback presentation — cursor advances through the events. */
export interface PlaybackState {
  readonly running: boolean;
  readonly cursor: number;
  readonly speed: 1 | 2 | 4;
  readonly events: readonly Event[];
  readonly beforeSnapshot: MatchState | null;
  readonly afterSnapshot: MatchState | null;
  readonly stageKind: "MOVEMENT" | "ATTACK" | null;
}

/** UI presentation preferences the match store owns (playback mostly). */
export interface MatchPresentation {
  readonly highContrastSquads: boolean;
  readonly showRangeMeasure: boolean;
  readonly reducedMotion: boolean;
}

/**
 * The launch payload the match store consumed at mount. Kept as a
 * frozen copy so a mid-match delete elsewhere cannot mutate what the
 * match is running from.
 */
export interface LaunchSnapshot {
  readonly humanSquadId: SquadId; // always 0 in v1
  readonly aiSquadIds: readonly [SquadId, SquadId, SquadId, SquadId];
  readonly config: MatchConfigDigest;
  readonly input: CompleteMatchLaunchConfig;
  readonly seed: string;
}

/** The exchange card cache — computed by the engine on hover. */
export type ExchangeCardMap = ReadonlyMap<string, ExchangeCard>;

/** Exchange cache key `${attackerId}:${targetId}:${called?1:0}` — stable. */
export function exchangeKey(
  attackerId: ConstructId,
  targetId: ConstructId,
  called: boolean,
): string {
  return `${attackerId as number}:${targetId as number}:${called ? 1 : 0}`;
}
