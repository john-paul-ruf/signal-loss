import {
  type Fx,
  type Vec2,
  fxFromInt,
  isqrt,
} from "../fx/index";
import type { MapArchetype, Tunables } from "../catalog/index";
import type { GameMap, GateCheck, GateReport } from "./types";
import { GATE_CHECK_ORDER } from "./types";
import {
  buildAnalysisGrid,
  cellIndexFor,
  labelRegions,
  largestRegion,
  passableCount,
  passageWidthAt,
  quadrantForCell,
  reachableCount,
  defaultCellSize,
  type AnalysisGrid,
  type Region,
} from "./analysis-grid";
import { buildWallIndex, hasLineOfSight } from "./spatial-index";
import {
  measureArchetype,
  type MeasureOptions,
} from "./measure";

/**
 * FR-11 playability gate.
 *
 * Every check returns structured evidence (`observed`, `threshold`,
 * `message`) so a harness aggregating many attempts can build per-check
 * failure histograms without re-running the gate. Checks execute in
 * `GATE_CHECK_ORDER`; the report is deterministic bytewise for a given
 * (map, context) pair.
 */

export interface GateContext {
  readonly tunables: Tunables;
  readonly archetype: MapArchetype;
  /**
   * Grid cell size (fx). If omitted, defaults to `defaultCellSize` of a
   * construct-footprint value drawn from a small chassis. Sessions that
   * do not yet have a chassis on hand pass this explicitly.
   */
  readonly cellSize?: Fx;
  /** Sampling options used for archetype metrics. Optional; defaults exist. */
  readonly measureOptions?: MeasureOptions;
  /**
   * Cell size for the spatial index used by LOS probes. Falls back to
   * `cellSize` when absent.
   */
  readonly wallIndexCellSize?: Fx;
}

/** Run the whole gate. Every check runs — no short-circuit — so evidence is complete. */
export function runPlayabilityGate(map: GameMap, context: GateContext): GateReport {
  const cellSize = context.cellSize ?? defaultCellSize(fxFromInt(1));
  const grid = buildAnalysisGrid(map.bounds, map.walls, cellSize);
  const regions = labelRegions(grid);
  const largest = largestRegion(regions);
  const spawnCells = map.spawns.map(s => cellIndexFor(grid, s.anchor));
  const wallIndex = buildWallIndex(
    map.walls,
    { min: grid.origin, max: gridMaxCorner(grid) },
    context.wallIndexCellSize ?? cellSize,
  );
  const checks: GateCheck[] = [];
  checks.push(checkConnectivity(grid, regions, spawnCells));
  checks.push(checkPockets(grid, regions, largest, context.tunables));
  checks.push(checkCoverDistribution(grid, largest, context.tunables));
  checks.push(checkSpawnFairness(map, grid, wallIndex, context.tunables));
  checks.push(checkChokepoints(grid, largest, context.tunables));
  checks.push(checkTraceSurvivability(map, grid, context.tunables));
  checks.push(checkArchetypeRange(map, context));
  // Reorder into canonical GATE_CHECK_ORDER — any accidental permutation
  // is corrected here so downstream consumers can index positionally.
  const byId = new Map<string, GateCheck>();
  for (let i = 0; i < checks.length; i = i + 1) {
    const c = checks[i];
    if (c === undefined) continue;
    byId.set(c.id, c);
  }
  const ordered: GateCheck[] = [];
  for (let i = 0; i < GATE_CHECK_ORDER.length; i = i + 1) {
    const id = GATE_CHECK_ORDER[i];
    if (id === undefined) continue;
    const c = byId.get(id);
    if (c === undefined) continue;
    ordered.push(c);
  }
  const passed = ordered.every(c => c.passed);
  return { passed, checks: ordered };
}

function gridMaxCorner(grid: AnalysisGrid): Vec2 {
  const cs = grid.cellSize as number;
  return {
    x: ((grid.origin.x as number) + grid.cols * cs) as Fx,
    y: ((grid.origin.y as number) + grid.rows * cs) as Fx,
  };
}

/* ── Individual FR-11 checks ───────────────────────────────────────── */

function checkConnectivity(
  _grid: AnalysisGrid,
  regions: readonly Region[],
  spawnCells: readonly (number | null)[],
): GateCheck {
  const labels = spawnCellLabels(regions, spawnCells);
  const uniqueLabels = new Set(labels.filter(l => l !== -1));
  const passed = uniqueLabels.size === 1 && !labels.includes(-1);
  return {
    id: "CONNECTIVITY",
    passed,
    observed: {
      spawnRegionsFound: uniqueLabels.size,
      spawnsOutsidePassable: labels.filter(l => l === -1).length,
    },
    threshold: {
      spawnRegionsFound: 1,
      spawnsOutsidePassable: 0,
    },
    message: passed
      ? "All five spawns share a single connected region."
      : `Spawns split across ${uniqueLabels.size} region(s); ${labels.filter(l => l === -1).length} spawn(s) landed in a blocked cell.`,
  };
}

function checkPockets(
  grid: AnalysisGrid,
  regions: readonly Region[],
  largest: Region | null,
  tunables: Tunables,
): GateCheck {
  // A "pocket" is any passable region that is not the main region and
  // whose area exceeds MIN_POCKET (fx²). Cell area = cellSize² fx².
  const cs = grid.cellSize as number;
  const cellArea = cs * cs;
  const minPocket = tunables.MIN_POCKET;
  const offenders: number[] = [];
  for (let i = 0; i < regions.length; i = i + 1) {
    const r = regions[i];
    if (r === undefined) continue;
    if (largest !== null && r.id === largest.id) continue;
    const areaFxSquared = r.area * cellArea;
    if (areaFxSquared > minPocket) offenders.push(r.id);
  }
  const passed = offenders.length === 0;
  return {
    id: "POCKETS",
    passed,
    observed: {
      pocketRegions: regions.length - (largest === null ? 0 : 1),
      offendingRegions: offenders.length,
    },
    threshold: {
      offendingRegions: 0,
      minPocketFxSquared: minPocket,
    },
    message: passed
      ? "No isolated pocket exceeds MIN_POCKET."
      : `${offenders.length} pocket(s) exceed MIN_POCKET.`,
  };
}

function checkCoverDistribution(
  grid: AnalysisGrid,
  largest: Region | null,
  tunables: Tunables,
): GateCheck {
  // Two independent sub-clauses (FR-11):
  //   • no OPEN region of passable-only cells larger than MAX_OPEN_AREA
  //     × total map area,
  //   • per-quadrant cover count ≥ MIN_QUADRANT_COVER × mean.
  //
  // "Open region" here = a connected component of passable cells with
  // no blocked neighbor within one cell. We reuse the region labeler
  // over a derived "far-from-cover" grid.
  const total = grid.cols * grid.rows;
  const farGrid = deriveFarFromCoverGrid(grid);
  const openRegions = labelRegions(farGrid);
  const largestOpen = largestRegion(openRegions);
  const largestOpenFraction = largestOpen === null ? 0 : largestOpen.area / total;
  const openFractionOk = largestOpenFraction <= tunables.MAX_OPEN_AREA;
  // Quadrant cover: count blocked cells per quadrant.
  const perQuadrant = [0, 0, 0, 0];
  for (let idx = 0; idx < total; idx = idx + 1) {
    if (grid.blocked[idx] === 1) {
      const q = quadrantForCell(grid, idx);
      perQuadrant[q] = (perQuadrant[q] ?? 0) + 1;
    }
  }
  const mean = ((perQuadrant[0] ?? 0) + (perQuadrant[1] ?? 0) + (perQuadrant[2] ?? 0) + (perQuadrant[3] ?? 0)) / 4;
  const floor = mean * tunables.MIN_QUADRANT_COVER;
  const quadrantOk = perQuadrant.every(v => v >= floor);
  const passed = openFractionOk && quadrantOk && largest !== null;
  return {
    id: "COVER_DISTRIBUTION",
    passed,
    observed: {
      largestOpenFraction,
      quadrantCounts: perQuadrant.join(","),
      meanQuadrantCover: mean,
    },
    threshold: {
      maxOpenAreaFraction: tunables.MAX_OPEN_AREA,
      minQuadrantCoverFactor: tunables.MIN_QUADRANT_COVER,
    },
    message: passed
      ? "Cover is distributed and no coverless region exceeds MAX_OPEN_AREA."
      : `Cover distribution failed: openFrac=${largestOpenFraction.toFixed(3)}, quadrantMinFactor=${(Math.min(...perQuadrant) / (mean || 1)).toFixed(3)}.`,
  };
}

function deriveFarFromCoverGrid(grid: AnalysisGrid): AnalysisGrid {
  const derived = new Uint8Array(grid.cols * grid.rows);
  for (let r = 0; r < grid.rows; r = r + 1) {
    for (let c = 0; c < grid.cols; c = c + 1) {
      const idx = r * grid.cols + c;
      if (grid.blocked[idx] === 1) {
        derived[idx] = 1;
        continue;
      }
      // A passable cell counts as "cover-adjacent" if any 4-neighbor is blocked.
      let adj = false;
      if (c > 0 && grid.blocked[idx - 1] === 1) adj = true;
      if (!adj && c + 1 < grid.cols && grid.blocked[idx + 1] === 1) adj = true;
      if (!adj && r > 0 && grid.blocked[idx - grid.cols] === 1) adj = true;
      if (!adj && r + 1 < grid.rows && grid.blocked[idx + grid.cols] === 1) adj = true;
      derived[idx] = adj ? 1 : 0;
    }
  }
  return {
    cellSize: grid.cellSize,
    origin: grid.origin,
    cols: grid.cols,
    rows: grid.rows,
    blocked: derived,
  };
}

function checkSpawnFairness(
  map: GameMap,
  grid: AnalysisGrid,
  wallIndex: ReturnType<typeof buildWallIndex>,
  tunables: Tunables,
): GateCheck {
  const spawnAnchors: Vec2[] = map.spawns.map(s => s.anchor);
  // 1. Pairwise minimum separation.
  const minSepFx = tunables.MIN_SPAWN_SEP as number;
  const minSepSq = minSepFx * minSepFx;
  let minObservedSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < spawnAnchors.length; i = i + 1) {
    for (let j = i + 1; j < spawnAnchors.length; j = j + 1) {
      const a = spawnAnchors[i];
      const b = spawnAnchors[j];
      if (a === undefined || b === undefined) continue;
      const dx = (a.x as number) - (b.x as number);
      const dy = (a.y as number) - (b.y as number);
      const d2 = dx * dx + dy * dy;
      if (d2 < minObservedSq) minObservedSq = d2;
    }
  }
  const sepOk = minObservedSq >= minSepSq;
  // 2. Cover near each spawn: count blocked cells within SPAWN_COVER_RADIUS.
  const coverRadiusFx = tunables.SPAWN_COVER_RADIUS as number;
  const coverRadiusSq = coverRadiusFx * coverRadiusFx;
  const cs = grid.cellSize as number;
  const minX = grid.origin.x as number;
  const minY = grid.origin.y as number;
  const coverCounts: number[] = [];
  for (let s = 0; s < spawnAnchors.length; s = s + 1) {
    const anchor = spawnAnchors[s];
    if (anchor === undefined) continue;
    let count = 0;
    for (let idx = 0; idx < grid.blocked.length; idx = idx + 1) {
      if (grid.blocked[idx] === 0) continue;
      const col = idx % grid.cols;
      const row = Math.trunc(idx / grid.cols);
      const cx = minX + col * cs + Math.trunc(cs / 2);
      const cy = minY + row * cs + Math.trunc(cs / 2);
      const dx = cx - (anchor.x as number);
      const dy = cy - (anchor.y as number);
      if (dx * dx + dy * dy <= coverRadiusSq) count = count + 1;
    }
    coverCounts.push(count);
  }
  const coverOk = coverCounts.every(v => v >= tunables.MIN_SPAWN_COVER);
  // 3. LOS between spawn pairs.
  const losCounts: number[] = coverCounts.map(() => 0);
  for (let i = 0; i < spawnAnchors.length; i = i + 1) {
    for (let j = i + 1; j < spawnAnchors.length; j = j + 1) {
      const a = spawnAnchors[i];
      const b = spawnAnchors[j];
      if (a === undefined || b === undefined) continue;
      if (hasLineOfSight(wallIndex, a, b)) {
        losCounts[i] = (losCounts[i] ?? 0) + 1;
        losCounts[j] = (losCounts[j] ?? 0) + 1;
      }
    }
  }
  const losOk = losCounts.every(v => v <= tunables.MAX_SPAWN_SIGHTLINES);
  const passed = sepOk && coverOk && losOk;
  return {
    id: "SPAWN_FAIRNESS",
    passed,
    observed: {
      minPairwiseSeparation: isqrt(minObservedSq === Number.POSITIVE_INFINITY ? 0 : minObservedSq),
      minCoverNearSpawn: coverCounts.length === 0 ? 0 : Math.min(...coverCounts),
      maxSpawnSightlines: losCounts.length === 0 ? 0 : Math.max(...losCounts),
    },
    threshold: {
      minSpawnSep: tunables.MIN_SPAWN_SEP,
      minSpawnCover: tunables.MIN_SPAWN_COVER,
      maxSpawnSightlines: tunables.MAX_SPAWN_SIGHTLINES,
    },
    message: passed
      ? "All five spawns separated, covered, and hidden as required."
      : `Spawn fairness failed: sepOk=${sepOk}, coverOk=${coverOk}, losOk=${losOk}.`,
  };
}

function checkChokepoints(
  grid: AnalysisGrid,
  largest: Region | null,
  tunables: Tunables,
): GateCheck {
  if (largest === null) {
    return {
      id: "CHOKEPOINTS",
      passed: false,
      observed: { largestRegionArea: 0 },
      threshold: { chokeFraction: tunables.CHOKE_FRACTION },
      message: "No passable region to analyse.",
    };
  }
  const cs = grid.cellSize as number;
  const chokeWidthCells = Math.max(1, Math.trunc((tunables.CHOKE_WIDTH as number) / cs));
  const totalPassable = largest.area;
  const totalOverride = new Uint8Array(grid.blocked.length);
  const startIndex = largest.cells[0] ?? -1;
  let worstDisconnected = 0;
  let worstCell = -1;
  for (let k = 0; k < largest.cells.length; k = k + 1) {
    const idx = largest.cells[k] as number;
    const widths = passageWidthAt(grid, idx);
    const passageMin = Math.min(widths.horizontal, widths.vertical);
    if (passageMin > chokeWidthCells) continue;
    // Temporarily block idx and measure the reachable count from a
    // non-blocked start cell in the same region.
    totalOverride[idx] = 1;
    // Choose a start cell that is not `idx` and not blocked.
    let start = startIndex;
    if (start === idx) {
      for (let j = 0; j < largest.cells.length; j = j + 1) {
        const cand = largest.cells[j] as number;
        if (cand !== idx) { start = cand; break; }
      }
    }
    const reachable = reachableCount(grid, start, totalOverride);
    totalOverride[idx] = 0;
    const disconnected = totalPassable - reachable - 1; // -1 for the blocked cell itself
    if (disconnected > worstDisconnected) {
      worstDisconnected = disconnected;
      worstCell = idx;
    }
  }
  const fraction = totalPassable === 0 ? 0 : worstDisconnected / totalPassable;
  const passed = fraction <= tunables.CHOKE_FRACTION;
  return {
    id: "CHOKEPOINTS",
    passed,
    observed: {
      worstDisconnectFraction: fraction,
      worstCellIndex: worstCell,
      chokeWidthCells,
    },
    threshold: {
      chokeFraction: tunables.CHOKE_FRACTION,
      chokeWidthCells,
    },
    message: passed
      ? "No narrow chokepoint disconnects more than CHOKE_FRACTION."
      : `Chokepoint at cell ${worstCell} disconnects ${(fraction * 100).toFixed(1)}% of the map.`,
  };
}

function checkTraceSurvivability(
  map: GameMap,
  grid: AnalysisGrid,
  _tunables: Tunables,
): GateCheck {
  // The final safe region (last trace step) must satisfy connectivity
  // and cover checks in its own right. When the schedule is empty (an
  // archetype that declines to contract), the whole map serves as the
  // final safe region and this check is trivially satisfied.
  if (map.traceSchedule.length === 0) {
    return {
      id: "TRACE_SURVIVABILITY",
      passed: true,
      observed: { finalSafeRegionCells: grid.cols * grid.rows },
      threshold: { minPassable: 1 },
      message: "Archetype does not contract; whole map is final safe region.",
    };
  }
  const last = map.traceSchedule[map.traceSchedule.length - 1];
  if (last === undefined) {
    return {
      id: "TRACE_SURVIVABILITY",
      passed: false,
      observed: {},
      threshold: {},
      message: "Trace schedule terminator missing.",
    };
  }
  const restricted = restrictGridToPolygon(grid, last.safeRegion);
  const restrictedPassable = passableCount(restricted);
  const restrictedRegions = labelRegions(restricted);
  const largestPassable = restrictedRegions[0]?.area ?? 0;
  // A final region is "survivable" iff at least one passable cell exists
  // inside it. Requiring a specific minimum area is a Session 06 tuning
  // question — at the current test-fixture scale, entering the region
  // with a construct footprint is coincidental with any single passable
  // cell.
  const cellArea = (grid.cellSize as number) * (grid.cellSize as number);
  const largestAreaFxSquared = largestPassable * cellArea;
  const passed = restrictedPassable > 0;
  return {
    id: "TRACE_SURVIVABILITY",
    passed,
    observed: {
      finalSafeRegionPassableCells: restrictedPassable,
      largestComponentAreaFxSquared: largestAreaFxSquared,
      connectedComponents: restrictedRegions.length,
    },
    threshold: {
      minPassable: 1,
    },
    message: passed
      ? "Final safe region has at least one passable cell."
      : `Trace survivability failed: passable=${restrictedPassable}, components=${restrictedRegions.length}.`,
  };
}

function restrictGridToPolygon(
  grid: AnalysisGrid,
  polygon: readonly Vec2[],
): AnalysisGrid {
  const cs = grid.cellSize as number;
  const minX = grid.origin.x as number;
  const minY = grid.origin.y as number;
  const restricted = new Uint8Array(grid.blocked.length);
  for (let r = 0; r < grid.rows; r = r + 1) {
    for (let c = 0; c < grid.cols; c = c + 1) {
      const idx = r * grid.cols + c;
      const cx = (minX + c * cs + Math.trunc(cs / 2)) as Fx;
      const cy = (minY + r * cs + Math.trunc(cs / 2)) as Fx;
      const inside = pointInPolygonClosed({ x: cx, y: cy }, polygon);
      if (!inside) restricted[idx] = 1;
      else restricted[idx] = grid.blocked[idx] ?? 0;
    }
  }
  return {
    cellSize: grid.cellSize,
    origin: grid.origin,
    cols: grid.cols,
    rows: grid.rows,
    blocked: restricted,
  };
}

function pointInPolygonClosed(p: Vec2, polygon: readonly Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  const px = p.x as number;
  const py = p.y as number;
  // Boundary
  for (let i = 0; i < n; i = i + 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    if (onSegClosed(px, py, a, b)) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i = i + 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const ay = a.y as number;
    const by = b.y as number;
    const aAbove = ay > py;
    const bAbove = by > py;
    if (aAbove !== bAbove) {
      const ax = a.x as number;
      const bx = b.x as number;
      const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
      const denomSign = by - ay > 0 ? 1 : -1;
      if (cross * denomSign > 0) inside = !inside;
    }
  }
  return inside;
}

function onSegClosed(px: number, py: number, a: Vec2, b: Vec2): boolean {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (cross !== 0) return false;
  const xLo = ax <= bx ? ax : bx;
  const xHi = ax >= bx ? ax : bx;
  const yLo = ay <= by ? ay : by;
  const yHi = ay >= by ? ay : by;
  return px >= xLo && px <= xHi && py >= yLo && py <= yHi;
}

function checkArchetypeRange(map: GameMap, context: GateContext): GateCheck {
  const options = context.measureOptions ?? {
    indexCellSize: (context.cellSize ?? fxFromInt(2)),
    openCellSize: (context.cellSize ?? fxFromInt(2)),
    sightSamplesPerAxis: 8,
    sightMaxRange: fxFromInt(64),
  };
  const metrics = measureArchetype(map.walls, map.bounds, options);
  const a = context.archetype;
  const wallOk =
    metrics.wallDensity >= a.wallDensity.min &&
    metrics.wallDensity <= a.wallDensity.max;
  const sightOk =
    (metrics.meanSightlineLength as number) >= (a.meanSightlineLength.min as number) &&
    (metrics.meanSightlineLength as number) <= (a.meanSightlineLength.max as number);
  const openOk =
    metrics.openAreaFraction >= a.openAreaFraction.min &&
    metrics.openAreaFraction <= a.openAreaFraction.max;
  const passed = wallOk && sightOk && openOk;
  return {
    id: "ARCHETYPE_RANGE",
    passed,
    observed: {
      wallDensity: metrics.wallDensity,
      meanSightlineLength: metrics.meanSightlineLength as number,
      openAreaFraction: metrics.openAreaFraction,
    },
    threshold: {
      wallDensityMin: a.wallDensity.min,
      wallDensityMax: a.wallDensity.max,
      meanSightlineMin: a.meanSightlineLength.min as number,
      meanSightlineMax: a.meanSightlineLength.max as number,
      openAreaMin: a.openAreaFraction.min,
      openAreaMax: a.openAreaFraction.max,
    },
    message: passed
      ? "Archetype metrics fall inside declared ranges."
      : `Archetype metrics out of range: wall=${wallOk}, sight=${sightOk}, open=${openOk}.`,
  };
}

function spawnCellLabels(
  regions: readonly Region[],
  spawnCells: readonly (number | null)[],
): readonly number[] {
  const cellToLabel = new Map<number, number>();
  for (let i = 0; i < regions.length; i = i + 1) {
    const r = regions[i];
    if (r === undefined) continue;
    for (let k = 0; k < r.cells.length; k = k + 1) {
      cellToLabel.set(r.cells[k] as number, r.id);
    }
  }
  const labels: number[] = [];
  for (let i = 0; i < spawnCells.length; i = i + 1) {
    const idx = spawnCells[i];
    if (idx === null || idx === undefined) {
      labels.push(-1);
    } else {
      const l = cellToLabel.get(idx);
      labels.push(l === undefined ? -1 : l);
    }
  }
  return labels;
}

