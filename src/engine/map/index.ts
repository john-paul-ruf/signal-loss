/**
 * Public facade for the map module (M08). Consumers import from here;
 * internals under `./types`, `./generators/**`, `./analysis-grid`,
 * `./gate`, `./generate`, `./measure`, `./spatial-index`, and `./trace`
 * are implementation details and not part of the engine boundary.
 *
 * Public surface, per arch §3.6:
 *   • Types: GameMap, MapResult, GateReport, GateCheck, SpawnRegion,
 *     SpawnQuintet, TraceStep, WallSegment, ArchetypeMetrics,
 *     MapGenerationDefect, ArchetypeSelector.
 *   • Generation: generateMap, resolveArchetype, MaxRegenExceededError.
 *   • Gate: runPlayabilityGate, GATE_CHECK_ORDER, GateContext.
 *   • Measurement: measureArchetype, DEFAULT_MEASURE_OPTIONS,
 *     MeasureOptions.
 */

export type {
  GameMap,
  MapResult,
  MapGenerationDefect,
  GateReport,
  GateCheck,
  GateCheckId,
  SpawnRegion,
  SpawnQuintet,
  TraceStep,
  WallSegment,
  ArchetypeMetrics,
} from "./types";

export { GATE_CHECK_ORDER } from "./types";

export {
  generateMap,
  resolveArchetype,
  MaxRegenExceededError,
  type ArchetypeSelector,
  type GenerateMapOptions,
} from "./generate";

export {
  runPlayabilityGate,
  type GateContext,
} from "./gate";

export {
  measureArchetype,
  measureGameMap,
  DEFAULT_MEASURE_OPTIONS,
  type MeasureOptions,
} from "./measure";
