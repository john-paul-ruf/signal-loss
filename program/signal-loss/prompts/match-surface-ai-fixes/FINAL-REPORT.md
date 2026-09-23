# Final Report — SIGNAL LOSS / match-surface-ai-fixes

## Summary

The three player-reported match-surface defects were addressed in one concurrent wave of three
ownership-disjoint sessions (plus one post-close mechanical owner-corrections worker):

1. **Round log scrolling (CAP-01/CA-01) — fixed and proved.** The match shell is now
   viewport-bounded (`height:100vh; min-height:720px` column, `minmax(0,1fr)` body row,
   `min-height:0` + `overflow-y:auto` log, auto-scroll retargeted from the `<ol>` to the
   `.round-log` section). The chromium e2e at 1280×720 drives the real product flow through two
   full rounds and asserts zero page overflow, shell ≤ 721 px, `scrollHeight > clientHeight` on
   the log, top-scroll revealing the deployment event, and stick-to-newest restoration
   (measured: log 1631/359, scrollTop 1272 = exactly stuck; shell 720/720; document 720/720).
2. **Terrain legibility (CAP-02/CA-02) — fixed and proved.** The grid is now a screen-space
   measuring aid: `gridStepForScale` selects the smallest `10fx × 2^k` with ≥ 12 px on-screen
   spacing (2560 fx ≈ 17.8 px at the fitted-board scale; mock-parity ~20 px), every 5th line is
   a major line, and all other painters are byte-preserved. The canvas-pixel e2e re-runs the
   planner's probe technique on the real product journey: distinct 16-step colors 73 (fog was
   8), lit ratio 0.141 (fog was 0.684), wall pixels present, scanline grid-line min gap 16 px
   (fog ≈ 0.07 px). Screenshots for human review are in gitignored `img-source/`.
3. **AI purpose (CAP-03/CA-03) — mechanism landed; hard gate landed; hard-pass escalated to the
   human per the plan's own escalation rule.** `scoreMoveEndpoint` now anticipates the next
   trace contraction at every tier (public schedule facts only); tier-3's collector was
   corrected to strictly-future steps (replan R-01: the original "skip index 1" premise was
   disproved — `collectFutureSafeRegions` had no lower bound); TRACE_DISCIPLINE is a hard
   battery check with fail-capable self-tests; a deterministic rng-free tie-break removes the
   nonce's deciding vote among equally-scored candidates. After honest weights-only tuning
   (weights provably inert on the reachable candidate set — 40/60 reproduced the identical
   match), the trace-death rate is 0.939 (release sample) / 0.940 (--seeds 24) vs the 0.4
   ceiling. The mechanism probe shows the binding constraint is candidate-generator geometry
   (single-segment AI move candidates cannot reach the next safe region from corner spawns
   against a 3-round contraction cadence), not weight magnitude. Five product levers are
   recorded in `docs/verification/behavior-baseline.md`; the check stays hard (red battery is
   the truth-teller).

**Sessions done: 3/3 planned sessions landed their full lease work (S01 done; S02 done-by-evidence
after two crashed deliveries; S03 declared-blocked at 3/3 per CA-03 escalation) + 1 owner-corrections
worker. CAP-01 and CAP-02 are verified against current sources; CAP-03's producer contributions and
hard gate are landed, with the hard-pass proof open pending the human balance decision.**

## Sessions run

| # | Session | Status | Checkpoints | Commits |
|---|---|---|---|---|
| 01 | Match shell fit and round-log scrolling (UI-Coder) | done | 3/3 + 2 in-lease corrections | 6e4ec4d, a5b8b68, f832303, 273f10b, 057bd50 |
| 02 | Terrain layer legibility (UI-Coder) | done-by-evidence (handoff delivery crashed ×2; receive completed by Orchestrator from git + session logs) | 2/2 | 6938c76, c026bc7 |
| 03 | AI anticipatory movement and hard trace discipline (Coder) | declared-blocked (CAP-03 escalated) | 3/3 | 10d1f34, 89b82a0, 1e7e904 |
| — | OWNER-CORRECTIONS (runner.test.ts premise; naked-route selector) | done | — | c708926, 27c78bc |

Pre-run helpers (not sessions): planning-completeness Archivist (A9eFy), REPLAN-R01 replan worker (Crbbb).

## Files created/modified

- `src/app/components/match/match-shell.css` (height chain, body grid row, log constraint, mode slot sizing, `.movement-hud` + pointer-transparency)
- `src/app/components/match/RoundLog.tsx` (auto-scroll retarget to the section; effect deps on event identity)
- `src/app/board/layers/terrain-layer.ts` (pure `gridStepForScale` + `isMajorGridLine`; adaptive minor/major grid paint)
- `src/engine/ai/evaluate.ts` (`traceAnticipation` term, `pickNextTraceStep`, `MoveTerms` extension)
- `src/engine/ai/policy.ts` (strictly-future tier-3 collector; deterministic trace-aware tie-break)
- `data/ai.weights.json` — **unchanged** (byte-equal to plan HEAD; tuning proved inert)
- `tests/harness/support/ai-weights.ts` — **unchanged** (byte-equal; CA-03 key-sync intact)
- `tests/harness/support/behavior.ts` (hard TRACE_DISCIPLINE gate)
- `tests/harness/behavior.test.ts` (hard-gate + fail-capable knock-down self-tests)
- `tests/engine/ai/tier1.test.ts` (constructed-scenario anticipation proof + tie-break regression)
- `tests/engine/ai/tier3.test.ts` (strictly-future lookahead regression proofs; added to lease by replan R-01)
- `tests/app/match/shell.test.tsx` (rules + structure assertions, fs-based, node env — no jsdom)
- `tests/app/match/terrain-grid.test.ts` (new; step selection, monotonicity, spacing sweep, major predicate)
- `tests/e2e/match/match-shell.spec.ts` (CAP-01 e2e; naked-route fallback text corrected by owner worker)
- `tests/e2e/match/board-render.spec.ts` (new; canvas-pixel probe)
- `tests/harness/runner.test.ts` (COMPLETE⇒winner premise corrected to documented engine behavior — owner worker)
- `docs/verification/behavior-baseline.md` (mechanism probe, tuning record, per-tier rates, hard-gate change, 5 escalation levers)
- `program/signal-loss/prompts/match-surface-ai-fixes/STATE.md` (Orchestrator-owned run record; gitignored in this repo)

## Architecture impact

None structural: no module added, no facade (M12) export changed, no worker-protocol change, no
new dependency, engine purity (R1) untouched. S02's `gridStepForScale`/`isMajorGridLine` are
app-module (M17) exports consumed by an app test — not engine facade surface. Final Archivist
verified: `git diff --name-only 94020a7 HEAD` = 15 files, all inside existing modules; `arch/`
remains empty (none were required; MASTER step 9 satisfied by no-module/no-public-API confirmations).

## Verification (all gates Orchestrator-executed with exit codes read, or recorded from the owning session with the gate identity noted)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS (re-run 08:41 post-close) |
| Lint (incl. purity zones) | `npm run lint` | PASS (re-run 08:41 post-close) |
| Unit suite (whole repo) | `npm run test:unit` | **95 files / 903 / 903 PASS** (post-owner-corrections; was 902/903 before) |
| Determinism battery (R12) | `npm run harness -- determinism --seed release --seeds 8 --json` | PASS — replay 8/8, fold 8/8, permutation 120/120 (new hash family post-scoring-change; byte-identical across runs; S03 also ran test:determinism 6/6 and CLI ×2) |
| Playability battery | `npm run harness -- playability --seed release --seeds 12 --json` | PASS — dense-grid 11/12 (acceptance 0.917, one seed hit the 100-attempt ceiling; within thresholds), all other archetypes 12/12, REGEN_TAIL overall 0.988 |
| Behavior battery | `npm run harness -- behavior --seed release --seeds 4 --json` (+ `--seeds 24`) | **RED BY DESIGN** — TRACE_DISCIPLINE hard gate: 0.939 (46/49) / 0.940 (seeds 24) vs ceiling 0.4; all other checks pass (budgets clean; TIER_ORDERING 13/13/13 at 24 seeds; NOT_LEADER 0.162; CALLED 0.991; POSTURE 0.003) |
| Costing battery | `npm run harness -- costing --seed release --seeds 4 --json` | **CRASH (exit 4, pre-existing, out of run scope)** — `RunnerError: aiDeploy squad 2: No legal placement for construct 15` at budget 200; bit-identical at HEAD |
| Production build | `npm run build` | PASS (in-session: S01, S02, OWNER-CORRECTIONS; 227 modules; build identities recorded) |
| Browser e2e | targeted chromium specs | match-shell.spec.ts 3/3 (post-selector fix, PORT 8199); board-render.spec.ts 1/1 (PORT 8102) |
| Unit (app/match scope) | `node_modules/.bin/vitest run tests/app/match/` | 17 files / 128 tests PASS |
| Unit (engine AI + behavior self-tests) | `node_modules/.bin/vitest run tests/engine/ai/tier1.test.ts tests/engine/ai/tier3.test.ts tests/harness/behavior.test.ts` | 34/34 PASS |

Baseline hazard reconciliation: the eslint-boundary 5s-timeout flake did not fire in any of the
run's three full-suite executions; the hazard remains open (one green run is not closure) and the
rerun-alone constraint carries forward.

## Residual gaps

1. **CAP-03 hard-pass (required capability) — OPEN, human product decision required.** The
   behavior battery stays red by design until the balance levers are chosen. This is the run's
   single Human Interruption Gate item (product design per Design Decision 5). Owner: user.
   Acceptance condition: `TRACE_DISCIPLINE.passed = true` at the release sample after the chosen
   lever lands in a planned follow-up session. Levers (recommended first): (1) multi-segment AI
   move candidates in `src/engine/ai/candidates.ts`; (2) raise chassis movement allowances
   (`data/catalog.chassis.json`); (3) soften `TRACE_INTERVAL`/`TRACE_FIRST_ROUND` or extend
   `MAX_EXPECTED_ROUNDS` (`data/tunables.json`; trades against NFR-1); (4) change
   `buildStandardTrace`'s per-step shrink `halfSize/10` (`src/engine/map/generators/common.ts` —
   engine-map code change, own session). Per-tier rates and expected effects are in
   `docs/verification/behavior-baseline.md`. Do NOT loosen the ceiling or revert the gate.
2. **Costing battery budget-200 crash (pre-existing, outside this run's scope).** Owner: future
   AI-deploy/deployment-capacity session. Final-report debt; does not gate this run (MASTER's
   integrated gate names the behavior + determinism batteries; playability additionally re-verified green).
3. **Human mock-parity eyeball of the s02 screenshots** (`program/signal-loss/img-source/s02-terrain-*.png`, gitignored, on disk) — pixel assertions green; qualitative review pending human.
4. **Inherited informational items (unchanged by this run):** CALLED_SHOT_RATE 0.991 / POSTURE_RATE 0.003 information-only; `releaseAiWeights.beamWidth` still unconsumed; playability dense-grid acceptance 0.917 at 12 seeds (blocks only `minAcceptanceRate` 1.0).

## Follow-up closure ledger

| Source | Entry (summary) | Disposition |
|---|---|---|
| S01 followUp | S02 consumes the movement/playback slot sizing (CAP-02 prerequisite) | **closed** — S02 c1–c2 landed and proved with the slot CSS present (c2 e2e passed on PORT 8102) |
| S01 followUp | Naked-route e2e selector needs one-line owner correction outside S01's lease | **closed** — OWNER-E2E-NAKEDROUTE 27c78bc; re-proven 3/3 |
| S01 followUp | runner.test.ts COMPLETE⇒winner premise needs action | **closed** — OWNER-HARNESS-RUNNERPREMISE c708926 (premise corrected, not weakened; negative control reproduced the old failure first) |
| S01 followUp | STATE.md CA-01 row flip planned→landed | **closed** — done in STATE.md reconciliation |
| S02 (log-evidenced) | One e2e run on default port/artifact root before the corrected rerun | **retired** — corrected run is the evidence of record; process debt recorded here |
| S02 (log-evidenced) | Prompt-example contradictions (monotonic direction; ±10240 major) | **closed** — CA-02 formula implemented; direction documented in test comments; replan R-01 evidence trail records the prompt corrections |
| S03 followUp | CAP-03 human product decision (5 levers, per-tier rates, expected effects) | **carried** — owner: user (product design); acceptance: behavior battery hard-pass at release sample; recorded in STATE.md Capability Readiness + Current Blockers |
| S03 followUp | runner.test.ts premise fix | **closed** — c708926 |
| S03 followUp | costing budget-200 aiDeploy crash | **carried** — owner: future AI-deploy/deployment-capacity session; outside all current leases; final-report debt |
| S03 followUp | CALLED_SHOT_RATE / POSTURE_RATE informational follow-up | **carried** — owner: future behavior-tuning session (information-only at current samples) |
| S03 followUp | TIER_ORDERING needs --seeds 24 | **closed for this sample** — behavior CLI at --seeds 24: 13/13/13 PASS (recommendation satisfied on the release base seed) |
| S03 followUp | `releaseAiWeights.beamWidth` still unconsumed | **carried** — owner: future AI/tuning session (unchanged by this plan) |
| OWNER-CORRECTIONS followUp | Winner distribution in behavior baseline should account for null winners (HUMAN_ELIMINATED) | **carried** — owner: behavior-baseline authors at the CAP-03 closing session |

## Orchestration

**Concurrency:** 3   **Wall clock:** 07:13–08:41 (~88 minutes)
**Sessions run:** 3 Planner sessions + 1 owner-corrections worker + 1 replan worker + 2 Archivist passes   **Checkpoints committed by Coder:** 8 feature checkpoints + 2 in-lease corrections + 2 owner-correction commits

### Wave plan as executed

| Wave | Sessions | Notes |
|---|---|---|
| Preflight | ARCHIVIST-PLANCOMPLETENESS, REPLAN-R01 | Planning-completeness pass found F-1 (disproved premise in S03 c1), F-2 (jsdom seam), F-6 (module labels); bounded replan corrected all three prompts before dispatch; S03 lease revision 2 |
| Wave 1 (concurrent ×3) | S01 (UI-Coder, PORT 8101), S02 (UI-Coder, PORT 8102), S03 (Coder, CPU) | Launched back-to-back before any await; e2e build+proof serialized via .program/e2e.lock with per-slot artifact roots; S01 recovered via resume (empty terminal at 0 ckpts → done 3/3); S02 landed 2/2 but crashed twice on delivery → done-by-evidence; S03 declared-blocked at 3/3 (CAP-03 escalation) |
| Post-close | OWNER-CORRECTIONS | Two mechanical corrections restored whole-repo green (903/903; naked-route 3/3) |

### Blocked

| S | Reason | Last checkpoint | Dependents stalled |
|---|---|---|---|
| 03 | CAP-03 hard-pass unmet after honest weights-only tuning (0.939/0.940 vs ceiling 0.4) — CA-03 escalation to human product decision | 3/3 | none |

### Blocker escalations

| S | Class | Action / human ask | Disposition |
|---|---|---|---|
| preflight | Planning defects F-1/F-2/F-6 | REPLAN-R01 corrected the three prompts; S03 lease rev 2 | auto-cleared before wave 1 |
| preflight | e2e resource seam F-3 | per-slot PORTs + artifact roots + .program/e2e.lock serialization | cleared (honored by S01/S02) |
| 01, 02 | Empty-terminal crashes (0 tokens at end_turn) | resume same context (attempt 1) | S01 resolved; S02 unresolved on delivery → done-by-evidence receive |
| 03 | CAP-03 escalation (CA-03 / Design Decision 5) | **HUMAN ASK: choose the AI balance lever(s)** (Residual gaps #1) | OPEN — escalated in this report |
| ext | runner.test.ts + naked-route reds | OWNER-CORRECTIONS worker | cleared (c708926, 27c78bc) |
| ext | costing budget-200 crash | none (out of scope) | final-report debt, carried |

### Interim Archivist checks

| After wave | Sessions received | Result | Drift found | Actions |
|---|---|---|---|---|
| — (planning mode, pre-wave) | 0 | done | F-1 disproved premise; F-2 jsdom seam; F-3 e2e resource contract; F-4/F-5 STATE wording; F-6 module labels; F-7 flake reconciliation | REPLAN-R01 + envelope resource assignment + STATE wording folded at first STATE reconciliation |
| final | n/a (final mode) | done | none blocking; standing recommendations recorded | ARCHIVIST-LOG.md created (on disk; gitignored) |

(No interim drift checks were scheduled: 3 sessions < the 16-session cadence threshold.)

### Lease violations

none — every run commit verified with `git show --name-only` against its author's lease: S01
(5 commits, 4 lease paths), S02 (2 commits, 3 lease paths), S03 (3 commits, 7 lease paths),
OWNER-CORRECTIONS (2 commits, 1 path each). Sibling files visible in the shared worktree (S02
observing S03's in-flight engine edits; S02's untracked spec while S03 worked) were treated as
expected shared-index visibility, not violations.

### Checkpoint shortfalls

none — every session's git checkpoint count matches its declared checkpoints (S01 3/3, S02 2/2,
S03 3/3). S01's two extra commits are declared in-lease corrections (f832303 functional, 057bd50
newline residual), not batched checkpoints.

### Wave plan corrections

none — Planner's concurrency claim verified path-by-path (three leases literally disjoint; the
shared `e2e-preview` resource was declared and serialized per the plan's own note).

### Granularity feedback for Planner

- **Empty-terminal provider failures dominated the run's friction:** 3 of 8 worker turns ended
  with an empty final message (S01 attempt 1; S02 attempts 1–2) — all at `end_turn`, 0 tokens,
  after substantial successful work. One resume fixed delivery; one session's handoff never
  arrived despite complete, verified work. 3 in-cycle instances of one shape (Archivist row
  f2adab445b827eaa).
- **The pre-dispatch planning-completeness review caught a real landmine (F-1):** S03's c1 step 2
  ordered a change based on a false reading of `collectFutureSafeRegions`. The scoped Archivist
  pass before the wave was the cheapest possible place to catch it; recommend keeping the
  pre-wave completeness pass as standing practice for engine-semantics prompts (Archivist row
  2dec30c7bff0575a).
- **S03's checkpoint-2 mechanism premise was provably false, and the session correctly
  escalated instead of forcing it.** The checkpoint boundaries themselves were right (c1 scorer,
  c2 gate+tuning, c3 evidence); the plan's "weights can tune to the ceiling" assumption was not.
  The unplanned in-lease tie-break was the smallest lease-internal way to honor the session's
  own "nonce must not decide" contract.
- **S01's checkpoint-3 e2e caught its own c1 regression** (HUD pointer interception) and fixed
  it in-lease — the CSS→component→e2e checkpoint ordering worked as designed.

### Process effectiveness

- **First-dispatch completion:** 2/4 workers (S03, OWNER-CORRECTIONS) accepted without unplanned
  correction; S01 accepted after one sanctioned recovery resume (delivery terminal, not a work
  defect); S02 required an evidence-based receive after two delivery crashes (its work landed at
  first attempt with correct gates).
- **Unplanned corrections: 4** — (1) S03's in-lease tie-break (lease-internal, accepted at
  receive; CAP-03; same-context, no lease revision needed); (2) OWNER-HARNESS-RUNNERPREMISE
  (runner.test.ts; planning gap — no lease covered M22's runner test when S03's change
  invalidated its premise; separate owner worker); (3) OWNER-E2E-NAKEDROUTE (naked-route
  selector; pre-existing debt surfaced by S01's e2e; separate owner worker); (4) REPLAN-R01
  (three planning-file corrections pre-dispatch — a planning defect, not a Coder correction).
  No CAP required a same-context lease revision mid-flight.
- **Integration rework: none** — no accepted checkpoint was later corrected by another session;
  the only corrective commits were S01's own in-lease c3 corrections (self-caught by its e2e).
- **Environment vs planning:** the three empty-terminal failures and the costing crash are
  environment/pre-existing; F-1/F-2/F-6 and the two owner corrections are planning defects; the
  CAP-03 escalation is a product decision working as designed.
- **Run-end commit note (environment):** `program/signal-loss/prompts/**` is gitignored in this
  repo (`.gitignore:26`), so the required `git add` of FINAL-REPORT.md was refused by git. The
  report is the one artifact that must be published to end the run, so it was added with an
  explicit `git add -f -- <the single report path>` (never `-A`/`.`; no other path was force-added;
  the prompts tree remains ignored for everything else) and committed as `5f0c7e5`. STATE.md,
  MASTER.md, SESSION files, and ARCHIVIST-LOG.md remain on disk only (uncommitted by design of
  the repo's ignore rule). Recommendation for the human: move the run-end report target out of
  the ignored prompts tree (or un-ignore `program/signal-loss/prompts/`) in a future
  program-config pass so the run-end contract does not require a force-add.

### Capability completion

- **CAP-01 — verified against current sources** (producer + integration proof; commits cited in STATE.md).
- **CAP-02 — landed + proved** (producer + canvas-pixel integration proof; done-by-evidence receive; human eyeball of screenshots outstanding).
- **CAP-03 — producer contributions and hard gate landed; hard-pass OPEN** pending the human
  product decision (CA-03 escalation). **The product is not complete while CAP-03's hard-pass is
  open**: this is a required capability whose acceptance condition (`TRACE_DISCIPLINE.passed` at
  the release sample) is unmet, with the owner (user) and five levers recorded in
  `docs/verification/behavior-baseline.md` and STATE.md Current Blockers.

### Archivist's Note

The record is reconciled and the log entry is complete on disk. No commit is issued: `git check-ignore` confirms `program/signal-loss/prompts/` is gitignored (`.gitignore:26`), so per the envelope the entry stays on disk and its non-committability is noted. Role documents were never written; no code, tests, STATE, MASTER, or Final Report files were touched; nothing was spawned.

## Archivist Note

- **role:** archivist
- **registryUpdated:** false — reconciled against git, **no edits required**: `git diff --name-only 94020a7 HEAD` = 15 files, all inside existing modules (M19, M17, M11, M22, M23, M24, M25 + one docs file); no new module, no new edge, no facade change; `arch/` remains empty (none exist — MASTER step 9 satisfied by no-module/no-public-API confirmations)
- **reconciled:**
  - `program/signal-loss/prompts/match-surface-ai-fixes/ARCHIVIST-LOG.md` (created — first entry for this repository; **not committed**: `git check-ignore -v` → `.gitignore:26 /program/signal-loss/prompts/` — file recorded on disk only, per envelope)
- **mechanical claims verified (all pass):**
  - 12 run commits exist above plan HEAD `94020a7` and each touches only its author's lease (`git show --name-only`); S03's weights documents absent from every commit and `git diff --stat 94020a7 HEAD` over both is empty (byte-equal, CA-03 key-sync re-verified value-for-value across `data/ai.weights.json` / `releaseAiWeights` / `ai-config.ts` `WEIGHT_KEYS`)
  - TRACE_DISCIPLINE is a real comparison: `traceDisciplineCheck` (behavior.ts:189, 275–280) against `tunables.TRACE_DEATH_CEILING` = 0.4, with fail-capable self-tests incl. knock-downs (behavior.test.ts:74/:96/:106/:128)
  - tier-3 strictly-future filter landed as replanned (policy.ts:955, no index-1 skip); `pickNextTraceStep` real (evaluate.ts:384, consumed :207)
  - runner.test.ts premise corrected, not weakened (assertions preserved + strengthened; negative control on record)
  - board-render.spec.ts assertions are real (colors ≥ threshold, lit ratio, scanline gap, wall pixels); match-shell.spec.ts scrollability assertions real; naked-route selector follows the product
- **conventionsAdded:** — (none; first completed cycle — 1 of 3, no promotable convention shape recurred)
- **proposedForFramework:**
  - Empty-terminal worker deliveries (final message empty, 0 tokens) force resume recovery / done-by-evidence receives — 1 cycle, 3 in-cycle instances (S01 attempt 1; S02 attempts 1–2)
  - Engine-semantics premises in session prompts disproved against source, caught only by the pre-dispatch planning-completeness review (F-1 / REPLAN-R01) — 1 cycle, 1 instance; recommend keeping the pre-wave completeness pass as standing practice for engine-semantics prompts
  - Outside-lease reds exposed by sibling changes require post-wave owner-correction workers (c708926, 27c78bc) — 1 cycle, 2 instances
- **logEntry:** dated entry appended to ARCHIVIST-LOG.md (2026-09-23, FINAL pass, cycle `match-surface-ai-fixes`) — on disk only; the file is gitignored so no pathspec commit was issued

### standingRecommendations

- **id:** f2adab445b827eaa
- **pattern:** Empty-terminal worker deliveries (final message empty, 0 tokens after substantial work) force resume recovery and done-by-evidence receives
- **cycles:** 1 · **instances:** 3 · **firstSeen:** match-surface-ai-fixes · **status:** open
- **id:** 2dec30c7bff0575a
- **pattern:** Engine-semantics premises in session prompts disproved against source, caught only by the pre-dispatch planning-completeness review
- **cycles:** 1 · **instances:** 1 · **firstSeen:** match-surface-ai-fixes · **status:** open
- **id:** 305fa3c03d4d04e9
- **pattern:** Cross-session in-flight or pre-existing reds outside every lease require post-wave owner-correction workers
- **cycles:** 1 · **instances:** 2 · **firstSeen:** match-surface-ai-fixes · **status:** open

*(no `cleanupBriefs` — no threshold crossed: the run introduced no dead code, orphaned exports, or obsolete flags; the staged legacy-duplicate deletions remain the §10-documented pre-existing anomaly, unchanged and uncommitted)*