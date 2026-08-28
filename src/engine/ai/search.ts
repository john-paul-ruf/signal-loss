/**
 * Deterministic bounded search primitives (M11 Tier 2 / Tier 3).
 *
 * `oneOfMany`: enumerate candidates in stable order (constructId ASC,
 * candidate.index ASC), score each with the caller's scoring function,
 * count every evaluated node against the shared budget, and return the
 * highest-scoring choice. Truncation is EXACT — at the boundary, node
 * count == budget and no further candidates are considered.
 *
 * `beamStep`: a bounded beam of the top-N scored items. Used by Tier 3 to
 * carry the K best partial choices forward across a depth-D expansion.
 * Ordering ties break on a seeded nonce so equal-scored beams never rely
 * on JS Array.sort stability across engines.
 */

import type { Rng } from "../rng/index";
import { nextRange } from "../rng/index";

/* ------------------------------------------------------------------------- */
/* Node counter                                                                */
/* ------------------------------------------------------------------------- */

/** Mutable node counter shared across a single decision. */
export interface NodeCounter {
  budget: number;
  visited: number;
}

/**
 * Increment the counter; return true if the caller may score this node,
 * false if the budget has already been consumed. Callers MUST honor the
 * result — a return of false means "stop scoring more nodes".
 */
export function chargeNode(counter: NodeCounter): boolean {
  if (counter.visited >= counter.budget) return false;
  counter.visited = counter.visited + 1;
  return true;
}

/* ------------------------------------------------------------------------- */
/* Best-of                                                                     */
/* ------------------------------------------------------------------------- */

export interface Scored<T> {
  readonly item: T;
  readonly score: number;
  readonly nonce: number;
}

/**
 * Enumerate `items` in the caller-supplied order, score each via `score`,
 * and return the best-scoring one with a seeded stable tiebreak. The
 * caller charges nodes to `counter` via `chargeNode`; this helper does
 * NOT charge nodes itself so callers with multi-term scoring can control
 * accounting precisely.
 *
 * Ties: the composite score is `score * TIE_SCALE + nonce`, where the
 * nonce is a per-item uint drawn from `rng`. Two calls with equal rng and
 * inputs return byte-identical results.
 */
export function bestOf<T>(
  items: readonly T[],
  scorer: (item: T, index: number) => number,
  rng: Rng,
): { readonly best: Scored<T> | null; readonly rng: Rng } {
  const TIE_SCALE = 1024;
  let currentRng: Rng = rng;
  let best: Scored<T> | null = null;
  for (let i = 0; i < items.length; i = i + 1) {
    const item = items[i];
    if (item === undefined) continue;
    const s = scorer(item, i);
    const [nonce, r2] = nextRange(currentRng, 0, TIE_SCALE);
    currentRng = r2;
    if (best === null || s * TIE_SCALE + nonce > best.score * TIE_SCALE + best.nonce) {
      best = { item, score: s, nonce };
    }
  }
  return { best, rng: currentRng };
}

/* ------------------------------------------------------------------------- */
/* Beam                                                                         */
/* ------------------------------------------------------------------------- */

/**
 * Score every item, retain the top-K by composite score, return them in
 * DESCENDING score order (best first). Ties use seeded stable tiebreak.
 * Callers charge node accounting externally.
 */
export function topK<T>(
  items: readonly T[],
  scorer: (item: T, index: number) => number,
  k: number,
  rng: Rng,
): { readonly beam: readonly Scored<T>[]; readonly rng: Rng } {
  const TIE_SCALE = 1024;
  let currentRng: Rng = rng;
  const scored: Scored<T>[] = [];
  for (let i = 0; i < items.length; i = i + 1) {
    const item = items[i];
    if (item === undefined) continue;
    const s = scorer(item, i);
    const [nonce, r2] = nextRange(currentRng, 0, TIE_SCALE);
    currentRng = r2;
    scored.push({ item, score: s, nonce });
  }
  // Explicit total-order comparator (engine sort ban requires it).
  scored.sort((a, b) => {
    const ax = a.score * TIE_SCALE + a.nonce;
    const bx = b.score * TIE_SCALE + b.nonce;
    return bx - ax;
  });
  const beam = scored.slice(0, Math.max(0, k));
  return { beam, rng: currentRng };
}
