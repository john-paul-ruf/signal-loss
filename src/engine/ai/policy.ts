/**
 * Tier-dispatch policies (M11).
 *
 * `aiMovePlot` and `aiAttackPlot` are the public entry points. They accept
 * an `AiTier` (1..3) and dispatch to the appropriate implementation.
 *
 * Tier 1 (this checkpoint) — greedy: pick each own construct's highest-
 * scoring move candidate independently; pick each own construct's highest-
 * scoring attack independently; assign called shots / postures by
 * data-driven rate rules bounded by pool capacity.
 *
 * Tiers 2 and 3 add opponent modelling, one-ply / beam search, and
 * anti-kingmaking in later checkpoints. Both later tiers REUSE the same
 * evaluator; they only enrich the input assumptions and the search shape.
 *
 * Every tier is bounded by the caller-supplied `NodeBudget`. Every tier
 * returns identical `AiDecision<T>` shapes so consumers (workers, tests)
 * do not branch on tier.
 */

import type { Catalog } from "../catalog/index";
import type { Rng } from "../rng/index";
import { nextRange } from "../rng/index";
import type { PublicState } from "../view/index";
import type {
  AttackPlot,
  MovePlot,
  PostureAssignment,
  SquadAttackPlot,
  SquadMovePlots,
  SquadId,
  ConstructId,
} from "../match/index";
import {
  generateAttackCandidates,
  generateMoveCandidates,
} from "./candidates";
import {
  buildSquadContext,
  scoreAttackCandidate,
  scoreMoveEndpoint,
} from "./evaluate";
import type {
  AiDecision,
  AiDiagnostics,
  AiResult,
  AiTier,
  AiWeights,
  NodeBudget,
} from "./types";

/* ------------------------------------------------------------------------- */
/* Public entry points                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Produce a legal `SquadMovePlots` for the observer squad. Tier controls
 * the SEARCH; every tier's output is a legal `SquadMovePlots` that the
 * engine's `resolveMovementPhase` accepts.
 */
export function aiMovePlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier = 1,
): AiResult<AiDecision<SquadMovePlots>> {
  if ((state.observer as number) !== (squad as number)) {
    return {
      ok: false,
      error: {
        kind: "STATE_UNRESOLVED",
        message: `aiMovePlot: observer ${state.observer as number} does not match squad ${squad as number}.`,
      },
    };
  }
  // Tier 1 uses the greedy policy. Higher tiers reuse the same policy
  // interface but override the search / model — added in later checkpoints.
  return tier1MovePlot(state, squad, catalog, rng, weights, budget, tier);
}

/**
 * Produce a legal `SquadAttackPlot` for the observer squad.
 */
export function aiAttackPlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier = 1,
): AiResult<AiDecision<SquadAttackPlot>> {
  if ((state.observer as number) !== (squad as number)) {
    return {
      ok: false,
      error: {
        kind: "STATE_UNRESOLVED",
        message: `aiAttackPlot: observer ${state.observer as number} does not match squad ${squad as number}.`,
      },
    };
  }
  return tier1AttackPlot(state, squad, catalog, rng, weights, budget, tier);
}

/* ------------------------------------------------------------------------- */
/* Tier 1 movement                                                             */
/* ------------------------------------------------------------------------- */

function tier1MovePlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier,
): AiResult<AiDecision<SquadMovePlots>> {
  const context = buildSquadContext(state, catalog);
  let nodesVisited = 0;
  let candidateCount = 0;
  const moves: MovePlot[] = [];
  const selectedIds: number[] = [];
  const scoreTerms: Record<string, number> = {};
  let currentRng: Rng = rng;

  for (const own of context.ownConstructs) {
    const candidates = generateMoveCandidates(state, own.base.id, catalog);
    candidateCount = candidateCount + candidates.length;
    if (candidates.length === 0) continue;
    if (nodesVisited >= (budget as number)) {
      // Node budget exhausted — default to HOLD (always legal) for the
      // remaining constructs to keep the plot complete without exceeding
      // budget.
      moves.push({ constructId: own.base.id, path: [] });
      selectedIds.push(own.base.id as number);
      continue;
    }
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestIndex = -1;
    for (let i = 0; i < candidates.length; i = i + 1) {
      if (nodesVisited >= (budget as number)) break;
      const c = candidates[i];
      if (c === undefined) continue;
      const scored = scoreMoveEndpoint(state, own, c.endPosition, catalog, weights);
      nodesVisited = nodesVisited + 1;
      // Stable seeded tie-break: draw a small nonce so equal scores pick
      // reproducibly across runs (rng advances).
      const [nonce, r2] = nextRange(currentRng, 0, 1024);
      currentRng = r2;
      const compositeScore = scored.score * 1024 + nonce;
      if (compositeScore > bestScore) {
        bestScore = compositeScore;
        bestIndex = i;
      }
      // Accumulate diagnostic terms (aggregate).
      scoreTerms["exposure"] = (scoreTerms["exposure"] ?? 0) + scored.terms.exposure;
      scoreTerms["traceSafety"] = (scoreTerms["traceSafety"] ?? 0) + scored.terms.traceSafety;
      scoreTerms["positionUtility"] = (scoreTerms["positionUtility"] ?? 0) + scored.terms.positionUtility;
    }
    const chosen = candidates[bestIndex] ?? candidates[0];
    if (chosen === undefined) continue;
    moves.push({ constructId: own.base.id, path: chosen.path });
    selectedIds.push(own.base.id as number);
  }

  const diagnostics: AiDiagnostics = {
    tier,
    nodesVisited,
    nodeBudget: budget as number,
    candidateCount,
    selectedIds,
    scoreTerms,
  };
  return {
    ok: true,
    value: {
      choice: {
        squadId: squad,
        moves: moves.slice().sort((a, b) => (a.constructId as number) - (b.constructId as number)),
      },
      diagnostics,
      rng: currentRng,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Tier 1 attack                                                              */
/* ------------------------------------------------------------------------- */

interface AttackDecisionRow {
  readonly constructId: ConstructId;
  readonly normalBest: {
    readonly targetId: ConstructId | null;
    readonly score: number;
    readonly damage: number;
    readonly isKill: boolean;
    readonly commander: boolean;
  };
  readonly calledBest: {
    readonly targetId: ConstructId | null;
    readonly score: number;
    readonly damage: number;
    readonly isKill: boolean;
    readonly commander: boolean;
  };
  readonly exposure: number;
}

function tier1AttackPlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier,
): AiResult<AiDecision<SquadAttackPlot>> {
  const context = buildSquadContext(state, catalog);
  let nodesVisited = 0;
  let candidateCount = 0;
  const rows: AttackDecisionRow[] = [];
  let currentRng: Rng = rng;

  for (const own of context.ownConstructs) {
    const candidates = generateAttackCandidates(state, own.base.id, catalog);
    candidateCount = candidateCount + candidates.length;
    // Track best normal and best called separately so pool assignment can
    // decide called-shot upgrades globally.
    let normalBest: AttackDecisionRow["normalBest"] = {
      targetId: null,
      score: 0,
      damage: 0,
      isKill: false,
      commander: false,
    };
    let calledBest: AttackDecisionRow["calledBest"] = {
      targetId: null,
      score: -weights.calledCost,
      damage: 0,
      isKill: false,
      commander: false,
    };
    for (let i = 0; i < candidates.length; i = i + 1) {
      if (nodesVisited >= (budget as number)) break;
      const c = candidates[i];
      if (c === undefined) continue;
      if (c.targetId === null) continue;
      const target = state.constructs.find((k) => (k.base.id as number) === (c.targetId as number));
      if (target === undefined) continue;
      // Tier 1: assume enemy will not posture (numer=0, denom=1). Tier 2+
      // will thread observed posture frequency in.
      const scored = scoreAttackCandidate(own, target, c.called, 0, 1, catalog, weights);
      nodesVisited = nodesVisited + 1;
      const [nonce, r2] = nextRange(currentRng, 0, 1024);
      currentRng = r2;
      const composite = scored.score * 1024 + nonce;
      if (c.called) {
        const cur = calledBest.score * 1024;
        if (composite > cur) {
          calledBest = {
            targetId: c.targetId,
            score: scored.score,
            damage: scored.expectedDamage,
            isKill: scored.isKill,
            commander: scored.targetIsCommander,
          };
        }
      } else {
        const cur = normalBest.score * 1024;
        if (composite > cur) {
          normalBest = {
            targetId: c.targetId,
            score: scored.score,
            damage: scored.expectedDamage,
            isKill: scored.isKill,
            commander: scored.targetIsCommander,
          };
        }
      }
    }
    rows.push({
      constructId: own.base.id,
      normalBest,
      calledBest,
      exposure: context.exposureByOwnId.get(own.base.id as number) ?? 0,
    });
  }

  // Pool assignment: rank constructs by "called upgrade benefit" and by
  // "posture desirability", then greedy-fill until pool exhausted.
  const pool = context.poolTotal;
  const spendPlan = allocatePool(rows, pool, weights, currentRng);
  currentRng = spendPlan.rng;

  const attacks: AttackPlot[] = [];
  const postures: PostureAssignment[] = [];
  const selectedIds: number[] = [];

  for (const row of rows) {
    const wantCalled = spendPlan.calledIds.has(row.constructId as number) && row.calledBest.targetId !== null;
    const chosen = wantCalled ? row.calledBest : row.normalBest;
    if (chosen.targetId !== null) {
      attacks.push({
        constructId: row.constructId,
        targetId: chosen.targetId,
        called: wantCalled,
      });
      selectedIds.push(row.constructId as number);
    }
    const posture: "FLAT" | "POSTURE" = spendPlan.postureIds.has(row.constructId as number)
      ? "POSTURE"
      : "FLAT";
    postures.push({ constructId: row.constructId, posture });
  }

  // Canonical sort by constructId ascending.
  attacks.sort((a, b) => (a.constructId as number) - (b.constructId as number));
  postures.sort((a, b) => (a.constructId as number) - (b.constructId as number));

  const scoreTerms: Record<string, number> = {
    calledCount: spendPlan.calledIds.size,
    postureCount: spendPlan.postureIds.size,
    poolSpent: spendPlan.spent,
  };
  const diagnostics: AiDiagnostics = {
    tier,
    nodesVisited,
    nodeBudget: budget as number,
    candidateCount,
    selectedIds,
    scoreTerms,
  };
  return {
    ok: true,
    value: {
      choice: { squadId: squad, attacks, postures },
      diagnostics,
      rng: currentRng,
    },
  };
}

/**
 * Greedy pool allocator. Ranks (construct, called-upgrade) items by
 * marginal-value and (construct, posture) items by exposure * ratio; fills
 * pool until exhausted, preferring the largest marginal-value each step.
 *
 * Tier 1's data-driven rates: the ratios `calledRateNumer/Denom` and
 * `postureRateNumer/Denom` bias the initial ranking. Exposure raises the
 * posture weight; lethal opportunity + commander bonus raise the called
 * weight. Pool capacity is respected exactly.
 */
function allocatePool(
  rows: readonly AttackDecisionRow[],
  poolTotal: number,
  weights: AiWeights,
  rng: Rng,
): {
  readonly calledIds: ReadonlySet<number>;
  readonly postureIds: ReadonlySet<number>;
  readonly spent: number;
  readonly rng: Rng;
} {
  interface Slot {
    readonly kind: "CALLED" | "POSTURE";
    readonly constructId: number;
    readonly weight: number;
  }
  const slots: Slot[] = [];
  let currentRng: Rng = rng;
  for (const row of rows) {
    // Called-upgrade slot: only if called improves over normal AND target exists.
    if (row.calledBest.targetId !== null) {
      const marginal = row.calledBest.score - row.normalBest.score;
      // Baseline called rate contribution.
      const rateBase = Math.floor(
        (marginal * weights.calledRateDenom + weights.calledRateNumer * weights.damageWeight) /
          weights.calledRateDenom,
      );
      // Kill / commander opportunity amplifiers.
      const killAmp = row.calledBest.isKill ? weights.killBonus : 0;
      const cmdAmp = row.calledBest.commander ? weights.commanderBonus : 0;
      const w = rateBase + killAmp + cmdAmp;
      if (w > 0) {
        const [nonce, r2] = nextRange(currentRng, 0, 1024);
        currentRng = r2;
        slots.push({
          kind: "CALLED",
          constructId: row.constructId as number,
          weight: w * 1024 + nonce,
        });
      }
    }
    // Posture slot: driven by exposure + baseline rate.
    const exposureAdj = Math.floor(
      (row.exposure * weights.postureExposureNumer) / weights.postureExposureDenom,
    );
    const rateBase = Math.floor(
      (weights.postureRateNumer * weights.exposurePenalty) / weights.postureRateDenom,
    );
    const w = rateBase + exposureAdj - weights.postureCost;
    if (w > 0) {
      const [nonce, r2] = nextRange(currentRng, 0, 1024);
      currentRng = r2;
      slots.push({
        kind: "POSTURE",
        constructId: row.constructId as number,
        weight: w * 1024 + nonce,
      });
    }
  }
  slots.sort((a, b) => b.weight - a.weight);
  const calledIds = new Set<number>();
  const postureIds = new Set<number>();
  let spent = 0;
  for (const s of slots) {
    if (spent >= poolTotal) break;
    if (s.kind === "CALLED") {
      if (calledIds.has(s.constructId)) continue;
      calledIds.add(s.constructId);
    } else {
      if (postureIds.has(s.constructId)) continue;
      postureIds.add(s.constructId);
    }
    spent = spent + 1;
  }
  return { calledIds, postureIds, spent, rng: currentRng };
}
