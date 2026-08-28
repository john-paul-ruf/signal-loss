# M15 — Worker entries

> **Path:** `./src/workers/`
> **Imports from:** M08, M10, M11
> **Status:** planned for full v1

## Public API
- Typed AI and map-generation request/response protocols
- Worker entry points suitable for Vite new URL bundling

## Internal Structure

| Area | Path |
|---|---|
| AI worker | `./src/workers/ai.worker.ts` |
| Map worker | `./src/workers/mapgen.worker.ts` |
| Protocol | `./src/workers/protocol.ts` |

## Conventions and Invariants
- AI requests contain PublicState only.
- Requests carry deterministic seed/stream and node budget, never time budget.
- Messages are structurally cloneable and return typed failures.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-05 -->

## SESSION-05 arch delta — M11 AI + M12 engine facade + M15 workers shipped

### M15 (src/workers/**) — protocol + entries, as shipped

```ts
// protocol.ts
const WORKER_PROTOCOL_VERSION = 1;

interface WorkerEnvelope { id: number; version: 1 }

interface AiRequestBase extends WorkerEnvelope {
  state: PublicState;               // FR-24 compile-time barrier: NOT MatchState.
  squadId: number;
  catalog: Catalog;
  seed: string;
  streamLabel: string;
  weights: AiWeights;
  nodeBudget: number;               // NEVER a time budget.
  tier: AiTier;
  opponentModel: OpponentModel;
}
type AiRequest =
  | ({ kind: "AI_DEPLOY" } & AiRequestBase)
  | ({ kind: "AI_MOVE" }   & AiRequestBase)
  | ({ kind: "AI_ATTACK" } & AiRequestBase)
  | { kind: "AI_ROSTER"; catalog; budget; seed; streamLabel } & WorkerEnvelope;

interface MapGenRequest extends WorkerEnvelope {
  kind: "MAP_GEN"; baseSeed; selector: ArchetypeSelector; archetypes; tunables;
}
type MapRequest = MapGenRequest;
type WorkerRequest = AiRequest | MapRequest;

type WorkerResponse =
  | { kind: "AI_DEPLOY_OK"; decision: AiDecision<readonly Placement[]> }
  | { kind: "AI_MOVE_OK";   decision: AiDecision<SquadMovePlots> }
  | { kind: "AI_ATTACK_OK"; decision: AiDecision<SquadAttackPlot> }
  | { kind: "AI_ROSTER_OK"; result: AiRosterResult }
  | { kind: "MAP_GEN_OK";   result: MapResult }
  | { kind: "ERROR"; errorKind: WorkerErrorKind; message; aiFailure?; mapDefect? };

type WorkerErrorKind =
  | "UNSUPPORTED_VERSION" | "UNKNOWN_REQUEST_KIND"
  | "AI_FAILURE" | "MAP_GENERATION_FAILURE" | "MAP_MAX_REGEN" | "INTERNAL_DEFECT";

// ai.worker.ts, mapgen.worker.ts
handleAiRequest(req: WorkerRequest): WorkerResponse;
handleMapRequest(req: WorkerRequest): WorkerResponse;
// Wired to self.addEventListener("message") at module load in Worker context.
```

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
