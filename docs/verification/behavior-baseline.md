# AI Behavior Baseline — match-surface-ai-fixes SESSION-03

> Supersedes the Session 06 checkpoint-4 baseline. Lease: CA-03 (FR-23 trace
> awareness hard gate), CAP-03. All numbers below were produced at plan HEAD
> weights (traceSafetyBonus 18, traceExposurePenalty 22 — see Tuning Record)
> on the release catalog (hash 18a634daecb23aef, tunables 81071539e5673d96).

## What changed this session

1. **Anticipatory movement scoring (all tiers).** `scoreMoveEndpoint` gains a
   next-contraction containment term: endpoints inside the next scheduled
   safe region (strictly after the current round) score
   `+traceSafetyBonus`, endpoints outside score `-traceExposurePenalty`.
   The full trace schedule is public from round 1 (FR-24), so this uses only
   public information. Structural lookahead depth 1 is documented in-code.
   `MoveTerms.traceAnticipation` is additive; tier-1 diagnostics aggregate it.
2. **Tier-3 strictly-future lookahead (replan R-01).**
   `collectFutureSafeRegions` previously collected every schedule entry with
   `step.round <= state.round + beamDepth` and had no lower bound — index 0
   was the earliest in-window entry (often a PAST step; from round ≥ 7 even
   the CURRENT region). It now collects strictly-future steps
   (`state.round < step.round <= state.round + lookaheadRounds`), scored at
   discount k+1 (first future step = 1). The base scorer owns current/next-step
   containment; tier-3 keeps the deeper window without a past-step recount or
   current-step double-count.
3. **TRACE_DISCIPLINE is a hard gate.** `passed = traceDeathRate <=
   tunables.TRACE_DEATH_CEILING` (0.4), replacing the constant `passed: true`
   informational stub. Self-tests prove the gate can fail: helper-level
   knock-down plus a full-battery lowered-ceiling knock-down (fixture
   tunables at 0.01 → check red, battery red).
4. **Deterministic trace-aware movement tie-break.** Movement composites are
   now `score * MOVE_COMPOSITE_UNIT + nextSafeRegionTiebreak(...) + nonce`:
   an rng-free, float-free progress measure ranks endpoints by fixed-point
   proximity to the next safe region (rank band [1, 4096] vs nonce range
   [0, 1024)). This removes the seeded nonce's deciding vote among
   equally-scored inward/outward candidates (R6 preserved — the nonce remains
   the only rng consumer).

## Checks (post-change, hard TRACE_DISCIPLINE)

| Check | Threshold | Observed (release sample, budget 100, --seeds 4) |
|-------|-----------|--------------------------------------------------|
| POOL_DISCIPLINE | overspend = 0 | 0 rounds — PASS |
| NODE_BUDGET_TRUNCATION | overflows = 0 | 0 decisions — PASS |
| CALLED_SHOT_RATE | informational | 1.000 (15/15 attacks) |
| POSTURE_RATE | informational | 0.001 (3/2178 construct-rounds) |
| NOT_NEAREST | informational | 0 of 5 tier-2 attacks (small sample) |
| NOT_LEADER | leader share ≤ 0.85 | 0.241 — PASS |
| TRACE_DISCIPLINE | **hard**: rate ≤ 0.4 | **0.939 (46/49) — FAIL (red battery)** |
| TIER_ORDERING | T3 ≥ T2 ≥ T1 wins | 2 / 2 / 2 — PASS |
| COMMANDER_DAMAGE | information-only | 15 commander kills |

Reproduction: `npm run harness -- behavior --seed release --seeds 4 --json`.

## Trace-death evidence

Per-tier trace-death rates at the release CLI sample (budget 100, seeds
release#0..3, terminal rounds 10/7/19/10): **0.939 at every tier**
(46 trace deaths / 49 total deaths per tier). Additional samples:
budget 25 (--seeds 2, behavior-check): 0.750 (6/8 per tier); budget 50
(--seeds 2, behavior-check): 0.889 (16/18 per tier). The rate is
**tier-invariant** — the trace schedule kills identically regardless of AI
decision quality, because every tier's scoring now acts on the same public
schedule and the surviving factor is geometric reachability.

The prior baseline's analysis ("movement allowances make reaching the safe
region difficult") is **superseded by the measured mechanism**, below: the
binding constraint is not allowance size alone but the candidate generator's
shape interacting with archetype geometry.

### Mechanism (probe evidence, seed release#0)

Trace schedule at board scale: contractions at rounds 4, 7, 10, … with
half-extents 29, 26, 23, … board units (65,536-fx board). Constructs deploy
at spawn corners (|x|,|y| ≈ 25–28). At the R7 contraction (half 26) one
construct is clipped; by R10 (half 23) six constructs sit outside the
boundary and die to trace damage (2 + 2·i escalating) over subsequent rounds.

At round 8, a squad-2 construct at (24.4, 24.4) — 3.4 units outside the next
(half-23) region — shows the decisive score landscape:

- Every candidate endpoint INSIDE the current region (half 26) but OUTSIDE
  the next region (half 23) scores identically −4 (traceSafety +18,
  traceAnticipation −22, all other terms 0).
- No legal single-segment candidate reaches the next region: the straight-in
  move (24.4,24.4)→(21,24.4) leaves |y| = 24.4 > 23; the diagonal
  (24.4,24.4)→(21.1,21.1) crosses an avenue wall; allowance 5 does not cover
  the required multi-segment dogleg. Candidate endpoints toward the board
  center score −44 (worse: outside BOTH regions).
- The score landscape over the reachable set is therefore FLAT, and weight
  magnitude is provably inert on it (all terms scale together — verified:
  40/60 weights reproduce the identical match).

The deterministic tie-break (change 4) now decides inward-vs-outward among
such ties deterministically, but the candidates that would change the
outcome — endpoints inside the NEXT region — are not in the reachable set.
A legal multi-segment path (e.g. (26,25)→(24,25)→(24,23), length ~4 <
allowance 5) would reach it; the engine's `legalMovePlot` accepts such
polylines, but `generateMoveCandidates` (src/engine/ai/candidates.ts) emits
only single-segment origin→endpoint candidates.

### Escalation (CA-03): weights-only tuning cannot reach the ceiling

The escalation rule applies: this session STOPS short of the ceiling and
leaves the check hard (red battery is the truth-teller). Catalog/tunables
balance levers are a human product decision per Design Decision 5. Observed
rates and the concrete options follow.

Observed rates (hard gate): 0.939 (tier-2, budget 100, --seeds 4, release),
0.889 (budget 50, --seeds 2, behavior-check), 0.750 (budget 25, --seeds 2,
behavior-check). Ceiling: 0.4.

Tried weight values (both documents byte-equal, then reverted to plan
values):

| Iteration | Weights | Rate | Result |
|---|---|---|---|
| baseline (pre-session) | traceSafetyBonus 18 / traceExposurePenalty 22 | ~1.0 (documented, informational) | — |
| anticipation only | 18 / 22 | 0.959 | inside-next-region endpoints beat outside ones WHERE reachable; corner equilibria unchanged |
| weights 40 / 60 | 40 / 60 | 0.959 | zero movement — weight magnitude inert on uniform ties |
| tie-break v2 (clamp) | 18 / 22 | 0.939 | one death moved; 1-rank gaps nonce-flippable |
| tie-break v3 (fixed-point progress) | 18 / 22 | 0.939 | rank gaps dominate the nonce; outcome limited by reachable-set geometry, not ranking |

Concrete product levers (NOT exercised — human decision):

1. **Raise chassis movement allowances** (data/catalog.chassis.json). At
   allowance 5 board units a corner construct needs 2–3 rounds to re-enter
   from a corner against a 3-round contraction cadence; allowances in the
   7–10 range would let one move + one reposition clear the boundary.
2. **Soften the trace schedule** (data/tunables.json): increase
   TRACE_INTERVAL (3 → 4–5) or delay TRACE_FIRST_ROUND, giving constructs
   more rounds per contraction to reposition. This directly trades against
   NFR-1 (match length).
3. **Change the generator-derived per-step shrink in `buildStandardTrace`**
   (src/engine/map/generators/common.ts: `halfSize/10` per contraction). This
   is an ENGINE-MAP code change, not a tunable — it needs its own session and
   lease. Smaller shrink steps keep the region reachable at corner spawn
   distances.
4. **Extend MAX_EXPECTED_ROUNDS** (data/tunables.json, currently 24) if
   slower contraction is compensated by a longer round budget.
5. **AI candidate generator: multi-segment paths** (src/engine/ai/
   candidates.ts). The engine accepts legal polylines (verified against
   `legalMovePlot`); the AI's movement fan-out emits only single-segment
   paths, which cannot navigate around avenue walls. This is an AI-module
   change (M11) beyond this session's checkpoint-1 scope, which the prompt
   restricted to scorer/policy edits; it directly addresses the observed
   frozen-corner equilibria.

Recommended first lever: 5 (candidate generator shape), then 1 (allowances)
— options 2/4 trade against NFR-1; option 3 alters every archetype's trace.

## Reproduction

```bash
# Behavior battery (hard TRACE_DISCIPLINE):
npm run harness -- behavior --seed release --seeds 4 --json
# Determinism battery (R12, byte-identity across runs):
npm run test:determinism
npm run harness -- determinism --seed release --seeds 8 --json
# Unit-sample battery:
npx vitest run tests/harness/behavior.test.ts
```

## Follow-ups

1. **TRACE_DISCIPLINE stays red until the balance decision above.** The hard
   gate is the truth-teller; do not loosen the ceiling or revert the gate.
2. **CALLED_SHOT_RATE 1.000 and POSTURE_RATE 0.001** remain
   information-only; the pool allocator still spends everything on called
   shots. Sample sizes remain small (15 attacks over 12 matches).
3. **Tier-ordering sample tightening** (inherited): CI should use
   --seeds 24 before TIER_ORDERING is production-tight.
4. **`releaseAiWeights.beamWidth` remains unconsumed** (inherited from
   Session 05/06; unchanged by this session).
5. **aiDeploy at budget 200** throws RunnerError (no legal placement in
   spawn region) — pre-existing deployment-capacity limitation observed
   during escalation probes; outside this session's lease.