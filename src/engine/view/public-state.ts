/**
 * PublicState — the information contract (FR-24, FR-25).
 *
 * PublicState is a STRUCTURAL SUBSET of what MatchState carries, defined
 * as its own type rather than as `Omit<MatchState, ...>`. The reason is
 * important: a future field on MatchState (say, a debug field or an
 * un-projected AI hint) would silently join the projection under the
 * omit approach — and any intent field would leak by default.
 *
 * The information contract is:
 *   PUBLIC (in every PublicState field): every construct's chassis, every
 *   mounted mount, every stat, dial position, damage taken, commander
 *   status, every squad's pool size + breakdown, the full trace schedule,
 *   the map, elimination order, winner.
 *
 *   OWN CONSTRUCTS: full-resolution current position.
 *   OTHER SQUADS: last confirmed position + confirmedRound + driftRadius;
 *   the position is refreshed the moment an observer's construct is
 *   within its resolution range of the subject (see updateKnownPositions).
 *
 *   NEVER PRESENT: draft plots, committed plots, uncommitted intent of
 *   any form. Not even a boolean "has plotted" flag — that would violate
 *   FR-24's intent-is-the-only-hidden-thing rule.
 */

import type { Fx, Vec2 } from "../fx/index";
import type {
  ChassisCode,
  CommanderCode,
} from "../catalog/index";
import type { Catalog } from "../catalog/index";
import type { GameMap } from "../map/index";
import type { MountAssignment } from "../build/index";
import type {
  ConstructId,
  EliminationEntry,
  MatchConfigDigest,
  MatchPhase,
  MatchState,
  SquadId,
} from "../match/index";
import { SQUAD_COUNT } from "../match/index";
import { movementAllowanceOf } from "./resolution-loss";

/**
 * Public per-squad state — everything published by FR-24.
 */
export interface PublicSquad {
  readonly id: SquadId;
  readonly commanderDead: boolean;
  readonly commanderDeathRound: number | null;
  readonly poolTotal: number;
  readonly poolSpent: number;
  readonly eliminatedRound: number | null;
  readonly totalDamageDealt: number;
  readonly totalDamageTaken: number;
  readonly totalPoolGranted: number;
  readonly totalPoolSpent: number;
  readonly totalPoolWasted: number;
  readonly totalCalledShots: number;
  readonly totalPostures: number;
}

/**
 * Public per-construct facts. Every one of these is REQUIRED — no field
 * on PublicConstruct is ever elided.
 */
export interface PublicConstruct {
  readonly id: ConstructId;
  readonly squadId: SquadId;
  readonly chassisCode: ChassisCode;
  readonly commanderCode: CommanderCode | null;
  readonly mounts: readonly MountAssignment[];
  readonly dialIndex: number;
  readonly destroyed: boolean;
  readonly destroyedRound: number | null;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly roundsAlive: number;
  readonly calledShotsFired: number;
  readonly posturesHeld: number;
}

/**
 * A construct plus the observer's position-confidence facts. The position
 * ALWAYS carries a Vec2 value (a placeholder if never confirmed); use
 * `confirmedRound === state.round` to test if the current fact is fresh.
 */
export interface KnownConstruct {
  readonly base: PublicConstruct;
  readonly position: Vec2;
  readonly confirmedRound: number;
  /** True iff `confirmedRound === state.round`. */
  readonly confirmed: boolean;
  /** Ghost drift radius, fx. Zero when confirmed. */
  readonly driftRadius: Fx;
}

export interface PublicState {
  readonly observer: SquadId;
  readonly config: MatchConfigDigest;
  readonly round: number;
  readonly phase: MatchPhase;
  readonly map: GameMap;
  readonly squads: readonly [
    PublicSquad,
    PublicSquad,
    PublicSquad,
    PublicSquad,
    PublicSquad,
  ];
  readonly constructs: readonly KnownConstruct[]; // sorted by construct id
  readonly eliminationOrder: readonly EliminationEntry[];
  readonly winner: SquadId | null;
}

/**
 * Project MatchState to the observer's PublicState. Own-squad constructs
 * are always fully confirmed at the current round; enemy positions come
 * from the observer's row in `knownPositions`.
 *
 * Callers who want fresh positions should `updateKnownPositions` first
 * (typically at the end of each resolution stage).
 */
export function publicView(
  state: MatchState,
  observer: SquadId,
  catalog: Catalog,
): PublicState {
  // Build observer row lookup for known positions.
  const knownForObserver = new Map<number, { position: Vec2; confirmedRound: number }>();
  for (const e of state.knownPositions) {
    if ((e.observer as number) !== (observer as number)) continue;
    knownForObserver.set(e.subject as number, {
      position: e.position,
      confirmedRound: e.confirmedRound,
    });
  }
  const publicConstructs: KnownConstruct[] = state.constructs.map((c) => {
    const base: PublicConstruct = publicConstructOf(c);
    if ((c.squadId as number) === (observer as number)) {
      return {
        base,
        position: c.position,
        confirmedRound: state.round,
        confirmed: true,
        driftRadius: 0 as Fx,
      };
    }
    const row = knownForObserver.get(c.id as number);
    if (row === undefined) {
      return {
        base,
        position: c.position, // shouldn't happen post-updateKnownPositions
        confirmedRound: 0,
        confirmed: false,
        driftRadius: driftRadiusFor(c, catalog, state.round, 0),
      };
    }
    const confirmed = row.confirmedRound === state.round;
    return {
      base,
      position: row.position,
      confirmedRound: row.confirmedRound,
      confirmed,
      driftRadius: confirmed
        ? (0 as Fx)
        : driftRadiusFor(c, catalog, state.round, row.confirmedRound),
    };
  });
  const publicSquads = state.squads.map((s) => publicSquadOf(s)) as unknown as [
    PublicSquad,
    PublicSquad,
    PublicSquad,
    PublicSquad,
    PublicSquad,
  ];
  void SQUAD_COUNT; // reserved: PublicState squads tuple length invariant

  return {
    observer,
    config: state.config,
    round: state.round,
    phase: state.phase,
    map: state.map,
    squads: publicSquads,
    constructs: publicConstructs,
    eliminationOrder: state.eliminationOrder,
    winner: state.winner,
  };
}

/**
 * Copy the whitelist of PublicConstruct fields off a runtime construct.
 * Note: `position` is NOT included here — position comes from the
 * observer-specific known-position table.
 */
function publicConstructOf(c: MatchState["constructs"][number]): PublicConstruct {
  return {
    id: c.id,
    squadId: c.squadId,
    chassisCode: c.chassisCode,
    commanderCode: c.commanderCode,
    mounts: c.mounts,
    dialIndex: c.dialIndex,
    destroyed: c.destroyed,
    destroyedRound: c.destroyedRound,
    damageDealt: c.damageDealt,
    damageTaken: c.damageTaken,
    roundsAlive: c.roundsAlive,
    calledShotsFired: c.calledShotsFired,
    posturesHeld: c.posturesHeld,
  };
}

function publicSquadOf(s: MatchState["squads"][number]): PublicSquad {
  return {
    id: s.id,
    commanderDead: s.commanderDead,
    commanderDeathRound: s.commanderDeathRound,
    poolTotal: s.poolTotal,
    poolSpent: s.poolSpent,
    eliminatedRound: s.eliminatedRound,
    totalDamageDealt: s.totalDamageDealt,
    totalDamageTaken: s.totalDamageTaken,
    totalPoolGranted: s.totalPoolGranted,
    totalPoolSpent: s.totalPoolSpent,
    totalPoolWasted: s.totalPoolWasted,
    totalCalledShots: s.totalCalledShots,
    totalPostures: s.totalPostures,
  };
}

/**
 * Drift radius: distance a ghost could have moved since last confirmation.
 * Equals `movementAllowance × (currentRound − confirmedRound)`. Confirmed
 * this round → zero.
 */
function driftRadiusFor(
  construct: MatchState["constructs"][number],
  catalog: Catalog,
  currentRound: number,
  confirmedRound: number,
): Fx {
  if (confirmedRound === currentRound) return 0 as Fx;
  const gap = Math.max(1, currentRound - confirmedRound);
  const alw = movementAllowanceOf(construct, catalog) as number;
  return (alw * gap) as Fx;
}
