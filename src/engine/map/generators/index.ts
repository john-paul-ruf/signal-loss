import type { ArchetypeId } from "../../catalog/index";
import type { WallSegment } from "../types";
import type { Rng } from "../../rng/index";
import {
  RNG_LABELS,
  buildStandardTrace,
  placeStandardSpawns,
  subsystemStream,
  type GeneratedGeometry,
  type GenerationContext,
} from "./common";
import { generateDenseGridWalls } from "./dense-grid";
import { generateLongAvenuesWalls } from "./long-avenues";
import { generateOpenScatterWalls } from "./open-scatter";
import { generateMazeWalls } from "./maze";
import { generateArenaWalls } from "./arena";
import { generateAsymmetricRuinsWalls } from "./asymmetric-ruins";
import { generateHazardFieldWalls } from "./hazard-field";

/**
 * Look up the wall-generation strategy for an archetype id. Throws when
 * the id is unknown so callers cannot silently substitute a fallback —
 * the "any" case is resolved before this function is called.
 */
export function wallStrategyFor(
  id: ArchetypeId,
): (ctx: GenerationContext, rng: Rng) => readonly WallSegment[] {
  const raw = id as unknown as string;
  switch (raw) {
    case "dense-grid":
      return generateDenseGridWalls;
    case "long-avenues":
      return generateLongAvenuesWalls;
    case "open-scatter":
      return generateOpenScatterWalls;
    case "maze":
      return generateMazeWalls;
    case "arena":
      return generateArenaWalls;
    case "asymmetric-ruins":
      return generateAsymmetricRuinsWalls;
    case "hazard-field":
      return generateHazardFieldWalls;
    default:
      throw new RangeError(`generators: no strategy for archetype id ${JSON.stringify(raw)}.`);
  }
}

/**
 * Produce the full geometry for one attempt. Walls, spawns, and trace
 * are drawn from independent named streams so a change to one
 * subsystem's parameter never shifts another.
 */
export function generateGeometry(ctx: GenerationContext): GeneratedGeometry {
  const wallRng = subsystemStream(ctx, RNG_LABELS.walls);
  const spawnRng = subsystemStream(ctx, RNG_LABELS.spawns);
  const traceRng = subsystemStream(ctx, RNG_LABELS.trace);
  const walls = wallStrategyFor(ctx.archetype.id)(ctx, wallRng);
  const spawns = placeStandardSpawns(ctx, spawnRng);
  const traceSchedule = buildStandardTrace(ctx, traceRng);
  return { walls, spawns, traceSchedule };
}
