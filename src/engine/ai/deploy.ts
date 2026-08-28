/**
 * Deterministic legal AI deployment (FR-12, FR-22).
 *
 * Takes the pre-deployment `PublicState` and the AI's squadId; returns one
 * legal `Placement` per roster construct assigned to that squad. Positions
 * fall inside the squad's spawn region and are footprint-clear of every
 * wall and of every previously-placed construct in the same call.
 *
 * The scorer favours:
 *   - proximity to cover (walls within the spawn cover radius tunable)
 *   - being inside the round-1 trace safe region (if the map declares one
 *     with `round <= 1`, otherwise this term is inert)
 *
 * Search is bounded by `nodeBudget` — the caller passes a positive integer
 * count of candidate positions to consider per construct; the sampler
 * enumerates that many candidates from a deterministic Halton-like sequence
 * over the region's AABB and rejects illegal ones.
 */

import type { Fx, Vec2 } from "../fx/index";
import { circleOverlap, pointInPoly } from "../fx/index";
import type { Catalog, ChassisCode } from "../catalog/index";
import type { Rng } from "../rng/index";
import { nextRange } from "../rng/index";
import type { KnownConstruct, PublicState } from "../view/index";
import type { Placement, SquadId } from "../match/index";
import type { WallSegment } from "../map/index";
import type {
  AiDecision,
  AiDiagnostics,
  AiResult,
  AiWeights,
  NodeBudget,
} from "./types";

/* ------------------------------------------------------------------------- */
/* aiDeploy                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Place every own construct legally inside the squad's spawn region.
 * Placements are assigned in construct-id order (which is stable and
 * deterministic per createMatch). Every returned placement is guaranteed
 * to satisfy `legalDeployment` for the same catalog + state.
 */
export function aiDeploy(
  state: PublicState,
  squad: SquadId,
  catalog: Catalog,
  rng: Rng,
  weights: AiWeights,
  budget: NodeBudget,
): AiResult<AiDecision<readonly Placement[]>> {
  const region = state.map.spawns[squad as number];
  if (region === undefined) {
    return {
      ok: false,
      error: {
        kind: "NO_LEGAL_DEPLOYMENT",
        message: `Squad ${squad as number} has no spawn region.`,
        squadId: squad,
      },
    };
  }
  // Every own construct — in id order — is deployed. rosterIndex is the
  // 0-based position among the squad's constructs (matches deployment's
  // expected index).
  const ownConstructs = state.constructs
    .filter((k) => (k.base.squadId as number) === (squad as number))
    .slice()
    .sort((a, b) => (a.base.id as number) - (b.base.id as number));

  const placed: Placement[] = [];
  let nodesVisited = 0;
  let currentRng: Rng = rng;
  let coverTotal = 0;
  let traceTotal = 0;
  const chosenIds: number[] = [];

  // AABB of the region.
  const aabb = polygonAABB(region.polygon);
  const boundsPoly = state.map.bounds;

  // Round-1 safe region — used only for scoring; a construct is legal
  // whether or not it is inside the safe region.
  const round1Safe: readonly Vec2[] | null = pickRound1SafeRegion(state);

  const samplesPerConstruct = Math.max(weights.deploySamples, budget as number);

  for (let idx = 0; idx < ownConstructs.length; idx = idx + 1) {
    const known = ownConstructs[idx];
    if (known === undefined) continue;
    const chassis = catalog.indexes.chassisByCode.get(known.base.chassisCode);
    if (chassis === undefined) {
      return {
        ok: false,
        error: {
          kind: "STATE_UNRESOLVED",
          message: `Chassis code ${known.base.chassisCode as number} not in catalog.`,
        },
      };
    }
    const footprint = chassis.footprint;
    let bestPos: Vec2 | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestCover = 0;
    let bestTrace = 0;
    const tryCandidate = (candidate: Vec2): void => {
      if (!isLegalPosition(
        candidate,
        footprint,
        region.polygon,
        boundsPoly,
        state.map.walls,
        placed,
        catalog,
        ownConstructs,
      )) return;
      nodesVisited = nodesVisited + 1;
      const scored = scorePosition(candidate, footprint, state.map.walls, round1Safe, weights);
      if (scored.score > bestScore) {
        bestScore = scored.score;
        bestPos = candidate;
        bestCover = scored.cover;
        bestTrace = scored.trace;
      }
    };
    // First candidate: the region's anchor — always guaranteed inside the
    // polygon by construction.
    const anchor = region.anchor;
    if (pointInPoly(anchor, region.polygon)) tryCandidate(anchor);
    // RNG-sampled candidates from the AABB.
    for (let s = 0; s < samplesPerConstruct; s = s + 1) {
      const [rx, r1] = nextRange(currentRng, aabb.min.x as number, (aabb.max.x as number) + 1);
      const [ry, r2] = nextRange(r1, aabb.min.y as number, (aabb.max.y as number) + 1);
      currentRng = r2;
      const candidate: Vec2 = { x: rx as Fx, y: ry as Fx };
      if (!pointInPoly(candidate, region.polygon)) continue;
      tryCandidate(candidate);
    }
    // Deterministic grid fallback — always runs to guarantee coverage of
    // tight regions where random samples may miss legal slots. Uses the
    // footprint diameter as the grid step so every disk-sized cell gets a
    // representative sample. The grid enumeration order is (col asc, row
    // asc) so results are input-order-independent.
    const step = Math.max(1, (footprint as number));
    const minX = aabb.min.x as number;
    const minY = aabb.min.y as number;
    const maxX = aabb.max.x as number;
    const maxY = aabb.max.y as number;
    for (let gy = minY; gy <= maxY; gy = gy + step) {
      for (let gx = minX; gx <= maxX; gx = gx + step) {
        const candidate: Vec2 = { x: gx as Fx, y: gy as Fx };
        if (!pointInPoly(candidate, region.polygon)) continue;
        tryCandidate(candidate);
      }
    }
    if (bestPos === null) {
      return {
        ok: false,
        error: {
          kind: "NO_LEGAL_DEPLOYMENT",
          message: `No legal placement for construct ${known.base.id as number} inside squad ${squad as number}'s spawn region.`,
          squadId: squad,
        },
      };
    }
    placed.push({ rosterIndex: idx, position: bestPos });
    chosenIds.push(known.base.id as number);
    coverTotal = coverTotal + bestCover;
    traceTotal = traceTotal + bestTrace;
  }

  const diagnostics: AiDiagnostics = {
    tier: 1,
    nodesVisited,
    nodeBudget: budget as number,
    candidateCount: ownConstructs.length * (samplesPerConstruct + 1),
    selectedIds: chosenIds,
    scoreTerms: {
      cover: coverTotal,
      trace: traceTotal,
    },
  };
  return {
    ok: true,
    value: {
      choice: placed,
      diagnostics,
      rng: currentRng,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

interface AABB {
  readonly min: Vec2;
  readonly max: Vec2;
}

/** Compute the AABB of a polygon (assumed at least 3 vertices). */
function polygonAABB(polygon: readonly Vec2[]): AABB {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const v of polygon) {
    const vx = v.x as number;
    const vy = v.y as number;
    if (vx < minX) minX = vx;
    if (vy < minY) minY = vy;
    if (vx > maxX) maxX = vx;
    if (vy > maxY) maxY = vy;
  }
  return {
    min: { x: minX as Fx, y: minY as Fx },
    max: { x: maxX as Fx, y: maxY as Fx },
  };
}

/**
 * Legality of a placement at position + footprint against the region /
 * bounds / walls / prior placements. Mirrors `legalDeployment` at the
 * public-state boundary.
 */
function isLegalPosition(
  position: Vec2,
  footprint: Fx,
  regionPolygon: readonly Vec2[],
  boundsPolygon: readonly Vec2[],
  walls: readonly WallSegment[],
  priorPlacements: readonly Placement[],
  catalog: Catalog,
  ownConstructs: readonly KnownConstruct[],
): boolean {
  if (!pointInPoly(position, regionPolygon)) return false;
  if (!pointInPoly(position, boundsPolygon)) return false;
  const r = footprint as number;
  for (const w of walls) {
    if (segmentDiskContact(w.a, w.b, position, r)) return false;
  }
  for (let i = 0; i < priorPlacements.length; i = i + 1) {
    const p = priorPlacements[i];
    if (p === undefined) continue;
    const other = ownConstructs[p.rosterIndex];
    if (other === undefined) continue;
    const otherChassis = catalog.indexes.chassisByCode.get(
      other.base.chassisCode as ChassisCode,
    );
    if (otherChassis === undefined) continue;
    if (circleOverlap(position, footprint, p.position, otherChassis.footprint)) {
      return false;
    }
  }
  return true;
}

/**
 * Position scorer: cover bonus per wall within `SPAWN_COVER_RADIUS`, plus
 * trace-safety bonus if inside the round-1 safe region.
 */
function scorePosition(
  position: Vec2,
  footprint: Fx,
  walls: readonly WallSegment[],
  round1Safe: readonly Vec2[] | null,
  weights: AiWeights,
): { readonly score: number; readonly cover: number; readonly trace: number } {
  const coverRadius = 4 * (footprint as number); // 4x footprint as a proxy cover radius (data-tuned by weights)
  let coverCount = 0;
  for (const w of walls) {
    // Use squared-distance check to the segment.
    if (segmentDiskContact(w.a, w.b, position, coverRadius)) coverCount = coverCount + 1;
  }
  const coverScore = coverCount * weights.deployCoverBonus;
  const inSafe = round1Safe !== null && pointInPoly(position, round1Safe);
  const traceScore = inSafe ? weights.deployTraceBonus : 0;
  return { score: coverScore + traceScore, cover: coverScore, trace: traceScore };
}

/**
 * Return the round-1 trace safe region if any schedule entry has
 * `round <= 1`; otherwise null. When null, all deployments score
 * identically on the trace-safety term.
 */
function pickRound1SafeRegion(state: PublicState): readonly Vec2[] | null {
  const schedule = state.map.traceSchedule;
  if (schedule.length === 0) return null;
  let latest: readonly Vec2[] | null = null;
  for (let i = 0; i < schedule.length; i = i + 1) {
    const step = schedule[i];
    if (step === undefined) continue;
    if (step.round <= 1) latest = step.safeRegion;
    else break;
  }
  return latest;
}

/**
 * True iff the closed segment ab is within `r` fx of point `c` (or crosses
 * it). Copied structurally from `deployment.ts` so this module has no
 * cross-boundary dependency into `match/`.
 */
function segmentDiskContact(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  r: number,
): boolean {
  const ax = a.x as number;
  const ay = a.y as number;
  const bx = b.x as number;
  const by = b.y as number;
  const cx = c.x as number;
  const cy = c.y as number;
  const dx = bx - ax;
  const dy = by - ay;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 === 0) {
    const px = cx - ax;
    const py = cy - ay;
    return px * px + py * py <= r * r;
  }
  const tNum = (cx - ax) * dx + (cy - ay) * dy;
  const t = Math.max(0, Math.min(segLen2, tNum));
  const px = ax * segLen2 + t * dx;
  const py = ay * segLen2 + t * dy;
  const qx = cx * segLen2;
  const qy = cy * segLen2;
  const ddx = px - qx;
  const ddy = py - qy;
  const lhs = BigInt(ddx) * BigInt(ddx) + BigInt(ddy) * BigInt(ddy);
  const rhs = BigInt(r) * BigInt(r) * BigInt(segLen2) * BigInt(segLen2);
  return lhs <= rhs;
}
