/**
 * SIGNAL LOSS engine facade (M12).
 *
 * The complete, supported browser / worker / harness import surface. Every
 * consumer imports from here — no deep app-to-engine internal paths after
 * this file exists. Adding an export is an intentional API change;
 * removing one is a semver-breaking change within v1.
 *
 * Boundaries (arch §2.1, §3.9):
 *   - This file exports ONLY types and functions from `./src/engine/**`.
 *   - It exports NOTHING from `./src/app`, `./src/platform`, or `./src/workers`.
 *   - It exports NOTHING that reads a wall-clock or unnamed RNG.
 *
 * Module organization mirrors the internal module registry (arch §3):
 *   Fx (M03) → RNG (M04) → Catalog (M05) → Build (M06) → Codec (M07) →
 *   Map (M08) → Match (M09) → View (M10) → AI (M11) → this facade (M12).
 */

/* ------------------------------------------------------------------------- */
/* M03 — Fixed-point math                                                     */
/* ------------------------------------------------------------------------- */

export {
  type Fx,
  type Vec2,
  type Polyline,
  type PolylineMeasure,
  FX_ONE,
  FX_ZERO,
  FX_HALF,
  FX_MIN,
  FX_MAX,
  BOARD_UNIT_MAX,
  V_ZERO,
  assertFx,
  fxFromInt,
  fxToInt,
  fxAdd,
  fxSub,
  fxNeg,
  fxAbs,
  fxMul,
  fxDiv,
  fxMin,
  fxMax,
  fxClamp,
  fxEq,
  fxLt,
  fxLe,
  fxGt,
  fxGe,
  isqrt,
  vec2,
  vecEq,
  vecAdd,
  vecSub,
  vecNeg,
  vecScale,
  vecDot,
  vecCross,
  vecLen2,
  vecLen,
  dist2,
  pointOnSegment,
  segIntersect,
  pointInPoly,
  circleOverlap,
  circleContact,
  measurePolyline,
  polylinePointAt,
} from "./fx/index";

/* ------------------------------------------------------------------------- */
/* M04 — Seeded RNG                                                            */
/* ------------------------------------------------------------------------- */

export {
  type Rng,
  nextInt,
  nextRange,
  pick,
  shuffle,
  fnv1a64,
  rngFromSeed,
  stream,
} from "./rng/index";

/* ------------------------------------------------------------------------- */
/* M05 — Catalog                                                               */
/* ------------------------------------------------------------------------- */

export {
  type ArchetypeCode,
  type ArchetypeId,
  type Budget,
  type Catalog,
  type CatalogError,
  type CatalogErrorKind,
  type CatalogHashes,
  type CatalogIndexes,
  type Chassis,
  type ChassisCode,
  type ChassisId,
  type CommanderCode,
  type CommanderModifications,
  type CommanderType,
  type CommanderTypeId,
  type CurveFamily,
  type DialState,
  type Hardpoint,
  type HardpointType,
  type HardpointTypeCode,
  type HardpointTypeId,
  type MapArchetype,
  type Mount,
  type MountCode,
  type MountFamily,
  type MountId,
  type Prebuilt,
  type PrebuiltConstruct,
  type PrebuiltId,
  type PrebuiltMount,
  type RawCatalogBundle,
  type Result as CatalogResult,
  type Tunables,
  ARCHETYPE_CODE_MAX,
  BUDGETS,
  CHASSIS_CODE_MAX,
  COMMANDER_CODE_MAX,
  CURVE_FAMILIES,
  HARDPOINT_TYPE_CODE_MAX,
  MOUNT_CODE_MAX,
  MOUNT_FAMILIES,
  REQUIRED_ARCHETYPES,
  canonicalHash,
  canonicalize as canonicalizeCatalog,
  fnv1a64Hex,
  loadCatalog,
} from "./catalog/index";

/* ------------------------------------------------------------------------- */
/* M06 — Build rules                                                           */
/* ------------------------------------------------------------------------- */

export {
  type Construct,
  type EffectiveChassis,
  type MountAssignment,
  type Roster,
  type Violation,
  type ViolationRule,
  applyCommanderType,
  chassisFamilyReach,
  constructCost,
  enumerateConstructs,
  enumerateConstructsForChassis,
  enumerateConstructsUnderCost,
  rosterCost,
  validateCatalogPrebuilts,
  validateConstruct,
  validateRoster,
} from "./build/index";

/* ------------------------------------------------------------------------- */
/* M07 — Share codec                                                           */
/* ------------------------------------------------------------------------- */

export {
  type DecodeError,
  type DecodeResult,
  type DecodedConstruct,
  type DecodedRoster,
  FORMAT_VERSION as CODEC_FORMAT_VERSION,
  SL1_PREFIX,
  decode,
  encodeConstruct,
  encodeRoster,
} from "./codec/index";

/* ------------------------------------------------------------------------- */
/* M08 — Map generation                                                        */
/* ------------------------------------------------------------------------- */

export {
  type ArchetypeMetrics,
  type ArchetypeSelector,
  type GameMap,
  type GateCheck,
  type GateCheckId,
  type GateContext,
  type GateReport,
  type GenerateMapOptions,
  type MapGenerationDefect,
  type MapResult,
  type MeasureOptions,
  type SpawnQuintet,
  type SpawnRegion,
  type TraceStep,
  type WallSegment,
  DEFAULT_MEASURE_OPTIONS,
  GATE_CHECK_ORDER,
  MaxRegenExceededError,
  generateMap,
  measureArchetype,
  measureGameMap,
  runPlayabilityGate,
} from "./map/index";

/* ------------------------------------------------------------------------- */
/* M09 — Match resolution                                                      */
/* ------------------------------------------------------------------------- */

export {
  type AttackPlot,
  type AttackResult,
  type ConstructId,
  type DamageAppliedEvent,
  type DefenseInfoEvent,
  type DeploymentRevealEvent,
  type DestroyedEvent,
  type DialAdvancedEvent,
  type EliminatedEvent,
  type EliminationEntry,
  type Event,
  type ExchangeCard,
  type HaltedEvent,
  type HumanDraftPlots,
  type KnownPositionEntry,
  type MatchCompleteEvent,
  type MatchConfig,
  type MatchConfigDigest,
  type MatchConstruct,
  type MatchLog,
  type MatchLogError,
  type MatchLogResult,
  type MatchPhase,
  type MatchState,
  type MatrixCell,
  type MovedEvent,
  type MovePlot,
  type MovementResult,
  type Placement,
  type PoolBreakdown,
  type PoolRefillEvent,
  type Posture,
  type PostureAssignment,
  type PostureRevealEvent,
  type ResolveResult,
  type Result as MatchResult,
  type RoundResult,
  type ShotEvent,
  type ShotOutcome,
  type SquadAttackPlot,
  type SquadId,
  type SquadMovePlots,
  type SquadPlots,
  type SquadState,
  type StartOfRoundSnapshot,
  type TraceDamageEvent,
  MATCH_LOG_VERSION,
  OUTCOME_MATRIX,
  SQUAD_COUNT,
  SQUAD_IDS,
  advanceRoundAndRefill,
  anyAlive,
  applyDeployments,
  applyDeploymentsWithEvents,
  applyDestruction,
  applyMatrix,
  applyTrace,
  attackPartOf,
  canonicalStateString,
  canonicalize as canonicalizeMatch,
  checkElimination,
  computeShot,
  constructId,
  constructsOfSquad,
  countAlive,
  createMatch,
  currentDialState,
  currentTraceStep,
  effectiveAttackRange,
  effectiveDamage,
  effectiveDialLength,
  exchangePreview,
  fnv1a64Hex as fnv1a64HexMatch,
  foldMatchLog,
  getConstruct,
  hashState,
  legalAttackPlot,
  legalDeployment,
  legalMovePlot,
  makeMatchLog,
  movePartOf,
  plottedLength,
  poolFor,
  resolveAttackPhase,
  resolveAttackStage,
  resolveMovementPhase,
  resolveRound,
  snapshotStartOfRound,
  sortEventsCanonical,
  squadId,
} from "./match/index";

/* ------------------------------------------------------------------------- */
/* M10 — Public projection                                                     */
/* ------------------------------------------------------------------------- */

export {
  type KnownConstruct,
  type PublicConstruct,
  type PublicSquad,
  type PublicState,
  distanceFx,
  movementAllowanceOf,
  publicView,
  resolutionRangeOf,
  updateKnownPositions,
} from "./view/index";

/* ------------------------------------------------------------------------- */
/* M11 — AI                                                                    */
/* ------------------------------------------------------------------------- */

export {
  type AiDecision,
  type AiDiagnostics,
  type AiFailure,
  type AiResult,
  type AiRosterResult,
  type AiTier,
  type AiWeights,
  type AttackCandidate,
  type AttackTerms,
  type MoveCandidate,
  type MoveTerms,
  type NodeBudget,
  type OpponentModel,
  type PostureCandidate,
  type PostureObservation,
  type ScoredAttack,
  type ScoredMove,
  type SquadContext,
  aiAttackPlot,
  aiDeploy,
  aiMovePlot,
  buildSquadContext,
  currentDialStateOf,
  effectiveAttackRangeOf,
  effectiveDamageOf,
  effectiveDialLengthOf,
  emptyOpponentModel,
  generateAiRoster,
  generateAttackCandidates,
  generateMoveCandidates,
  generatePostureCandidates,
  nodeBudget,
  observationCount,
  ownAliveConstructs,
  ownDialSummary,
  postureFrequency,
  scoreAttackCandidate,
  scoreMoveEndpoint,
  updateOpponentModel,
} from "./ai/index";
