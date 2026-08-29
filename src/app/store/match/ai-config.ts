/**
 * Static AI input for match-entry deployment (M17, M02).
 *
 * The worker AI contract requires an explicit `AiWeights` plus a positive
 * `NodeBudget`. Production has no app-side source for these — the release
 * coefficients previously lived only in the harness fixture. `./data/ai.weights.json`
 * bundles them as authored app data; this module validates that document at
 * the browser boundary (FR-30: all-or-nothing, fail loudly) and exposes a
 * stable `MatchAiConfig`.
 *
 * The values are NOT part of the engine catalog / rule tunables — they are a
 * worker-side input to the pure AI functions. `deploymentNodeBudget` is small
 * because `aiDeploy` interprets the budget as candidate samples per construct,
 * not a movement search budget.
 */

import { nodeBudget, type AiTier, type AiWeights, type NodeBudget } from "../../../engine";
import aiWeightsDoc from "../../../../data/ai.weights.json";

/** The validated static AI input the match-entry deployment run consumes. */
export interface MatchAiConfig {
  readonly weights: AiWeights;
  readonly deploymentNodeBudget: NodeBudget;
  readonly plotNodeBudgets: Readonly<Record<AiTier, NodeBudget>>;
}

/** Every required `AiWeights` coefficient — the document must carry exactly these. */
const WEIGHT_KEYS = [
  "damageWeight",
  "killBonus",
  "commanderBonus",
  "commanderProtection",
  "traceSafetyBonus",
  "traceExposurePenalty",
  "exposurePenalty",
  "poolWastePenalty",
  "postureCost",
  "calledCost",
  "positionUtility",
  "kingmakingPenalty",
  "postureRateNumer",
  "postureRateDenom",
  "calledRateNumer",
  "calledRateDenom",
  "postureExposureNumer",
  "postureExposureDenom",
  "beamWidth",
  "beamDepth",
  "deployCoverBonus",
  "deployTraceBonus",
  "deploySamples",
] as const;

/** Denominators that would produce a divide-by-zero if non-positive. */
const POSITIVE_DENOM_KEYS = [
  "postureRateDenom",
  "calledRateDenom",
  "postureExposureDenom",
] as const;

function fail(reason: string): never {
  throw new Error(`ai.weights.json is malformed: ${reason}`);
}

function validateWeights(raw: unknown): AiWeights {
  if (raw === null || typeof raw !== "object") fail("`weights` must be an object.");
  const rec = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of WEIGHT_KEYS) {
    const value = rec[key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      fail(`weight \`${key}\` must be a finite integer.`);
    }
    out[key] = value;
  }
  for (const key of Object.keys(rec)) {
    if (!(WEIGHT_KEYS as readonly string[]).includes(key)) {
      fail(`unexpected weight key \`${key}\`.`);
    }
  }
  const weights = out as unknown as AiWeights;
  for (const key of POSITIVE_DENOM_KEYS) {
    if (weights[key] <= 0) fail(`weight \`${key}\` must be a positive denominator.`);
  }
  if (weights.deploySamples <= 0) fail("weight `deploySamples` must be positive.");
  return weights;
}

function resolve(): MatchAiConfig {
  const doc: unknown = aiWeightsDoc;
  if (doc === null || typeof doc !== "object") fail("document root must be an object.");
  const rec = doc as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (key !== "weights" && key !== "deploymentNodeBudget" && key !== "plotNodeBudgets") {
      fail(`unexpected top-level key \`${key}\`.`);
    }
  }
  const weights = validateWeights(rec["weights"]);
  const budget = rec["deploymentNodeBudget"];
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1) {
    fail("`deploymentNodeBudget` must be a positive integer.");
  }
  const rawPlotBudgets = rec["plotNodeBudgets"];
  if (rawPlotBudgets === null || typeof rawPlotBudgets !== "object") {
    fail("`plotNodeBudgets` must be an object.");
  }
  const plotBudgetRecord = rawPlotBudgets as Record<string, unknown>;
  const keys = Object.keys(plotBudgetRecord);
  if (keys.length !== 3 || keys.some((key) => key !== "1" && key !== "2" && key !== "3")) {
    fail("`plotNodeBudgets` must contain exactly tiers 1, 2, and 3.");
  }
  const plotNodeBudgets = {} as Record<1 | 2 | 3, NodeBudget>;
  for (const tier of [1, 2, 3] as const) {
    const value = plotBudgetRecord[String(tier)];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      fail(`plot node budget for tier ${tier} must be a positive integer.`);
    }
    plotNodeBudgets[tier] = nodeBudget(value);
  }
  return { weights, deploymentNodeBudget: nodeBudget(budget), plotNodeBudgets };
}

let cached: MatchAiConfig | null = null;

/** The validated, cached release AI config. Same reference every call. */
export function resolveMatchAiConfig(): MatchAiConfig {
  if (cached === null) cached = resolve();
  return cached;
}
