# M12 — Engine facade

> **Path:** `./src/engine/index.ts`
> **Imports from:** M03–M11
> **Status:** planned for full v1

## Public API
- The complete supported browser/worker/harness import surface
- Re-exported public types and functions without exposing internal helpers

## Internal Structure

| Area | Path |
|---|---|
| Facade | `./src/engine/index.ts` |

## Conventions and Invariants
- Consumers import through this file once it exists.
- Keep exports deliberate and backward-compatible within v1.
- Do not add platform or framework references.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-05 -->

## SESSION-05 arch delta — M11 AI + M12 engine facade + M15 workers shipped

### M12 (src/engine/index.ts) — engine facade, as shipped

Single supported browser / worker / harness surface. Re-exports Fx (M03),
RNG (M04), Catalog (M05), Build (M06), Codec (M07), Map (M08), Match (M09),
View (M10), and AI (M11). No app / platform / worker exports. Consumers
should import from `./src/engine/index` (or the shorter `./src/engine`)
exclusively; deep-internal paths remain internal.

Naming collisions from cross-module `canonicalize` / `fnv1a64Hex` / `Result`
are disambiguated: `canonicalizeCatalog`, `canonicalizeMatch`,
`fnv1a64HexMatch`, `CatalogResult`, `MatchResult`. Codec's `FORMAT_VERSION`
is re-exported as `CODEC_FORMAT_VERSION`.


### Conventions and invariants (session-shipped decisions)

- **Information contract (FR-24):** every AI entry point (`aiDeploy`,
  `aiMovePlot`, `aiAttackPlot`, `AiRequest*`) takes `PublicState`, not
  `MatchState`. A `MatchState` is NOT structurally assignable to a
  `PublicState` — checked at compile time. `HumanDraftPlots` never
  appears on any AI signature.
- **Determinism (FR-29):** every AI decision is a pure function of
  `(publicState, squadId, catalog, rng, weights, budget, tier, model)`.
  Returned `Rng` is the advanced state; two calls with equal inputs
  produce byte-identical outputs including the rng. Tie-breaks use a
  seeded nonce with `(score * 1024 + nonce)` composite, so equal-score
  outcomes never depend on JS Array.sort stability.
- **No time reads:** no `Date.now` / `performance.now` / `Math.random`
  anywhere in `src/engine/ai/**` or `src/workers/**` (enforced by ESLint
  engine rules; workers manually reviewed).
- **Node budget accounting:** every scored candidate charges one node.
  Truncation is exact — `nodesVisited <= nodeBudget` always holds.
  Beyond budget: remaining constructs default to HOLD (moves) / NO-ATTACK
  (attacks), keeping the plot complete without over-count.
- **Tier fairness (FR-9):** tiers differ ONLY in search / model quality.
  No tier adjusts pool, budget, stats, visibility, legality, or catalog.
  Tier 1: greedy per-construct + data-driven called/posture rates.
  Tier 2: opponent posture-frequency blends the FLAT/POSTURE matrix cells.
  Tier 3: Tier-2 scoring + anti-kingmaking (leader-margin damage penalty)
  + trace-schedule lookahead for movement (`weights.beamDepth` rounds).
- **Anti-kingmaking:** leader margin computed from
  `totalDamageDealt + alive_construct_count`; damage on the leader
  scores `-kingmakingScale * expectedDamage`. Zero penalty when squads
  are level, so the AI does not artificially avoid strong plays in
  even matches.
- **Opponent model smoothing:** posture-frequency uses additive Beta-
  Bernoulli priors (default 1/2). Never returns `0/N` or `N/N` even
  under adversarial short histories — the "neither hardcoded 0 nor 1"
  invariant is a type-level guarantee via the priors.
- **Sort ban compliance:** every `Array.prototype.sort` call in the AI
  and workers passes an explicit total-order comparator that ends on a
  stable integer (id) tiebreak or a seeded nonce.
- **Worker isolation:** `src/workers/**` imports only from
  `src/engine/**`; no `src/app` or `src/platform` imports. `handleAiRequest`
  / `handleMapRequest` catch every thrown defect and return a typed
  `ERROR` response — the worker never fabricates a legal decision.
- **Structural cloneability:** every `WorkerRequest` / `WorkerResponse`
  round-trips through `structuredClone` (verified by test) so it is safe
  to `postMessage` across the main-thread / Worker boundary. Catalog's
  ReadonlyMap indexes clone through the algorithm.
