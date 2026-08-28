/**
 * Placeholder AiWeights for AI test scenarios. Values chosen to exercise
 * every code path with clear, easy-to-reason-about integer arithmetic —
 * NOT to be balanced content. Session 06 will author release AI tunables
 * as part of the batteries.
 */

import type { AiWeights } from "../../../src/engine/ai/index";

export const testAiWeights: AiWeights = {
  // Value coefficients — damage is the base unit; specialty terms scale
  // relative to it.
  damageWeight: 10,
  killBonus: 40,
  commanderBonus: 20,
  commanderProtection: 30,
  traceSafetyBonus: 15,
  traceExposurePenalty: 20,
  exposurePenalty: 8,
  poolWastePenalty: 5,
  postureCost: 4,
  calledCost: 4,
  positionUtility: 6,
  kingmakingPenalty: 12,

  // Rate ratios: default = ~30% posture, ~40% called.
  postureRateNumer: 3,
  postureRateDenom: 10,
  calledRateNumer: 2,
  calledRateDenom: 5,
  postureExposureNumer: 1,
  postureExposureDenom: 4,

  // Search bounds.
  beamWidth: 6,
  beamDepth: 2,

  // Deployment scoring.
  deployCoverBonus: 4,
  deployTraceBonus: 12,
  deploySamples: 6,
};
