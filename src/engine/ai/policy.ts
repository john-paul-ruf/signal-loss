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
import {
  emptyOpponentModel,
  postureFrequency,
  type OpponentModel,
} from "./model";
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
 *
 * `model` is used by Tier 2+ to weight enemy retaliation by their observed
 * posture frequency. Tier 1 ignores it.
 */
export function aiMovePlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier = 1,
  model: OpponentModel = emptyOpponentModel(),
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
  // Tier 1 / Tier 2 movement is greedy; movement scoring is model-agnostic
  // (posture affects attacks, not endpoint exposure). Tier 3 adds
  // trace-schedule lookahead over `weights.beamDepth` future rounds.
  void model;
  if (tier >= 3) {
    return tier3MovePlot(state, squad, catalog, rng, weights, budget, tier);
  }
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
  model: OpponentModel = emptyOpponentModel(),
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
  if (tier >= 3) {
    return tier3AttackPlot(state, squad, catalog, rng, weights, budget, tier, model);
  }
  if (tier >= 2) {
    return tier2AttackPlot(state, squad, catalog, rng, weights, budget, tier, model);
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

/* ------------------------------------------------------------------------- */
/* Tier 2 attack — opponent-model-blended EV, one-ply                          */
/* ------------------------------------------------------------------------- */

/**
 * Tier 2's attack decision. Same greedy pool allocator as Tier 1, but the
 * expected-damage calculation blends the FLAT and POSTURE matrix cells
 * according to the target squad's observed posture frequency (from
 * `model`). Deterministic per (state, rng, weights, model): the smoothed
 * frequency is an integer ratio, so no float ever enters scoring.
 *
 * Node accounting: every (attacker, target-candidate) scoring counts as
 * one node. Truncation is exact — at the boundary, `nodesVisited` equals
 * `budget` and no further candidates are considered.
 */
function tier2AttackPlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier,
  model: OpponentModel,
): AiResult<AiDecision<SquadAttackPlot>> {
  const context = buildSquadContext(state, catalog);
  let nodesVisited = 0;
  let candidateCount = 0;
  const rows: AttackDecisionRow[] = [];
  let currentRng: Rng = rng;

  for (const own of context.ownConstructs) {
    const candidates = generateAttackCandidates(state, own.base.id, catalog);
    candidateCount = candidateCount + candidates.length;
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
      if (c === undefined || c.targetId === null) continue;
      const target = state.constructs.find((k) => (k.base.id as number) === (c.targetId as number));
      if (target === undefined) continue;
      // Tier 2: use the target squad's observed posture frequency.
      const targetSquad = target.base.squadId as SquadId;
      const freq = postureFrequency(model, targetSquad);
      const scored = scoreAttackCandidate(
        own,
        target,
        c.called,
        freq.numer,
        freq.denom,
        catalog,
        weights,
      );
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

/* ------------------------------------------------------------------------- */
/* Tier 3 attack — beam search with anti-kingmaking                            */
/* ------------------------------------------------------------------------- */

/**
 * Rank squads by aggregate advantage: total damage dealt + surviving
 * alive-count. Higher rank = current leader. Used to power the anti-
 * kingmaking penalty: hitting the leader when the leader is ALREADY ahead
 * of the pack is discounted so the AI does not accelerate a runaway win.
 */
function squadAdvantageBySquadId(state: PublicState): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  for (const s of state.squads) {
    const dealt = s.totalDamageDealt;
    let integrity = 0;
    for (const c of state.constructs) {
      if ((c.base.squadId as number) !== (s.id as number)) continue;
      if (c.base.destroyed) continue;
      integrity = integrity + 1;
    }
    out.set(s.id as number, dealt + integrity);
  }
  return out;
}

/**
 * Compute leader margin over the second-place squad. Explicit total-order
 * comparator (engine sort ban requires it).
 */
function leaderMargin(adv: ReadonlyMap<number, number>): { readonly leaderId: number; readonly margin: number } {
  const rows = Array.from(adv.entries()).sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] - b[0];
  });
  const top = rows[0];
  const runner = rows[1];
  if (top === undefined) return { leaderId: -1, margin: 0 };
  if (runner === undefined) return { leaderId: top[0], margin: 0 };
  return { leaderId: top[0], margin: Math.max(0, top[1] - runner[1]) };
}

/**
 * Tier 3 attack decision. Same scoring as Tier 2 with an anti-kingmaking
 * penalty layered in when a clear leader exists; damage on the leader
 * scores lower than damage on non-leaders. Pool allocation is greedy over
 * the post-penalty scores; node accounting is exact.
 */
function tier3AttackPlot(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
  tier: AiTier,
  model: OpponentModel,
): AiResult<AiDecision<SquadAttackPlot>> {
  const context = buildSquadContext(state, catalog);
  let nodesVisited = 0;
  let candidateCount = 0;
  let currentRng: Rng = rng;

  const advantage = squadAdvantageBySquadId(state);
  const { leaderId, margin } = leaderMargin(advantage);
  const kingmakingScale = margin > 0 ? weights.kingmakingPenalty : 0;

  const rows: AttackDecisionRow[] = [];
  const damageByTarget = new Map<number, number>();

  for (const own of context.ownConstructs) {
    const candidates = generateAttackCandidates(state, own.base.id, catalog);
    candidateCount = candidateCount + candidates.length;
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
      if (c === undefined || c.targetId === null) continue;
      const target = state.constructs.find((k) => (k.base.id as number) === (c.targetId as number));
      if (target === undefined) continue;
      const targetSquad = target.base.squadId as SquadId;
      const freq = postureFrequency(model, targetSquad);
      const scored = scoreAttackCandidate(
        own,
        target,
        c.called,
        freq.numer,
        freq.denom,
        catalog,
        weights,
      );
      nodesVisited = nodesVisited + 1;
      const targetIsLeader = (targetSquad as number) === leaderId;
      const kingmakingPenalty = targetIsLeader ? kingmakingScale * scored.expectedDamage : 0;
      const adjusted = scored.score - kingmakingPenalty;
      const [nonce, r2] = nextRange(currentRng, 0, 1024);
      currentRng = r2;
      const composite = adjusted * 1024 + nonce;
      if (c.called) {
        const cur = calledBest.score * 1024;
        if (composite > cur) {
          calledBest = {
            targetId: c.targetId,
            score: adjusted,
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
            score: adjusted,
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
    const chosenTarget = normalBest.targetId ?? calledBest.targetId;
    if (chosenTarget !== null) {
      damageByTarget.set(
        chosenTarget as number,
        (damageByTarget.get(chosenTarget as number) ?? 0) + Math.max(normalBest.damage, calledBest.damage),
      );
    }
  }

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

  attacks.sort((a, b) => (a.constructId as number) - (b.constructId as number));
  postures.sort((a, b) => (a.constructId as number) - (b.constructId as number));

  let damageOnLeader = 0;
  let damageOnOthers = 0;
  for (const [tid, dmg] of damageByTarget) {
    const t = state.constructs.find((k) => (k.base.id as number) === tid);
    if (t === undefined) continue;
    if ((t.base.squadId as number) === leaderId) damageOnLeader = damageOnLeader + dmg;
    else damageOnOthers = damageOnOthers + dmg;
  }

  const scoreTerms: Record<string, number> = {
    calledCount: spendPlan.calledIds.size,
    postureCount: spendPlan.postureIds.size,
    poolSpent: spendPlan.spent,
    leaderMargin: margin,
    kingmakingScale,
    damageOnLeader,
    damageOnOthers,
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

/* ------------------------------------------------------------------------- */
/* Tier 3 movement — trace-schedule lookahead                                  */
/* ------------------------------------------------------------------------- */

/**
 * Tier 3 movement adds `weights.beamDepth` future-round lookahead over the
 * trace schedule. Positions that fall inside a future contraction's safe
 * region receive a discounted safety bonus; positions outside receive a
 * compounding penalty. Exposure / position utility / commander protection
 * still come from `scoreMoveEndpoint` unchanged.
 */
function tier3MovePlot(
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

  const lookaheadRounds = Math.max(1, weights.beamDepth);
  const futureSafeRegions = collectFutureSafeRegions(state, lookaheadRounds);

  for (const own of context.ownConstructs) {
    const candidates = generateMoveCandidates(state, own.base.id, catalog);
    candidateCount = candidateCount + candidates.length;
    if (candidates.length === 0) continue;
    if (nodesVisited >= (budget as number)) {
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
      const baseScored = scoreMoveEndpoint(state, own, c.endPosition, catalog, weights);
      nodesVisited = nodesVisited + 1;
      const [nonce, r2] = nextRange(currentRng, 0, 1024);
      currentRng = r2;
      let lookaheadBonus = 0;
      for (let k = 0; k < futureSafeRegions.length; k = k + 1) {
        const region = futureSafeRegions[k];
        if (region === undefined) continue;
        const discount = k + 1;
        if (pointInPolyLocal(c.endPosition, region)) {
          lookaheadBonus = lookaheadBonus + Math.floor(weights.traceSafetyBonus / discount);
        } else {
          lookaheadBonus = lookaheadBonus - Math.floor(weights.traceExposurePenalty / discount);
        }
      }
      const totalScore = baseScored.score + lookaheadBonus;
      const composite = totalScore * 1024 + nonce;
      if (composite > bestScore) {
        bestScore = composite;
        bestIndex = i;
      }
      scoreTerms["lookaheadBonus"] = (scoreTerms["lookaheadBonus"] ?? 0) + lookaheadBonus;
      scoreTerms["exposure"] = (scoreTerms["exposure"] ?? 0) + baseScored.terms.exposure;
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

/**
 * Collect safe regions for the current + next `lookaheadRounds` upcoming
 * schedule entries whose round <= state.round + lookaheadRounds.
 */
function collectFutureSafeRegions(
  state: PublicState,
  lookaheadRounds: number,
): readonly (readonly { readonly x: number; readonly y: number }[])[] {
  const schedule = state.map.traceSchedule;
  const out: (readonly { readonly x: number; readonly y: number }[])[] = [];
  const untilRound = state.round + lookaheadRounds;
  for (let i = 0; i < schedule.length; i = i + 1) {
    const step = schedule[i];
    if (step === undefined) continue;
    if (step.round > untilRound) break;
    out.push(step.safeRegion.map((v) => ({ x: v.x as unknown as number, y: v.y as unknown as number })));
  }
  return out;
}

function pointInPolyLocal(
  p: { readonly x: unknown; readonly y: unknown },
  polygon: readonly { readonly x: number; readonly y: number }[],
): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  const px = p.x as number;
  const py = p.y as number;
  for (let i = 0; i < n; i = i + 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cross === 0) {
      const xLo = a.x <= b.x ? a.x : b.x;
      const xHi = a.x >= b.x ? a.x : b.x;
      const yLo = a.y <= b.y ? a.y : b.y;
      const yHi = a.y >= b.y ? a.y : b.y;
      if (px >= xLo && px <= xHi && py >= yLo && py <= yHi) return true;
    }
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i = i + 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const aAbove = a.y > py;
    const bAbove = b.y > py;
    if (aAbove !== bAbove) {
      const cross = (px - a.x) * (b.y - a.y) - (py - a.y) * (b.x - a.x);
      const denomSign = b.y - a.y > 0 ? 1 : -1;
      if (cross * denomSign > 0) inside = !inside;
    }
  }
  return inside;
}
