/**
 * Per-opponent posture-frequency model (M11 Tier 2 substrate).
 *
 * Constructed exclusively from resolved public `POSTURE_REVEAL` events;
 * never from private plot state, never from a "current" pre-reveal
 * observation. The model refuses to infer a hidden current choice — that
 * would violate FR-24's intent-only-secret invariant.
 *
 * Smoothing: additive priors (Beta-Bernoulli conjugate). `priorPosture`
 * observations of POSTURE and `priorFlat` observations of FLAT are added
 * to the raw counts before computing the frequency ratio, so the initial
 * (no-data) rate is `priorPosture / (priorPosture + priorFlat)`. The
 * default 1/2 prior corresponds to a Laplace-smoothed frequency that
 * remains non-extreme across neutral / short histories.
 *
 * Independence: each squad's observations are tracked in a separate row.
 * One squad's history never contaminates another's.
 */

import type { Event, SquadId } from "../match/index";
import { SQUAD_COUNT } from "../match/index";

/**
 * One squad's posture observation counts. Both counts start at 0 —
 * observations accumulate over resolved rounds.
 */
export interface PostureObservation {
  readonly squadId: number;
  readonly postureCount: number;
  readonly flatCount: number;
}

/**
 * The full model. `perSquad` is a length-5 tuple, indexed by squadId. Kept
 * as an array (not a Map) so it round-trips through canonical serialization
 * and postMessage without ceremony.
 */
export interface OpponentModel {
  readonly perSquad: readonly PostureObservation[];
}

/**
 * A prior-free empty model — all counts 0. Callers use this at match start.
 */
export function emptyOpponentModel(): OpponentModel {
  const perSquad: PostureObservation[] = [];
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    perSquad.push({ squadId: sq, postureCount: 0, flatCount: 0 });
  }
  return { perSquad };
}

/**
 * Fold a batch of resolved events into the model, incrementing per-squad
 * posture / flat counts for every `POSTURE_REVEAL` seen. Every other
 * event kind is ignored. The returned model is a NEW value — callers may
 * safely retain the input for replay.
 *
 * Only POSTURE_REVEAL events carry authoritative posture information; the
 * function checks the kind explicitly rather than reading any auxiliary
 * field. That way an accidental event with a `posture` field but the
 * wrong `kind` cannot pollute the model.
 */
export function updateOpponentModel(
  model: OpponentModel,
  events: readonly Event[],
): OpponentModel {
  const counts = model.perSquad.map((row) => ({
    squadId: row.squadId,
    postureCount: row.postureCount,
    flatCount: row.flatCount,
  }));
  for (const e of events) {
    if (e.kind !== "POSTURE_REVEAL") continue;
    const sq = e.squadId as number;
    if (sq < 0 || sq >= SQUAD_COUNT) continue;
    const row = counts[sq];
    if (row === undefined) continue;
    if (e.posture === "POSTURE") {
      counts[sq] = { ...row, postureCount: row.postureCount + 1 };
    } else if (e.posture === "FLAT") {
      counts[sq] = { ...row, flatCount: row.flatCount + 1 };
    }
  }
  return { perSquad: counts };
}

/**
 * Smoothed posture frequency for one squad. Returns numer/denom as
 * integers — callers use them directly with `scoreAttackCandidate`'s
 * ratio parameters without any float conversion. The default (1, 1)
 * Laplace prior guarantees `0 < numer < denom` even when the row has no
 * observations, so the returned ratio is never hardcoded 0 or 1.
 */
export function postureFrequency(
  model: OpponentModel,
  squad: SquadId,
  priorPosture = 1,
  priorFlat = 1,
): { readonly numer: number; readonly denom: number } {
  const row = model.perSquad[squad as number];
  const p = (row?.postureCount ?? 0) + priorPosture;
  const f = (row?.flatCount ?? 0) + priorFlat;
  return { numer: p, denom: p + f };
}

/**
 * Total observations for a squad — the raw count without priors. Useful
 * for tests that need to assert "no update before reveal".
 */
export function observationCount(model: OpponentModel, squad: SquadId): number {
  const row = model.perSquad[squad as number];
  if (row === undefined) return 0;
  return row.postureCount + row.flatCount;
}
