/**
 * Release AiWeights. These are the coefficients Session 06 tunes as it
 * runs the batteries — Checkpoint 4 (behavior) iterates on the ratios
 * until every FR-23 named check passes. The initial values here are
 * deliberately conservative:
 *
 *   • Kill / commander / posture / called weights all lie in [-40, 40],
 *     integer, so no float ever enters scoring (§4.1).
 *   • Rate ratios use integer (numer, denom) pairs so posture and called
 *     frequencies never require a float.
 *   • Node-budget-related coefficients (beamWidth, beamDepth) are set for
 *     Tier 3 lookahead depth 2, matching design.md's "brief peek" phrasing.
 *
 * The catalog / tunables layer never sees these values; they are Harness /
 * Worker-side inputs to the pure engine's AI functions.
 */

import type { AiWeights } from "../../../src/engine/index";

export const releaseAiWeights: AiWeights = {
  damageWeight: 10,
  killBonus: 40,
  commanderBonus: 24,
  commanderProtection: 30,
  traceSafetyBonus: 18,
  traceExposurePenalty: 22,
  exposurePenalty: 8,
  poolWastePenalty: 5,
  postureCost: 4,
  calledCost: 4,
  positionUtility: 6,
  kingmakingPenalty: 12,
  postureRateNumer: 3,
  postureRateDenom: 10,
  calledRateNumer: 2,
  calledRateDenom: 5,
  postureExposureNumer: 1,
  postureExposureDenom: 4,
  beamWidth: 6,
  beamDepth: 2,
  deployCoverBonus: 4,
  deployTraceBonus: 12,
  deploySamples: 8,
};
