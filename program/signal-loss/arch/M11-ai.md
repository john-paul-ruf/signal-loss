# M11 — AI

> **Path:** `./src/engine/ai/`
> **Imports from:** M03, M04, M06, M08, M10
> **Status:** planned for full v1

## Public API
- generateAiRoster, aiDeploy, aiMovePlot, and aiAttackPlot
- Tiered policies bounded by deterministic node counts
- Derived-stat evaluator and per-opponent posture-frequency model

## Internal Structure

| Area | Path |
|---|---|
| Legal candidates | `./src/engine/ai/candidates.ts` |
| Evaluation | `./src/engine/ai/evaluate.ts` |
| Opponent model | `./src/engine/ai/model.ts` |
| Search | `./src/engine/ai/search.ts` |
| Policies | `./src/engine/ai/policy.ts` |

## Conventions and Invariants
- PublicState is the only world input.
- Tiers differ only in search and modelling quality, never rules or information.
- End every tie with seeded stream plus stable ID, never execution time.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-05 -->

## SESSION-05 arch delta — M11 AI + M12 engine facade + M15 workers shipped

### M11 (src/engine/ai/**) — public surface, as shipped

```ts
// types.ts
type AiTier = 1 | 2 | 3;
type NodeBudget = number & { readonly [brand]: "NodeBudget" };
nodeBudget(value: number): NodeBudget;

interface AiWeights {
  damageWeight; killBonus; commanderBonus; commanderProtection;
  traceSafetyBonus; traceExposurePenalty; exposurePenalty; poolWastePenalty;
  postureCost; calledCost; positionUtility; kingmakingPenalty;
  postureRateNumer; postureRateDenom; calledRateNumer; calledRateDenom;
  postureExposureNumer; postureExposureDenom;
  beamWidth; beamDepth;
  deployCoverBonus; deployTraceBonus; deploySamples;
}

interface AiDiagnostics { tier, nodesVisited, nodeBudget, candidateCount,
                          selectedIds, scoreTerms: Record<string, number> }
interface AiDecision<T>  { choice: T; diagnostics: AiDiagnostics; rng: Rng }

type AiFailure =
  | { kind: "NO_LEGAL_ROSTER";      message; budget }
  | { kind: "ROSTER_INVALID";       message; violations: readonly Violation[] }
  | { kind: "NO_LEGAL_DEPLOYMENT";  message; squadId }
  | { kind: "NO_LEGAL_CANDIDATES";  message; squadId }
  | { kind: "STATE_UNRESOLVED";     message }
type AiResult<T> = { ok: true; value: T } | { ok: false; error: AiFailure };

interface MoveCandidate    { constructId; path: readonly Vec2[]; endPosition: Vec2; index }
interface AttackCandidate  { constructId; targetId: ConstructId | null; called; index }
interface PostureCandidate { constructId; posture: "FLAT"|"POSTURE"; index }

// roster.ts
interface AiRosterResult { roster: Roster; rng: Rng }
generateAiRoster(rng, budget, catalog): AiResult<AiRosterResult>;

// deploy.ts
aiDeploy(state: PublicState, squad: SquadId, catalog,
         rng: Rng, weights: AiWeights, budget: NodeBudget)
  : AiResult<AiDecision<readonly Placement[]>>;

// candidates.ts
generateMoveCandidates(state, cid, catalog, fanOutAngles=8, radiiPerAngle=3)
  : readonly MoveCandidate[];
generateAttackCandidates(state, cid, catalog): readonly AttackCandidate[];
generatePostureCandidates(state, cid): readonly PostureCandidate[];
ownAliveConstructs(state, squad): readonly KnownConstruct[];
currentDialStateOf(known, catalog): DialState | undefined;
effectiveAttackRangeOf(known, catalog): Fx;
effectiveDamageOf(known, catalog): number;
effectiveDialLengthOf(known, catalog): number;

// evaluate.ts
interface AttackTerms { expectedDamage; killBonus; commanderBonus; calledCost }
interface ScoredAttack { score; expectedDamage; isKill; targetIsCommander; terms }
interface MoveTerms { exposure; exposurePenalty; traceSafety; positionUtility; commanderProtection }
interface ScoredMove { score; terms }
interface SquadContext { ownConstructs; exposureByOwnId; damageByOwnId; poolTotal; ownCommanderId }
buildSquadContext(state, catalog): SquadContext;
scoreAttackCandidate(attacker, target, called, postureFreqNumer, postureFreqDenom, catalog, weights): ScoredAttack;
scoreMoveEndpoint(state, mover, endpoint, catalog, weights): ScoredMove;
ownDialSummary(construct, catalog): { damage, rangeFx, integrityLeft };

// model.ts
interface PostureObservation { squadId; postureCount; flatCount }
interface OpponentModel { perSquad: readonly PostureObservation[] }
emptyOpponentModel(): OpponentModel;
updateOpponentModel(model, events): OpponentModel;   // Only POSTURE_REVEAL events shift counts
postureFrequency(model, squad, priorPosture=1, priorFlat=1): { numer, denom };
observationCount(model, squad): number;

// search.ts
interface NodeCounter { budget: number; visited: number }
interface Scored<T> { item: T; score: number; nonce: number }
chargeNode(counter: NodeCounter): boolean;
bestOf<T>(items, scorer, rng): { best: Scored<T> | null; rng };
topK<T>(items, scorer, k, rng): { beam: readonly Scored<T>[]; rng };

// policy.ts (public facade)
aiMovePlot(state: PublicState, squad, catalog, rng, weights, budget,
           tier: AiTier = 1, model: OpponentModel = emptyOpponentModel())
  : AiResult<AiDecision<SquadMovePlots>>;

aiAttackPlot(state: PublicState, squad, catalog, rng, weights, budget,
             tier: AiTier = 1, model: OpponentModel = emptyOpponentModel())
  : AiResult<AiDecision<SquadAttackPlot>>;
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
