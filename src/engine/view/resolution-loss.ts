/**
 * Resolution range and known-position bookkeeping (FR-25, AD-2).
 *
 * Effective resolution range for one construct:
 *   base = chassis.resolutionRange
 *   modifiers = sum(mount.rangeDelta)
 *   effective = clamp(base + modifiers, rangeClamp.min, rangeClamp.max)
 *
 * The value depends on the chassis and installed mounts only — dial
 * position does NOT affect resolution range (per AD-2). Callers pass a
 * runtime `MatchConstruct` and the catalog.
 *
 * `updateKnownPositions` computes the new per-observer per-subject
 * confirmation table given the current positions. Any observer construct
 * whose distance to the subject ≤ its resolution range confirms the
 * subject; otherwise the entry retains its last confirmed position and
 * round.
 *
 * The resolution rule is enforced HERE in the engine — the AI runs on
 * `PublicState`, which is fed by this projection. Fog is engine state,
 * not a UI effect.
 */

import type { Fx } from "../fx/index";
import { FX_ZERO, dist2, fxAdd, fxClamp, isqrt } from "../fx/index";
import type { Catalog } from "../catalog/index";
import type {
  ConstructId,
  KnownPositionEntry,
  MatchConstruct,
  MatchState,
  SquadId,
} from "../match/index";
import { SQUAD_COUNT } from "../match/index";

/**
 * Compute the effective resolution range for a construct (fx). Returns
 * 0 if the chassis fails to resolve.
 */
export function resolutionRangeOf(
  construct: MatchConstruct,
  catalog: Catalog,
): Fx {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) return FX_ZERO;
  let rangeDeltaSum = 0;
  for (const m of construct.mounts) {
    const mount = catalog.indexes.mountByCode.get(m.mountCode);
    if (mount === undefined) continue;
    rangeDeltaSum = rangeDeltaSum + (mount.rangeDelta as number);
  }
  const total = fxAdd(chassis.resolutionRange, rangeDeltaSum as Fx);
  return fxClamp(total, chassis.rangeClamp.min, chassis.rangeClamp.max);
}

/**
 * Return the movement allowance at construct's current dial state, in
 * fx. Used to size the drift radius on the observer's ghost display.
 * Returns 0 when the dial state is unresolved.
 */
export function movementAllowanceOf(
  construct: MatchConstruct,
  catalog: Catalog,
): Fx {
  const chassis = catalog.indexes.chassisByCode.get(construct.chassisCode);
  if (chassis === undefined) return FX_ZERO;
  const state = chassis.dial[construct.dialIndex] ?? chassis.dial[chassis.dial.length - 1];
  if (state === undefined) return FX_ZERO;
  return state.movementAllowance;
}

/**
 * Recompute `knownPositions` for the current state. Own-squad entries
 * are always confirmed at `state.round`. Enemy entries are refreshed the
 * moment ANY of the observer's alive constructs is within its
 * resolution range of the subject; otherwise the prior entry (position
 * + confirmedRound) is preserved.
 *
 * Returns a new MatchState with the updated table (sorted by
 * (observer asc, subject asc)). If nothing changes, the returned state
 * is still a new object (kept simple; callers don't rely on identity).
 */
export function updateKnownPositions(
  state: MatchState,
  catalog: Catalog,
): MatchState {
  // Index the prior table for O(1) lookup.
  const priorByKey = new Map<number, KnownPositionEntry>();
  for (const e of state.knownPositions) {
    priorByKey.set(compositeKey(e.observer, e.subject), e);
  }
  // Precompute each observer's constructs and their resolution ranges.
  const observerRanges = new Map<
    number,
    readonly {
      readonly construct: MatchConstruct;
      readonly range: number;
    }[]
  >();
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    const own: { readonly construct: MatchConstruct; readonly range: number }[] = [];
    for (const c of state.constructs) {
      if ((c.squadId as number) !== sq) continue;
      if (c.destroyed) continue;
      own.push({ construct: c, range: resolutionRangeOf(c, catalog) as number });
    }
    observerRanges.set(sq, own);
  }

  const next: KnownPositionEntry[] = [];
  for (let sq = 0; sq < SQUAD_COUNT; sq = sq + 1) {
    for (const subject of state.constructs) {
      const key = compositeKey(sq as SquadId, subject.id);
      const prior = priorByKey.get(key);
      // Own squad: always confirmed at the current round with current pos.
      if ((subject.squadId as number) === sq) {
        next.push({
          observer: sq as SquadId,
          subject: subject.id,
          position: subject.position,
          confirmedRound: state.round,
        });
        continue;
      }
      // Enemy squad: check any-observer-in-range.
      const observers = observerRanges.get(sq) ?? [];
      let confirmed = false;
      for (const o of observers) {
        const d2 = dist2(o.construct.position, subject.position);
        if (d2 <= o.range * o.range) {
          confirmed = true;
          break;
        }
      }
      if (confirmed) {
        next.push({
          observer: sq as SquadId,
          subject: subject.id,
          position: subject.position,
          confirmedRound: state.round,
        });
      } else if (prior !== undefined) {
        next.push(prior);
      } else {
        // Never confirmed and no prior entry — record a zero-confirmed
        // placeholder so downstream code has something to render.
        next.push({
          observer: sq as SquadId,
          subject: subject.id,
          position: subject.position,
          confirmedRound: 0,
        });
      }
    }
  }
  next.sort((a, b) => {
    const oa = a.observer as number;
    const ob = b.observer as number;
    if (oa !== ob) return oa - ob;
    return (a.subject as number) - (b.subject as number);
  });
  return { ...state, knownPositions: next };
}

/**
 * Compute the exact integer distance from `a` to `b` in fx. Used at the
 * projection boundary where a caller needs a scalar rather than the
 * squared distance the internals prefer.
 */
export function distanceFx(
  a: MatchConstruct,
  b: MatchConstruct,
): Fx {
  return isqrt(dist2(a.position, b.position)) as unknown as Fx;
}

/** Encode an (observer, subject) pair as an integer key. */
function compositeKey(observer: SquadId, subject: ConstructId): number {
  return (observer as number) * 1_000_000 + (subject as number);
}
