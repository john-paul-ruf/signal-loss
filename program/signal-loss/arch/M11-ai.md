# M11 — AI

> **Path:** `./src/engine/ai/`
> **Imports from:** M03, M04, M06, M08, M10
> **Status:** shipped in SESSION-05.

## Public API

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

// roster.ts / deploy.ts
interface AiRosterResult { roster: Roster; rng: Rng }
generateAiRoster(rng, budget, catalog): AiResult<AiRosterResult>;

aiDeploy(state: PublicState, squad: SquadId, catalog,
         rng: Rng, weights: AiWeights, budget: NodeBudget)
  : AiResult<AiDecision<readonly Placement[]>>;

// candidates.ts / evaluate.ts / model.ts / search.ts (internal helpers)
generateMoveCandidates / generateAttackCandidates / generatePostureCandidates
ownAliveConstructs / currentDialStateOf / effectiveAttackRangeOf / effectiveDamageOf / effectiveDialLengthOf

buildSquadContext(state, catalog): SquadContext;
scoreAttackCandidate(attacker, target, called, postureFreqNumer, postureFreqDenom, catalog, weights): ScoredAttack;
scoreMoveEndpoint(state, mover, endpoint, catalog, weights): ScoredMove;

interface OpponentModel { perSquad: readonly PostureObservation[] }
emptyOpponentModel(): OpponentModel;
updateOpponentModel(model, events): OpponentModel;              // only POSTURE_REVEAL events shift counts
postureFrequency(model, squad, priorPosture=1, priorFlat=1): { numer, denom };
observationCount(model, squad): number;

chargeNode(counter): boolean;
bestOf<T>(items, scorer, rng): { best: Scored<T> | null; rng };
topK<T>(items, scorer, k, rng): { beam: readonly Scored<T>[]; rng };

// policy.ts — public facade
aiMovePlot(state: PublicState, squad, catalog, rng, weights, budget,
           tier: AiTier = 1, model: OpponentModel = emptyOpponentModel())
  : AiResult<AiDecision<SquadMovePlots>>;

aiAttackPlot(state: PublicState, squad, catalog, rng, weights, budget,
             tier: AiTier = 1, model: OpponentModel = emptyOpponentModel())
  : AiResult<AiDecision<SquadAttackPlot>>;
```

## Internal Structure

| Area | Path |
|---|---|
| Types | `./src/engine/ai/types.ts` |
| Legal candidates | `./src/engine/ai/candidates.ts` |
| Evaluation | `./src/engine/ai/evaluate.ts` |
| Opponent model | `./src/engine/ai/model.ts` |
| Search | `./src/engine/ai/search.ts` |
| Roster / deploy | `./src/engine/ai/roster.ts`, `./src/engine/ai/deploy.ts` |
| Policies | `./src/engine/ai/policy.ts` |

## Conventions and Invariants

- **Information contract (FR-24):** every AI entry point (`aiDeploy`, `aiMovePlot`, `aiAttackPlot`) takes `PublicState`, not `MatchState`. `MatchState` is NOT structurally assignable to `PublicState` — checked at compile time (see M10). `HumanDraftPlots` never appears on any AI signature.
- **Determinism (FR-29):** every AI decision is a pure function of `(publicState, squadId, catalog, rng, weights, budget, tier, model)`. The returned `Rng` is the advanced state; two calls with equal inputs produce byte-identical outputs including the rng. Tie-breaks use a seeded nonce composite `(score * 1024 + nonce)` so equal-score outcomes never depend on `Array.prototype.sort` stability.
- **No time reads:** no `Date.now` / `performance.now` / `Math.random` anywhere in `./src/engine/ai/**` (enforced by ESLint engine rules).
- **Node-budget accounting:** every scored candidate charges one node. Truncation is exact — `nodesVisited ≤ nodeBudget` always holds. Beyond budget, remaining constructs default to HOLD (moves) / NO-ATTACK (attacks), keeping the plot complete without over-count.
- **Tier fairness (FR-9):** tiers differ ONLY in search / model quality. No tier adjusts pool, budget, stats, visibility, legality, or catalog.
  - **Tier 1:** greedy per-construct + data-driven called / posture rates.
  - **Tier 2:** opponent posture-frequency blends the FLAT / POSTURE matrix cells via Beta-Bernoulli-smoothed observations.
  - **Tier 3:** Tier-2 scoring + anti-kingmaking (leader-margin damage penalty) + trace-schedule lookahead for movement (`weights.beamDepth` rounds).
- **Anti-kingmaking:** leader margin computed from `totalDamageDealt + alive_construct_count`; damage on the leader scores `-kingmakingScale * expectedDamage`. Zero penalty when squads are level, so the AI does not artificially avoid strong plays in even matches.
- **Opponent model smoothing:** posture-frequency uses additive Beta-Bernoulli priors (default 1/2). Never returns `0/N` or `N/N` even under adversarial short histories — a type-level guarantee via the priors.
- **Sort-ban compliance:** every `Array.prototype.sort` call passes an explicit total-order comparator that ends on a stable integer (id) tiebreak or a seeded nonce.
- **Reserved weight:** `beamWidth` is not yet consumed by any tier. It is reserved for a future beam-over-squad-plots search that would materially exceed the current node budget; SESSION-06 tuning declined to enable it.
- **Named RNG stream labels:** production callers follow `ai.squad<N>.roster` / `ai.squad<N>.deploy` / `ai.squad<N>.move` / `ai.squad<N>.attack` so replay diffs stay stable. AI streams MUST NOT reuse M08's map-generation labels (`walls` / `hazards` / `spawns` / `trace` / `cosmetic`).

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-05 shipped `./src/engine/ai/**` with three deterministic tiers, shared derived-stat evaluator, Beta-Bernoulli opponent model, deterministic roster / deployment / candidate generators, seeded stable tie-breaks with `(score * 1024 + nonce)` composite, and exact `NodeBudget` accounting. 74 new AI / facade / worker tests. |
