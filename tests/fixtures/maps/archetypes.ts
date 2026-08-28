/**
 * Test archetype definitions — one MapArchetype per required id. Metric
 * ranges are deliberately WIDE so generator output falls inside them
 * without any tuning; Session 06 owns the tight release ranges.
 */

import type {
  ArchetypeId,
  ArchetypeCode,
  MapArchetype,
} from "../../../src/engine/catalog/index";
import { fxFromInt } from "../../../src/engine/fx/index";

function make(
  id: string,
  code: number,
  name: string,
  parameters: Record<string, number>,
): MapArchetype {
  return {
    id: id as ArchetypeId,
    code: code as ArchetypeCode,
    name,
    wallDensity: { min: 0, max: 5 },
    meanSightlineLength: { min: fxFromInt(0), max: fxFromInt(2048) },
    openAreaFraction: { min: 0, max: 1 },
    parameters,
  };
}

export const testArchetypes: readonly MapArchetype[] = [
  make("dense-grid", 1, "DENSE GRID", { spacing: 6 }),
  make("long-avenues", 2, "LONG AVENUES", { avenueWidth: 8 }),
  make("open-scatter", 3, "OPEN SCATTER", { scatter: 3 }),
  make("maze", 4, "MAZE", { cellSize: 5, branchFactor: 2 }),
  make("arena", 5, "ARENA", { rimInset: 3, centralObstacles: 4 }),
  make("asymmetric-ruins", 6, "ASYMMETRIC RUINS", { skew: 2, clusters: 6, wallsPerCluster: 4 }),
  make("hazard-field", 7, "HAZARD FIELD", { hazards: 12, cover: 6 }),
];

/** Look up a test archetype by id or throw. */
export function testArchetype(id: string): MapArchetype {
  for (let i = 0; i < testArchetypes.length; i = i + 1) {
    const a = testArchetypes[i];
    if (a !== undefined && (a.id as unknown as string) === id) return a;
  }
  throw new Error(`testArchetype: no archetype for id ${JSON.stringify(id)}.`);
}
