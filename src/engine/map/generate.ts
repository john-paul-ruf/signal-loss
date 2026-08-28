import type { ArchetypeId, MapArchetype, Tunables } from "../catalog/index";
import { rngFromSeed, stream, nextRange } from "../rng/index";
import type {
  GameMap,
  MapGenerationDefect,
  MapResult,
  GateReport,
} from "./types";
import { buildGenerationContext } from "./generators/common";
import { generateGeometry } from "./generators/index";
import { runPlayabilityGate, type GateContext } from "./gate";

/**
 * Archetype selection API for `generateMap`. Either a specific id or
 * the sentinel "any" — the latter picks deterministically from the
 * seed at attempt 1 and retains that pick across every regeneration
 * (FR-10, session spec §Checkpoint 4).
 */
export type ArchetypeSelector =
  | { readonly kind: "id"; readonly id: ArchetypeId }
  | { readonly kind: "any" };

/**
 * Optional generation options. `gateContext` is spread onto the gate
 * call after the archetype and tunables are supplied by generateMap,
 * so callers can override cell size or measurement options without
 * duplicating those fields.
 */
export interface GenerateMapOptions {
  readonly gateCellSize?: GateContext["cellSize"];
  readonly gateWallIndexCellSize?: GateContext["wallIndexCellSize"];
  readonly gateMeasureOptions?: GateContext["measureOptions"];
}

/**
 * Deterministic generate → gate → retry loop. On success returns a
 * `MapResult` with the accepted map and every prior rejected report;
 * on `MAX_REGEN_ATTEMPTS` exhaustion throws a typed defect condition
 * (FR-11: "surfaced rather than looped on").
 *
 * The retry seed is derived by attaching a `#regen<n>` suffix to the
 * base seed for attempt `n ≥ 2`. Attempt 1 uses the base seed itself.
 * Rejection reports are collected verbatim so a harness can aggregate
 * pass rates per check across a large sample without re-running.
 */
export function generateMap(
  baseSeed: string,
  selector: ArchetypeSelector,
  archetypes: readonly MapArchetype[],
  tunables: Tunables,
  options: GenerateMapOptions = {},
): MapResult {
  const chosen = resolveArchetype(baseSeed, selector, archetypes);
  const maxAttempts = Math.max(1, tunables.MAX_REGEN_ATTEMPTS);
  const rejected: {
    readonly attempt: number;
    readonly derivedSeed: string;
    readonly report: GateReport;
  }[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt = attempt + 1) {
    const derivedSeed = attempt === 1 ? baseSeed : `${baseSeed}#regen${attempt - 1}`;
    const ctx = buildGenerationContext(derivedSeed, chosen, tunables);
    const geo = generateGeometry(ctx);
    const map: GameMap = {
      seed: baseSeed,
      acceptedAttempt: attempt,
      archetypeId: chosen.id,
      bounds: ctx.bounds,
      walls: geo.walls,
      spawns: geo.spawns,
      traceSchedule: geo.traceSchedule,
    };
    const gateCtx: GateContext = {
      tunables,
      archetype: chosen,
      cellSize: options.gateCellSize,
      wallIndexCellSize: options.gateWallIndexCellSize,
      measureOptions: options.gateMeasureOptions,
    };
    const report = runPlayabilityGate(map, gateCtx);
    if (report.passed) {
      return { map, rejectedReports: rejected };
    }
    rejected.push({ attempt, derivedSeed, report });
  }
  const defect: MapGenerationDefect = {
    kind: "MAX_REGEN_EXCEEDED",
    baseSeed,
    archetypeId: chosen.id,
    attempts: rejected,
  };
  throw new MaxRegenExceededError(defect);
}

/**
 * Typed defect thrown when `MAX_REGEN_ATTEMPTS` consecutive attempts
 * are all rejected by the gate. The full defect record is available
 * via `.defect` so the harness can surface every failure.
 */
export class MaxRegenExceededError extends Error {
  public readonly defect: MapGenerationDefect;

  public constructor(defect: MapGenerationDefect) {
    super(`generateMap: ${defect.attempts.length} consecutive attempts failed the FR-11 gate for seed ${JSON.stringify(defect.baseSeed)} and archetype ${JSON.stringify(defect.archetypeId as unknown as string)}.`);
    this.name = "MaxRegenExceededError";
    this.defect = defect;
  }
}

/**
 * Resolve a selector to a concrete archetype. `id`: look up by string
 * id. `any`: use the "archetype.any" named RNG stream on the base
 * seed to pick from `archetypes`. The result is DETERMINISTIC in the
 * base seed and does not shift with regeneration counts.
 */
export function resolveArchetype(
  baseSeed: string,
  selector: ArchetypeSelector,
  archetypes: readonly MapArchetype[],
): MapArchetype {
  if (archetypes.length === 0) {
    throw new RangeError("resolveArchetype: no archetypes supplied.");
  }
  if (selector.kind === "id") {
    for (let i = 0; i < archetypes.length; i = i + 1) {
      const a = archetypes[i];
      if (a === undefined) continue;
      if ((a.id as unknown as string) === (selector.id as unknown as string)) return a;
    }
    throw new RangeError(`resolveArchetype: no archetype with id ${JSON.stringify(selector.id as unknown as string)}.`);
  }
  // "any" — sort archetypes by code for a stable enumeration order,
  // then pick from a named stream on the base seed. Named-stream
  // isolation guarantees adding wall draws never shifts the pick.
  const sorted = archetypes.slice().sort((a, b) => (a.code as number) - (b.code as number));
  const rng = stream(rngFromSeed(baseSeed), "archetype.any");
  const [idx] = nextRange(rng, 0, sorted.length);
  const picked = sorted[idx];
  if (picked === undefined) {
    throw new Error("resolveArchetype: internal — nextRange returned an out-of-bounds index.");
  }
  return picked;
}
