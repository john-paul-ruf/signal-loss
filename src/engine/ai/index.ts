/**
 * Public facade for the AI module (M11). Consumers import from here;
 * internals (`types.ts`, `roster.ts`, `deploy.ts`, `candidates.ts`,
 * `evaluate.ts`, `model.ts`, `search.ts`, `policy.ts`) are implementation
 * details and not part of the engine boundary.
 *
 * The facade grows checkpoint-by-checkpoint. Every export is deliberate;
 * the engine-facade (`../index.ts`) re-exports only what browser / worker /
 * harness consumers need.
 */

export type {
  AiDecision,
  AiDiagnostics,
  AiFailure,
  AiResult,
  AiTier,
  AiWeights,
  AttackCandidate,
  MoveCandidate,
  NodeBudget,
  PostureCandidate,
} from "./types";

export { nodeBudget } from "./types";

export { generateAiRoster, type AiRosterResult } from "./roster";

export { aiDeploy } from "./deploy";

export {
  currentDialStateOf,
  effectiveAttackRangeOf,
  effectiveDamageOf,
  effectiveDialLengthOf,
  generateAttackCandidates,
  generateMoveCandidates,
  generatePostureCandidates,
  ownAliveConstructs,
} from "./candidates";

export {
  buildSquadContext,
  ownDialSummary,
  scoreAttackCandidate,
  scoreMoveEndpoint,
  type AttackTerms,
  type MoveTerms,
  type ScoredAttack,
  type ScoredMove,
  type SquadContext,
} from "./evaluate";

export { aiAttackPlot, aiMovePlot } from "./policy";
