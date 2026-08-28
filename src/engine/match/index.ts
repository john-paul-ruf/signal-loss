/**
 * Public facade of the match module (M09). Consumers import from here;
 * internals (`state.ts`, `events.ts`, `plot.ts`, `deployment.ts`,
 * `canonical.ts`, `movement.ts`, `attack.ts`, `pool.ts`, `end-round.ts`,
 * `resolve-round.ts`, `replay.ts`) are implementation details.
 *
 * The API is grown by checkpoint; the barrel is the single grow-out point
 * so downstream sessions never depend on an internal file path.
 */

export type {
  SquadId,
  ConstructId,
  MatchPhase,
  MatchConfig,
  MatchConfigDigest,
  MatchConstruct,
  MatchState,
  Placement,
  Result,
  SquadState,
  KnownPositionEntry,
  EliminationEntry,
} from "./state";

export {
  createMatch,
  squadId,
  constructId,
  SQUAD_COUNT,
  SQUAD_IDS,
  constructsOfSquad,
  getConstruct,
  anyAlive,
} from "./state";

export {
  legalDeployment,
  applyDeployments,
} from "./deployment";

export type {
  AttackPlot,
  MovePlot,
  Posture,
  PostureAssignment,
  SquadAttackPlot,
  SquadMovePlots,
  SquadPlots,
  HumanDraftPlots,
} from "./plot";

export {
  attackPartOf,
  currentDialState,
  effectiveDialLength,
  legalAttackPlot,
  legalMovePlot,
  movePartOf,
  plottedLength,
} from "./plot";

export type {
  Event,
  DeploymentRevealEvent,
  PoolRefillEvent,
  MovedEvent,
  HaltedEvent,
  PostureRevealEvent,
  ShotEvent,
  DefenseInfoEvent,
  DamageAppliedEvent,
  DialAdvancedEvent,
  TraceDamageEvent,
  DestroyedEvent,
  EliminatedEvent,
  MatchCompleteEvent,
} from "./events";

export { sortEventsCanonical } from "./events";

export { resolveMovementPhase, type MovementResult } from "./movement";

export { poolFor, countAlive, type PoolBreakdown } from "./pool";

export {
  applyMatrix,
  computeShot,
  effectiveAttackRange,
  effectiveDamage,
  exchangePreview,
  OUTCOME_MATRIX,
  resolveAttackStage,
  type AttackResult,
  type ExchangeCard,
  type MatrixCell,
  type ShotOutcome,
} from "./attack";

export {
  canonicalize,
  canonicalStateString,
  fnv1a64Hex,
  hashState,
} from "./canonical";
