/**
 * Match-time rule state.
 *
 * Design contract (arch §3.7, §4.4, session prompt):
 *   - Plain, structurally cloneable value. No classes, no Maps of object keys,
 *     no Sets of objects, no functions. This is what lets it cross
 *     postMessage, be hashed for FR-29, and be diffed in tests.
 *   - Entity collections are arrays sorted by stable integer id. Never
 *     objects with string keys whose enumeration order could vary.
 *   - HumanDraftPlots (UI-side, editable, ephemeral) are DISTINCT from
 *     SquadPlots (committed, feeds resolveRound). Drafts never appear on
 *     MatchState.
 *   - Snapshot-then-apply resolution: every stage reads a frozen prior
 *     state and writes into a fresh one; no stage observes another's
 *     partial output.
 *
 * `createMatch` validates rosters, spawn regions, budget, and catalog/map
 * shape. It returns state in the DEPLOYMENT phase; positions are filled by
 * `applyDeployments` after every squad has committed placements, in one
 * simultaneous public reveal (FR-12).
 */

import type {
  Budget,
  Catalog,
  ChassisCode,
  CommanderCode,
} from "../catalog/index";
import type { Fx, Vec2 } from "../fx/index";
import { fxRaw, FX_ZERO } from "../fx/index";
import type { GameMap } from "../map/index";
import type { MountAssignment, Roster, Violation } from "../build/index";
import { rosterCost, validateRoster } from "../build/index";

/* ------------------------------------------------------------------------- */
/* Branded IDs                                                               */
/* ------------------------------------------------------------------------- */

declare const brandSquadId: unique symbol;
declare const brandConstructId: unique symbol;

/**
 * Stable index in [0, 4] identifying one of the five squads. Zero is the
 * human by convention; AI squads are 1..4.
 */
export type SquadId = number & { readonly [brandSquadId]: "SquadId" };

/**
 * Stable integer id of one construct within a match. Ids are assigned at
 * `createMatch` in a deterministic scan order (squad-major, roster-index
 * minor) and never reused, so cross-round comparisons are trivial.
 */
export type ConstructId = number & { readonly [brandConstructId]: "ConstructId" };

/** Cast a raw number to `SquadId`. Callers must have verified 0 ≤ n ≤ 4. */
export function squadId(n: number): SquadId {
  return n as SquadId;
}

/** Cast a raw number to `ConstructId`. */
export function constructId(n: number): ConstructId {
  return n as ConstructId;
}

/** Number of squads in every match. Immutable — FR-4 requires exactly five. */
export const SQUAD_COUNT = 5;

/** Fixed ascending list of squad ids. */
export const SQUAD_IDS: readonly SquadId[] = [
  squadId(0),
  squadId(1),
  squadId(2),
  squadId(3),
  squadId(4),
];

/* ------------------------------------------------------------------------- */
/* Phase state machine                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Coarse phase tag. Only the plotting phases (`MOVEMENT_PLOT`, `ATTACK_PLOT`)
 * accept caller-supplied plots; resolution is a synchronous transition
 * performed by `resolveMovementPhase` / `resolveAttackPhase`.
 *
 * `DEPLOYMENT` is round 0 pre-reveal. `COMPLETE` freezes the state.
 */
export type MatchPhase =
  | "DEPLOYMENT"
  | "MOVEMENT_PLOT"
  | "ATTACK_PLOT"
  | "COMPLETE";

/* ------------------------------------------------------------------------- */
/* Config digest                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Everything a match records about its configuration except the map (which
 * is a full nested value on the state) and the catalog (which lives one
 * hash away from replay). Recording catalog / tunables hashes here is what
 * lets `MatchLog` replays fail loudly when balance shifts (FR-29, §6.3).
 */
export interface MatchConfigDigest {
  readonly seed: string;
  readonly budget: Budget;
  readonly aiTier: number;
  readonly catalogHash: string;
  readonly tunablesHash: string;
}

/**
 * The full input to `createMatch`. `catalog` is passed through by
 * reference so hash digests can be recorded; the state itself only keeps
 * plain values.
 */
export interface MatchConfig {
  readonly seed: string;
  readonly budget: Budget;
  readonly aiTier: number;
  readonly catalog: Catalog;
  readonly map: GameMap;
  readonly rosters: readonly [Roster, Roster, Roster, Roster, Roster];
}

/* ------------------------------------------------------------------------- */
/* Runtime construct                                                          */
/* ------------------------------------------------------------------------- */

/**
 * One live construct on the board. Distinct from `build.Construct`: this
 * is the runtime record with a stable id, a position, and cumulative
 * stats. The build shape (chassisCode / commanderCode / mounts) is copied
 * onto the runtime construct at match creation so the state is
 * self-contained and hash-stable regardless of catalog identity.
 */
export interface MatchConstruct {
  readonly id: ConstructId;
  readonly squadId: SquadId;

  /** Build shape — mounts sorted by hardpoint index (canonical form). */
  readonly chassisCode: ChassisCode;
  readonly commanderCode: CommanderCode | null;
  readonly mounts: readonly MountAssignment[];

  /** Post-deployment position. `V_ZERO` while the state is in DEPLOYMENT. */
  readonly position: Vec2;

  /**
   * Current dial state index. Attack damage AND trace integrity damage
   * both advance this number. A construct is destroyed when
   * `dialIndex >= dial.length` — the dial is authoritatively resolved
   * from the catalog by `effectiveDial(state, id, catalog)`.
   */
  readonly dialIndex: number;

  /** True once destroyed by damage, dial exhaustion, or trace. */
  readonly destroyed: boolean;

  /** Round in which the construct was destroyed; null while alive. */
  readonly destroyedRound: number | null;

  /* ---- Cumulative FR-28 stats ------------------------------------------- */

  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly roundsAlive: number;
  readonly calledShotsFired: number;
  readonly posturesHeld: number;
}

/* ------------------------------------------------------------------------- */
/* Squad state                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Per-squad state. Everything visible to every squad (pool breakdown,
 * commander loss, cumulative stats) — no hidden intent, because intent is
 * NEVER on `MatchState` (per the plot-draft contract).
 */
export interface SquadState {
  readonly id: SquadId;

  /**
   * True the moment the commander's dial is exhausted. FR-17: the pool
   * collapses to 1 for every remaining round and does not restore. Stored
   * as a permanent flag rather than re-derived from the commander construct
   * — that way "already dead" is a single-source-of-truth boolean regardless
   * of later state manipulation.
   */
  readonly commanderDead: boolean;

  /** Round the commander died in, or null if still alive. */
  readonly commanderDeathRound: number | null;

  /**
   * Pool granted at the start of the CURRENT round after refill. Zero
   * during DEPLOYMENT. Used to compute overspend at attack-plot time.
   */
  readonly poolTotal: number;

  /**
   * Points spent on called shots + postures in the current round's
   * committed attack plot. Set at ATTACK_PLOT commit; reset at refill.
   */
  readonly poolSpent: number;

  /** Elimination round; null if this squad is still alive. */
  readonly eliminatedRound: number | null;

  /* ---- FR-28 aggregates -------------------------------------------------- */

  readonly totalDamageDealt: number;
  readonly totalDamageTaken: number;
  readonly totalPoolGranted: number;
  readonly totalPoolSpent: number;
  readonly totalPoolWasted: number;
  readonly totalCalledShots: number;
  readonly totalPostures: number;
}

/* ------------------------------------------------------------------------- */
/* Known positions (M10 substrate)                                            */
/* ------------------------------------------------------------------------- */

/**
 * One (observer, subject) fact. `confirmedRound === 0` means never
 * confirmed since the match began (fresh ghost); the last confirmed
 * position stays under `position`. Entries are stored sorted by
 * (observer asc, subject asc) so canonical serialization is order-stable.
 *
 * Own squad's constructs are always confirmed at the current round. The
 * projection (M10) reads this table verbatim; it never re-derives it.
 */
export interface KnownPositionEntry {
  readonly observer: SquadId;
  readonly subject: ConstructId;
  readonly position: Vec2;
  readonly confirmedRound: number;
}

/* ------------------------------------------------------------------------- */
/* Match-end bookkeeping                                                       */
/* ------------------------------------------------------------------------- */

/**
 * One squad's elimination record. Includes the placement rank (1st = last
 * squad standing; 5th = first squad eliminated). Populated by end-round
 * elimination (Checkpoint 4).
 */
export interface EliminationEntry {
  readonly squadId: SquadId;
  readonly round: number;
  readonly placement: 1 | 2 | 3 | 4 | 5;
}

/* ------------------------------------------------------------------------- */
/* MatchState                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * The whole match, at rest between phases. Fields are alphabetized
 * conceptually (see canonical serialization). Field additions must
 * respect: plain, cloneable, sortable-by-integer, no functions.
 */
export interface MatchState {
  readonly config: MatchConfigDigest;
  readonly constructs: readonly MatchConstruct[]; // sorted by id
  readonly eliminationOrder: readonly EliminationEntry[]; // in destruction order
  readonly knownPositions: readonly KnownPositionEntry[]; // sorted (observer, subject)
  readonly map: GameMap;
  readonly phase: MatchPhase;
  readonly round: number; // 0 during DEPLOYMENT; 1+ once movement begins
  readonly squads: readonly [
    SquadState,
    SquadState,
    SquadState,
    SquadState,
    SquadState,
  ];
  readonly winner: SquadId | null; // set when phase = COMPLETE
}

/* ------------------------------------------------------------------------- */
/* Result union (shared shape from catalog/build)                              */
/* ------------------------------------------------------------------------- */

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/* ------------------------------------------------------------------------- */
/* Deployment inputs                                                          */
/* ------------------------------------------------------------------------- */

/**
 * One caller-supplied placement request. `rosterIndex` refers to the
 * order the construct appears in the squad's roster; the engine assigns
 * the stable `ConstructId` deterministically at deployment.
 */
export interface Placement {
  readonly rosterIndex: number;
  readonly position: Vec2;
}

/* ------------------------------------------------------------------------- */
/* createMatch                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Build the starting state. Validates every top-level input; on failure
 * returns the full ordered `Violation[]` (no partial state). On success
 * the state is in `DEPLOYMENT` phase — positions are `V_ZERO` and squads
 * have zero pool; `applyDeployments` performs the reveal.
 */
export function createMatch(config: MatchConfig): Result<MatchState, readonly Violation[]> {
  const violations: Violation[] = [];

  // FR-4: exactly five squads.
  if (config.rosters.length !== SQUAD_COUNT) {
    violations.push({
      rule: "FR-4",
      kind: "WRONG_SQUAD_COUNT",
      message: `Match requires exactly ${SQUAD_COUNT} rosters; got ${config.rosters.length}.`,
      path: "rosters",
    });
  }

  // FR-4 / FR-12: every roster must satisfy the SAME budget.
  for (let i = 0; i < config.rosters.length; i = i + 1) {
    const roster = config.rosters[i];
    if (roster === undefined) continue;
    const inner = validateRoster(roster, config.catalog, config.budget);
    for (const v of inner) {
      violations.push({
        rule: v.rule,
        kind: v.kind,
        message: v.message,
        path: `rosters[${i}].${v.path}`,
      });
    }
    const cost = rosterCost(roster, config.catalog);
    if (cost > (config.budget as number)) {
      // validateRoster already reports this — do not double-count. Left as
      // a comment so a later reader knows the check is intentional.
    }
  }

  // FR-12: exactly five spawn regions, one per squadIndex 0..4.
  if (config.map.spawns.length !== SQUAD_COUNT) {
    violations.push({
      rule: "FR-12",
      kind: "WRONG_SPAWN_COUNT",
      message: `Map has ${config.map.spawns.length} spawn regions; needs exactly ${SQUAD_COUNT}.`,
      path: "map.spawns",
    });
  } else {
    for (let i = 0; i < SQUAD_COUNT; i = i + 1) {
      const region = config.map.spawns[i];
      if (region === undefined) continue;
      if (region.squadIndex !== i) {
        violations.push({
          rule: "FR-12",
          kind: "SPAWN_INDEX_MISMATCH",
          message: `spawns[${i}].squadIndex is ${region.squadIndex}; expected ${i}.`,
          path: `map.spawns[${i}].squadIndex`,
        });
      }
    }
  }

  if (violations.length > 0) {
    return { ok: false, error: violations };
  }

  // Build the runtime shape. Ids scan squad-major, roster-index minor for
  // stable id assignment across replays.
  const constructs: MatchConstruct[] = [];
  let nextId = 0;
  for (let squadIndex = 0; squadIndex < SQUAD_COUNT; squadIndex = squadIndex + 1) {
    const roster = config.rosters[squadIndex];
    if (roster === undefined) continue;
    for (let ri = 0; ri < roster.constructs.length; ri = ri + 1) {
      const rc = roster.constructs[ri];
      if (rc === undefined) continue;
      constructs.push({
        id: constructId(nextId),
        squadId: squadId(squadIndex),
        chassisCode: rc.chassisCode,
        commanderCode: rc.commanderCode,
        mounts: rc.mounts.slice(),
        position: { x: FX_ZERO, y: FX_ZERO },
        dialIndex: 0,
        destroyed: false,
        destroyedRound: null,
        damageDealt: 0,
        damageTaken: 0,
        roundsAlive: 0,
        calledShotsFired: 0,
        posturesHeld: 0,
      });
      nextId = nextId + 1;
    }
  }

  const squads = [0, 1, 2, 3, 4].map((i) => freshSquad(squadId(i))) as [
    SquadState,
    SquadState,
    SquadState,
    SquadState,
    SquadState,
  ];

  const state: MatchState = {
    config: {
      seed: config.seed,
      budget: config.budget,
      aiTier: config.aiTier,
      catalogHash: config.catalog.hashes.catalog,
      tunablesHash: config.catalog.hashes.tunables,
    },
    constructs,
    eliminationOrder: [],
    knownPositions: [],
    map: config.map,
    phase: "DEPLOYMENT",
    round: 0,
    squads,
    winner: null,
  };

  return { ok: true, value: state };
}

function freshSquad(id: SquadId): SquadState {
  return {
    id,
    commanderDead: false,
    commanderDeathRound: null,
    poolTotal: 0,
    poolSpent: 0,
    eliminatedRound: null,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    totalPoolGranted: 0,
    totalPoolSpent: 0,
    totalPoolWasted: 0,
    totalCalledShots: 0,
    totalPostures: 0,
  };
}

/* ------------------------------------------------------------------------- */
/* Small helpers used across the module (internal but not private)             */
/* ------------------------------------------------------------------------- */

/**
 * Return the roster construct at (squadId, rosterIndex) from the config
 * echoed onto MatchState. Deterministic scan matches the id assignment
 * in `createMatch`.
 */
export function findConstructAt(
  state: MatchState,
  squad: SquadId,
  rosterIndex: number,
): MatchConstruct | undefined {
  let seen = 0;
  for (const c of state.constructs) {
    if (c.squadId !== squad) continue;
    if (seen === rosterIndex) return c;
    seen = seen + 1;
  }
  return undefined;
}

/**
 * Return the sorted subset of constructs belonging to a squad. Preserves
 * id order.
 */
export function constructsOfSquad(
  state: MatchState,
  squad: SquadId,
): readonly MatchConstruct[] {
  return state.constructs.filter((c) => c.squadId === squad);
}

/** Fetch a construct by id in O(log n). Constructs are sorted by id. */
export function getConstruct(
  state: MatchState,
  id: ConstructId,
): MatchConstruct | undefined {
  const target = id as number;
  let lo = 0;
  let hi = state.constructs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = state.constructs[mid];
    if (c === undefined) return undefined;
    const ci = c.id as number;
    if (ci === target) return c;
    if (ci < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return undefined;
}

/**
 * Return true iff every squad has at least one non-destroyed construct.
 * Convenience for elimination checks.
 */
export function anyAlive(state: MatchState, squad: SquadId): boolean {
  for (const c of state.constructs) {
    if (c.squadId === squad && !c.destroyed) return true;
  }
  return false;
}

/**
 * Wrap a caller-supplied fx integer into a Vec2. Truncates through
 * `fxRaw` (integer preserved). Not exported; kept internal for state
 * construction helpers.
 */
export function fxVec(x: number, y: number): Vec2 {
  return { x: fxRaw(x) as Fx, y: fxRaw(y) as Fx };
}
