# Roshi Log — SIGNAL LOSS

Roshi's dated record across program cycles. Append-only.

---

## 2026-08-28 — Cycle 1 · SIGNAL LOSS / full-v1

### What ran

Jikijitsu spawned SESSION-01 → SESSION-08 across six planned waves. Waves 1–3 launched; SESSION-01 completed 5/5 checkpoints, SESSION-02 completed 5/5, SESSION-03 completed 4/4. Wave 3's SESSION-04 returned no parseable handoff (`./.forge/results/SESSION-04.result.md` contains only a subagent JSON parse-error message) and committed 0/6 checkpoints, blocking Waves 4–6 (SESSION-05 through SESSION-08).

### What I reconciled

- Read: Final Report, `STATE.md` in full, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, and the master build index at `./program/signal-loss/prompts/full-v1/MASTER.md`. Grounded every claim against `git log --oneline -30` and the working tree.
- Rewrote 13 arch files so each reads as one coherent description rather than a Genesis stub plus a stapled session delta. Preserved every fact from both fragments, collapsed duplicated Public API blocks, folded "Conventions in effect" into the module's Conventions and Invariants section, updated Status lines to reflect what shipped and what remains, and extended each Change History with a second dated entry pointing at the shipping session:
  - `./program/signal-loss/arch/M01-toolchain-ci.md`
  - `./program/signal-loss/arch/M03-fixed-point.md`
  - `./program/signal-loss/arch/M04-seeded-rng.md`
  - `./program/signal-loss/arch/M05-catalog.md`
  - `./program/signal-loss/arch/M06-build-rules.md`
  - `./program/signal-loss/arch/M07-share-codec.md`
  - `./program/signal-loss/arch/M08-map-generation.md`
  - `./program/signal-loss/arch/M13-persistence-schema.md`
  - `./program/signal-loss/arch/M14-platform-adapters.md`
  - `./program/signal-loss/arch/M17-app-state-bridge.md`
  - `./program/signal-loss/arch/M19-ui-components.md`
  - `./program/signal-loss/arch/M21-app-bootstrap.md`
  - `./program/signal-loss/arch/M22-verification-tests.md`
- Left untouched (Genesis contract still authoritative; no shipped code yet to reconcile against): `M02`, `M09`, `M10`, `M11`, `M12`, `M15`, `M16`, `M18`, `M20`.
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): no update needed. Every shipped module's `Owns` / `Imports From` / `Key Files` still matches the Genesis contract; nothing shipped contradicted its planned public shape. The registry describes the module contract, not implementation status, and shipping status now lives in each arch file's `> **Status:**` line.

### What I did NOT promote to a convention

Two observations this cycle, both at count-of-1 (Vow 4: one cycle is noise, three is signal). Neither promoted to `FORGE-CONFIG.md`:

- SESSION-02's `cab5120` checkpoint captured files from SESSION-03's declared lease because its `git commit` carried no pathspec, even though `git add` had. `FORGE-CONFIG.md` already scopes `git add`; scoping `git commit` too is a plausible tightening but belongs in the orchestration envelope Jikijitsu builds, not in Forge conventions.
- SESSION-04 returned unparseable subagent output and yielded no handoff at all. Zero-checkpoint failure modes may warrant a Jikijitsu retry policy or a distinct crash-vs-block reason code.

Both queued under **Proposed for the framework** below.

### Proposed for the framework

To be folded in by a human when a pattern crosses the three-cycle threshold. Neither has crossed it yet.

- **Scope `git commit` pathspec, not only `git add`.** Observed cycles: 1 (SIGNAL LOSS / full-v1, SESSION-02 `cab5120` → `36b6ad5`). If two concurrent Mus share a working tree, one Mu's `git add` pathspec still commits any file the OTHER Mu has staged into the shared index — because `git commit` without a pathspec commits everything staged. Candidate home: `./JIKIJITSU.md`'s orchestration-envelope contract that instructs each Mu on how to shape its checkpoint commits, and/or `./MU.md`'s checkpoint-commit protocol. This is an orchestration/role concern, not a Forge planning convention, so I have not touched `./FORGE-CONFIG.md`.

- **Distinguish "session crashed with no parseable handoff" from "session declared itself blocked."** Observed cycles: 1 (SIGNAL LOSS / full-v1, SESSION-04). A blocked session names its blocker; a crashed session yields only a subagent transport error and zero checkpoints. Downstream planning (which subsequent sessions can still launch, whether to auto-retry) may benefit from separating the two. Candidate home: `./JIKIJITSU.md`'s spawn/await/result-classification section.

### Roshi entry

Reconciled 13 arch files into single coherent module descriptions; module registry unchanged; two orchestration-shaped observations logged for the framework at count-of-1, none yet promoted to FORGE-CONFIG.md conventions.

---

## 2026-08-28 — Cycle 2 · SIGNAL LOSS / full-v1 (retry continuation)

### What ran

Jikijitsu ran a five-session retry continuation over the sessions blocked or unstarted after cycle 1. SESSION-04 retry 1 completed 6/6. SESSION-05 completed 5/5 (Zen await timed out mid-flight; durable-handle re-collection returned the final handoff). SESSION-06 completed 6/6 (same durable-handle recovery). Concurrent wave: SESSION-07 delegated Mu→Enso mid-flight and blocked at 2/5 on context exhaustion; SESSION-08 completed 6/6. Program state at cycle close: 7/8 sessions done, SESSION-07 blocked at checkpoints 3–5 (composer, setup+mapgen, result+e2e), 25 checkpoint commits landed this continuation on top of cycle 1's 14, program checkpoint total 39, working tree clean.

### What I reconciled

- Read: Final Report (`./program/signal-loss/prompts/full-v1/FINAL-REPORT.md`), `STATE.md` in full including every retry row, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, and cycle 1's `ROSHI-LOG.md` entry. Grounded every claim against `git log --oneline -50` scoped by lease paths.
- Rewrote 11 arch files that had `<!-- SESSION-XX -->` deltas stapled on by Jikijitsu mid-run. Each is now one coherent description of the module as it currently stands: Status line reflects what shipped and what remains, Public API replaces "planned for full v1" placeholders with the actual shipped surface, Conventions section absorbs the invariants from the stapled fragment (deleting duplicates that recur across five files), and Change History records the shipping session:
  - `./program/signal-loss/arch/M01-toolchain-ci.md` (extended: CI shipped in SESSION-06)
  - `./program/signal-loss/arch/M02-authored-content.md` (release bundle shipped in SESSION-06)
  - `./program/signal-loss/arch/M09-match-resolution.md` (SESSION-04 retry 1)
  - `./program/signal-loss/arch/M10-public-projection.md` (SESSION-04 retry 1)
  - `./program/signal-loss/arch/M11-ai.md` (SESSION-05)
  - `./program/signal-loss/arch/M12-engine-facade.md` (SESSION-05)
  - `./program/signal-loss/arch/M15-workers.md` (SESSION-05)
  - `./program/signal-loss/arch/M16-headless-harness.md` (SESSION-06)
  - `./program/signal-loss/arch/M17-app-state-bridge.md` (extended: SESSION-07 checkpoints 1–2 build stores; SESSION-08 bridge + match store)
  - `./program/signal-loss/arch/M18-board-renderer.md` (SESSION-08)
  - `./program/signal-loss/arch/M19-ui-components.md` (extended: SESSION-07 build display primitives; SESSION-08 match components)
  - `./program/signal-loss/arch/M20-screens.md` (extended: SESSION-07 boot / codex / collection; SESSION-08 match modes; pending composer / setup / standalone result documented explicitly)
  - `./program/signal-loss/arch/M22-verification-tests.md` (extended for every session's shipped test subtree)
- Duplication resolved: the shared "session-shipped decisions" convention block from SESSION-05 was pasted into M11, M12, M15 verbatim; the SESSION-08 equivalent into M17, M18, M19, M20. Each invariant now lives once, in the module that owns it, with cross-references where relevant. No fact was lost — every deleted duplicate had an authoritative surviving copy.
- Partial-shipping cases (M17, M19, M20 for SESSION-07's blocked-at-2/5 lease) are documented with explicit "shipped" / "pending" separation so the fresh retry can pick up from checkpoint 3 without re-reading `STATE.md`.
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): still no update needed. On-disk `./src/engine/**`, `./src/app/**`, `./src/workers/**`, `./harness/**` match every `Owns` / `Key Files` field. The registry describes contract, not implementation status.

### What I did NOT promote to a convention

Six observations across cycles 1 and 2, all still below the three-cycle promote threshold (Vow 4). Nothing folded into `FORGE-CONFIG.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycle 1 observed once (SESSION-02 `cab5120` → correction `36b6ad5`). Cycle 2's final report explicitly credits the practice as adopted preventively — "Adding explicit pathspecs to git commit, not only git add, prevented a repeat of cycle 1's shared-index contamination." That's cycle count **2** (one failure + one preventive fix), still below threshold, but now demonstrably effective. Candidate home remains `./JIKIJITSU.md`'s orchestration envelope or `./MU.md`'s checkpoint-commit protocol.
- **Distinguish "session crashed with no parseable handoff" from "session declared itself blocked."** Cycle 1 had crash-shaped SESSION-04 (subagent transport error, zero checkpoints). Cycle 2 has block-shaped SESSION-07 (declared, named blocker, checkpoints 1–2 committed cleanly). Cycle count: **1** each. The two flavors are now clearly distinguishable in the record and the recovery paths differ — cycle 1's SESSION-04 needed a retry-with-fresh-context; cycle 2's SESSION-07 needs a resume-at-checkpoint-3.
- **UI-dominant sessions delegated Mu→Enso mid-flight should have been routed to Enso at spawn time.** Cycle 2 observed once (SESSION-07). Cycle count: **1**.
- **Combined visual working sets can exceed one context window even after careful decomposition.** Cycle 2 observed once (SESSION-07's 5-checkpoint composer/setup/result lease exhausted context at 2/5). Cycle count: **1**. Candidate home: Forge's session-granularity heuristic in the FORGE-CONFIG author guide.
- **Shared-style ownership.** Both cycle-2 UI leases (SESSION-07 build zone, SESSION-08 match) discovered the shared `sl-*` components have no shared stylesheet; both worked around it locally. Cycle count: **1** (both halves of one cycle). Candidate home: Forge's decomposition when concurrent UI sessions ship — carve a shared-style owner before the concurrent pair, not inside either.
- **Zen await window exceeded but recoverable via durable-handle re-collection.** Cycle 2 observed twice (SESSION-05, SESSION-06). Not a decomposition or convention concern; a Jikijitsu implementation detail that is already working. Cycle count: **1** (one cycle, twice within). Noted for pattern-tracking only; nothing to change.

### Proposed for the framework

None crossed the three-cycle threshold this cycle. All observations remain queued at 1 or 2 cycles. To be folded in by a human when a pattern reaches count-of-3.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **2** (SIGNAL LOSS cycle 1 as a failure, cycle 2 as a preventive fix). Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked."** Cycles observed: **2** (SIGNAL LOSS cycle 1 crash-shaped SESSION-04, cycle 2 block-shaped SESSION-07). Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso at spawn time, not by mid-flight delegation.** Cycles observed: **1** (SESSION-07). Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic or Forge's per-session worker-mix hint.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1** (SESSION-07 blocked at 2/5). Candidate home: `./FORGE.md` decomposition heuristics — checkpoint granularity for UI-dominant leases.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1** (SESSION-07 + SESSION-08 both worked around missing shared CSS). Candidate home: `./FORGE.md` decomposition — when two concurrent leases both consume shared shell components, style ownership belongs to an earlier serial lease.

### Roshi entry

Reconciled 11 arch files against SESSION-04-through-08 shipping evidence; folded the SESSION-05 and SESSION-08 shared convention blocks so each invariant lives once in the module that owns it; documented the SESSION-07 partial-shipping split for M17 / M19 / M20; module registry still matches the on-disk layout so no change. Two-cycle observations queued for framework consideration; nothing crossed the three-cycle promote threshold.

---

## 2026-08-28 — Cycle 3 · SIGNAL LOSS / full-v1 (SESSION-07 retry 1)

### What ran

Jikijitsu ran a single-session retry, routing SESSION-07 directly to Enso from checkpoint 3 (correcting cycle 2's mid-flight Mu→Enso delegation). The worker returned only `Failed to parse tool arguments: JSON Parse error: Property name must be a string literal` — no parseable handoff JSON. Jikijitsu committed the worker's in-lease working tree as a session-end residual (`ed7b664`), covering 11 files under `./src/app/store/build/**`, `./src/app/components/build/**`, `./src/app/screens/build/composer/**`, `./tests/app/build/**`, and `./tests/e2e/build/**`. Program state at cycle close: still 7/8 sessions done, SESSION-07 still blocked at checkpoint 2/5 (the residual is explicitly not counted as checkpoint 3), 39 program checkpoint commits unchanged, 0 new worker checkpoint commits, working tree clean.

### What I reconciled

- Read: the Final Report's cycle-3 section (`./program/signal-loss/prompts/full-v1/FINAL-REPORT.md` lines 195–268), `STATE.md` in full including the new SESSION-07 retry-1 row, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, and both prior `ROSHI-LOG.md` entries. Grounded every claim against `git show --stat` on `7e5f797`, `ed7b664`, and `5ab07f6`.
- Updated four arch files to record the residual explicitly as **unverified, non-checkpoint** work — distinct from the shipped-and-verified SESSION-07 checkpoints 1–2 and SESSION-08 surfaces they sit beside, per Vow 2 (git is the source of truth) and the Verification discipline (never invent a checkpoint that wasn't declared):
  - `./program/signal-loss/arch/M17-app-state-bridge.md` — added the residual `composer.ts` / `composer-context.ts` draft store as an unverified subsection; corrected the Internal Structure table to separate verified build stores from the residual composer store and the still-fully-unstarted `mapgen-client.ts`.
  - `./program/signal-loss/arch/M19-ui-components.md` — added the residual `CommanderDeltaGrid.tsx` component with the same unverified framing.
  - `./program/signal-loss/arch/M20-screens.md` — added the residual `Composer.tsx` / `ComposerView.tsx` / `route.tsx` and the `CollectionView` edit-button wiring; **corrected a path error inherited from cycle 2**: the arch previously said the pending composer screen would live at `./src/app/screens/composer/`, but the actual (unverified) files landed at `./src/app/screens/build/composer/` — resolved to what git shows, per Vow 2.
  - `./program/signal-loss/arch/M22-verification-tests.md` — recorded `./tests/app/build/composer.test.tsx` and `./tests/e2e/build/composer.spec.ts` as authored-but-never-executed residual specs, since no verification result was reported for this retry.
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): no update needed. The residual paths all fall inside M17 / M19 / M20 / M22's existing `Owns` contracts; nothing shipped a new module boundary.

### What I did NOT promote to a convention

Seven observations now queued across three cycles; two cross the three-cycle mark this cycle but both target Robe files (`./JIKIJITSU.md`), which Roshi never edits per Vow 3 regardless of cycle count — they remain human-fold recommendations, now with higher confidence:

- **Scope `git commit` pathspec, not only `git add`.** Now **3** cycles: cycle 1 failure (SESSION-02 `cab5120`), cycle 2 preventive success, cycle 3 preventive success again (`ed7b664` touched only SESSION-07 lease paths despite being a crash-recovery commit, not a normal Mu checkpoint). Still a `./JIKIJITSU.md` / `./MU.md` orchestration concern, not a `./FORGE-CONFIG.md` convention — no program-specific Forge/Mu authoring rule is implicated, so nothing was added to `./FORGE-CONFIG.md`.
- **Distinguish "session crashed with no parseable handoff" from "session declared itself blocked."** Now **3** cycles: cycle 1 SESSION-04 (crash), cycle 2 SESSION-07 (declared block), cycle 3 SESSION-07 retry 1 (crash again, same failure signature — a subagent tool-argument JSON parse error). The record shows Jikijitsu is already handling this correctly in practice (checkpoint count held at 2/5, residual not miscounted as checkpoint 3), so this is now evidence the distinction is real and worth codifying explicitly in `./JIKIJITSU.md`'s result-classification section rather than relying on careful per-run judgment.
- Five prior observations remain below threshold, cycle counts unchanged from cycle 2 (route UI-dominant sessions to Enso at spawn — **1**, though cycle 3's retry did apply this correction and it worked structurally, the worker still crashed for an unrelated transport reason, so this is not yet a repeat data point on the *routing* question itself; combined visual working set cap — **1**; shared-style owner — **1**; Zen await window — **1**).

### New observation this cycle

- **A second consecutive transport/parse failure on the same blocked session** (cycle 2 mid-flight delegation exhausted context; cycle 3's direct-Enso retry hit an unrelated tool-argument parse error) suggests checkpoint-3-class work on this lease may not be a purely stochastic retry target. Cycle count: **1**. Candidate home: `./JIKIJITSU.md`'s retry policy — consider whether two consecutive non-declarative failures on one session should escalate (e.g., smaller checkpoint scope, different worker configuration) rather than repeating the identical retry shape.

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md`, `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **3** (SIGNAL LOSS cycle 1 failure, cycle 2 and cycle 3 preventive successes). Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and preserve checkpoint counts across crash-recovery residual commits.** Cycles observed: **3** (SIGNAL LOSS cycle 1 crash-shaped SESSION-04, cycle 2 block-shaped SESSION-07, cycle 3 crash-shaped SESSION-07 retry 1). Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso at spawn time, not by mid-flight delegation.** Cycles observed: **1** (SESSION-07; cycle 3 applied the fix but the retry failed for an unrelated reason before the routing choice could be re-tested). Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic or Forge's per-session worker-mix hint.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1** (SESSION-07 blocked at 2/5). Candidate home: `./FORGE.md` decomposition heuristics — checkpoint granularity for UI-dominant leases.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1** (SESSION-07 + SESSION-08 both worked around missing shared CSS). Candidate home: `./FORGE.md` decomposition — when two concurrent leases both consume shared shell components, style ownership belongs to an earlier serial lease.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1** (SESSION-07 retry 1, following cycle 2's mid-flight-delegation exhaustion). Candidate home: `./JIKIJITSU.md` retry policy.

### Roshi entry

Reconciled 4 arch files (M17, M19, M20, M22) to record SESSION-07 retry 1's residual composer files as explicitly unverified, non-checkpoint work distinct from the verified checkpoints 1–2 and SESSION-08 surfaces beside them; corrected an inherited path error in M20 (composer lands under `./src/app/screens/build/composer/`, not `./src/app/screens/composer/`) by resolving to what git actually shows. Module registry unchanged — no new module boundary shipped. Two framework observations (git-commit pathspec scoping; crash-vs-blocked classification) now cross the three-cycle mark but both target Robe files Roshi cannot edit, so nothing was folded into `./FORGE-CONFIG.md`; they are logged for a human to fold into `./JIKIJITSU.md` with higher confidence. One new observation queued at count-of-1: escalate retry strategy after two consecutive non-declarative failures on one session.

---

## 2026-08-28 — Cycle 4 · SIGNAL LOSS / match-setup-route

First cycle of a new feature (`match-setup-route`) on the same program. Session numbers restart at 01, so this cycle's SESSION-01..04 are distinct from `full-v1`'s SESSION-01..08.

### What ran

Jikijitsu planned four sessions across three waves. Wave 1 ran `match-setup-route` SESSION-01 (app-level FlowStore provider seam) and SESSION-02 (deterministic map + AI setup preparation) concurrently on literally disjoint write sets — both completed 3/3. SESSION-03 (launch-contract extension + match/result consumers) rolled into the freed slot and returned a Zen transport error (`API Error: Server error mid-response`) with no parseable handoff JSON and 0/3 checkpoints; no source committed under its lease. Its dependent SESSION-04 (routed setup screen) was not launched. Program state at cycle close: 2 of 4 sessions done, SESSION-03 blocked at 0, SESSION-04 pending, 6 Mu checkpoint commits landed this cycle, working tree clean.

### What I reconciled

- Read: the Final Report (`./program/signal-loss/prompts/match-setup-route/FINAL-REPORT.md`), `STATE.md` in full, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, and all three prior `ROSHI-LOG.md` entries. Grounded every claim against `git log --oneline -40`, `git diff --stat cf6f443..b20a0d7`, per-commit `git show`, and the on-disk `./src/app/**` / `./tests/app/**` tree.
- Only `M17-app-state-bridge.md` carried Jikijitsu's mid-run appends this cycle (two stapled deltas: `<!-- SESSION-01 -->`, `<!-- SESSION-02 -->`). Rewrote M17 into one coherent description: folded the flow-provider seam into the Core-stores Public API, promoted the map-generation client / setup-preparation service / setup facade from stapled deltas into proper Public API subsections, and **removed a live contradiction** — the body previously called `./src/app/bridge/mapgen-client.ts` "fully unstarted, pending a further SESSION-07 retry," but git shows `match-setup-route` SESSION-02 shipped and verified it. Updated Status, Internal Structure, the launch-payload-gap and shared-worker-factory conventions, and Change History; deleted the now-folded staples. Added a short note flagging the cross-feature session-number collision so bare `SESSION-0N` (full-v1) reads distinctly from `match-setup-route` SESSION-0N.
  - `./program/signal-loss/arch/M17-app-state-bridge.md`
- Reconciled sibling files that this cycle's shipped work touched or re-attributed:
  - `./program/signal-loss/arch/M22-verification-tests.md` — recorded the new verified `./tests/app/setup-generation/**` subtree (20 tests) and `./tests/app/core/flow-context.test.tsx`.
  - `./program/signal-loss/arch/M21-app-bootstrap.md` — recorded the one sanctioned shell edit: SESSION-01's 5-line `FlowStoreProvider` mount in `./src/app/main.tsx` (git-verified), which M21's "never edit the shell" invariant had not anticipated.
  - `./program/signal-loss/arch/M20-screens.md` — the `#/setup` route's M17 dependencies (mapgen client + preparation service) now exist, so its "needs the typed mapgen worker client … fully unstarted" line was stale; re-attributed the setup route from a "SESSION-07 retry" to its true owner, `match-setup-route` SESSION-04 (not launched; blocked behind SESSION-03). Left composer / `#/result` as full-v1 SESSION-07 territory.
  - `./program/signal-loss/arch/M19-ui-components.md` — aligned the setup component subtree's ownership to `match-setup-route` SESSION-04 to match M20 (sibling consistency).
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): no update. Every file shipped this cycle falls inside an existing `Owns` contract — `./src/app/store/**` and `./src/app/bridge/**` under M17, `./src/app/main.tsx` under M21, tests under M22. No new module boundary shipped. The registry describes contract, not implementation status.

### What I did NOT promote to a convention

This cycle's Granularity feedback reports both completed sessions met their declared checkpoint counts, no context exhaustion, and no ownership overlap requiring a wave-plan correction — no Forge-granularity pattern to fold into `./FORGE-CONFIG.md`. The two recurring patterns that touched this cycle are both Robe (`./JIKIJITSU.md` / `./MU.md`) concerns Roshi cannot edit, so nothing was added to `./FORGE-CONFIG.md`:

- **Scope `git commit` pathspec, not only `git add`.** Recurred: SESSION-02's transient first checkpoint (`00eafae`) briefly swept in `M17-app-state-bridge.md` (outside its lease) because SESSION-01's arch delta was staged in the shared index; Mu detected it and amended to `767575a`, keeping every surviving checkpoint lease-only. Same shared-index-contamination shape as full-v1 cycle 1's `cab5120`. Cycle count now **4** (full-v1 c1 failure, c2 + c3 preventive, `match-setup-route` failure-and-fix). Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed with no parseable handoff" from "session declared itself blocked."** SESSION-03 crashed on a Zen transport error with 0 checkpoints and no handoff, yet the Final Report and `STATE.md` both label it "blocked" — the label/mechanism mismatch is exactly the ambiguity this observation names. Cycle count now **4** (full-v1 c1 crash, c2 declared block, c3 crash, `match-setup-route` crash). Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.

### New observation this cycle

- **Feature-qualify session references in `arch/` once a program runs more than one feature.** `match-setup-route` restarts session numbering at 01, so `arch/` now holds two independent SESSION-01 / SESSION-02 identities (full-v1's and this feature's) that collide by number. I disambiguated inside M17 with an explicit feature-qualifier note and by writing this cycle's sessions as `` `match-setup-route` SESSION-0N ``, but the pattern will recur every new feature. Cycle count: **1**. Candidate home: an `arch/`-authoring convention (Roshi practice, and/or a Forge/Jikijitsu instruction to stamp the feature slug beside session numbers in mid-run arch appends).

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md`, `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and label the result accordingly.** Cycles observed: **4** (this cycle a crash mislabeled "blocked"). Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso at spawn time, not by mid-flight delegation.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic or Forge's per-session worker-mix hint.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition heuristics.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` retry policy.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Cycles observed: **1** (first multi-feature cycle). Candidate home: `arch/`-authoring convention / mid-run arch-append instruction.

### Roshi entry

First `match-setup-route` cycle: reconciled 5 arch files (M17, M19, M20, M21, M22). Folded M17's two mid-run staples into one coherent description and resolved a live contradiction — `mapgen-client.ts`, marked "fully unstarted, pending a SESSION-07 retry," is in fact shipped and verified by `match-setup-route` SESSION-02, per git. Re-attributed the `#/setup` route and setup component/test subtrees from stale "SESSION-07 retry" wording to their true owners (`match-setup-route` SESSION-03/04, blocked/not-launched), and recorded SESSION-01's sanctioned `main.tsx` provider-mount shell edit. Module registry unchanged — no new boundary. Two recurring Robe-targeted observations reached count-of-4 (git-commit pathspec scoping; crash-vs-blocked classification) but remain human-fold recommendations for `./JIKIJITSU.md` / `./MU.md`; nothing folded into `./FORGE-CONFIG.md`. One new count-of-1 observation: feature-qualify session references in `arch/` now that the program runs more than one feature.

---

## 2026-08-28 — Cycle 5 · SIGNAL LOSS / match-setup-route (retry continuation)

### What ran

The authorized fresh retry completed `match-setup-route` SESSION-03 from its prior transport failure, then completed dependent SESSION-04. SESSION-03 reached 3/3 checkpoints, shipping the complete transient launch contract and real five-roster match consumption. SESSION-04, launched with Enso after that dependency completed, reached 4/4 checkpoints, shipping the self-registering `#/setup` route and its deterministic prepare/review/deploy flow. The feature is now 4/4 complete; the continuation reported seven checkpoint commits, clean leases, and no residual gap.

### What I reconciled

- Read the retry Final Report, full `STATE.md`, every `./program/signal-loss/arch/*.md` record, `./program/signal-loss/FORGE-CONFIG.md`, and all four prior Roshi entries. Grounded the reconciliation in the checkpoint commits `d555bcd` through `78806e7`, their recorded completion commits, and the on-disk app and test tree.
- Rewrote the `<!-- SESSION-03 -->` staple in `./program/signal-loss/arch/M17-app-state-bridge.md` into its coherent core-store, match-store, and invariant sections. The prior temporary launch-payload-gap / duplicate-human text is resolved: `CompleteMatchLaunchConfig` now carries the prepared data transiently, `MatchStore.boot` creates `[human, ai1, ai2, ai3, ai4]`, snapshots the consumed payload, and `MatchScreen` provides a truthful recovery path when it cannot boot.
- Reconciled the stale blocked/not-launched status of the setup surface across `./program/signal-loss/arch/M19-ui-components.md`, `./program/signal-loss/arch/M20-screens.md`, and `./program/signal-loss/arch/M22-verification-tests.md`. These now describe the delivered setup controls, roster picker, map and AI review, self-registration, deployment handoff, targeted launch tests, and three-browser direct-route regression once each.
- **Module registry:** unchanged. All delivered paths remain within the existing M17, M19, M20, and M22 `Owns` contracts. `./program/signal-loss/FORGE-CONFIG.md` remains unchanged.

### What I did NOT promote to a convention

The Final Report's granularity feedback reported no scope, context, or lease issue. No program convention crossed the evidence threshold, and none was added to `./program/signal-loss/FORGE-CONFIG.md`.

- **Route UI-dominant sessions to Enso at spawn time.** The successful Enso-at-spawn SESSION-04 is a second cycle of evidence for the routing practice (following full-v1 SESSION-07's mid-flight correction), but one successful retry does not yet establish a three-cycle program rule. Count: **2**.
- The feature-qualified session-reference observation remains at **1**: this continuation uses the same second feature, rather than supplying another multi-feature-cycle observation.

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md`, `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and label the result accordingly.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso at spawn time, not by mid-flight delegation.** Cycles observed: **2**. Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic or Forge's per-session worker-mix hint.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition heuristics.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` retry policy.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Cycles observed: **1**. Candidate home: `arch/`-authoring convention / mid-run arch-append instruction.

### Roshi entry

Retry completion reconciled four arch files (M17, M19, M20, M22) and removed M17's SESSION-03 staple. The former temporary launch-payload gap, blocked `#/setup` ownership, and absent test-record wording are resolved to the shipped, verified state. Module registry and `./program/signal-loss/FORGE-CONFIG.md` remain unchanged. No convention was promoted; the Enso-at-spawn observation advances to count-of-2, while the two count-of-4 Robe recommendations remain recommendations only.

---

## 2026-08-28 — Cycle 6 · SIGNAL LOSS / fix-generated-map

New feature (`fix-generated-map`) on the same program — three defect repairs on already-shipped setup/match code. Session numbers restart again: this cycle's SESSION-01..03 are distinct from `full-v1`'s and `match-setup-route`'s.

### What ran

Jikijitsu ran all three sessions concurrently in one wave (disjoint write sets). SESSION-01 (fit the setup map preview) 2/2, SESSION-02 (unique excluded-roster-row keys) 2/2, SESSION-03 (stabilize the match-store external-store snapshot) 2/2. Feature 3/3 complete; six Mu checkpoint commits (`df18f65` → `0790cc6` less the completion records), no lease violations, no checkpoint shortfalls, working tree clean. The three fixes: `MapPreview` viewBox derived from centered `map.bounds` via `FX_ONE`; `RosterPicker` excluded rows keyed by namespaced source identity (`saved-<id>` / `prebuilt-<id>`); `useMatchStore.getSnapshot` caches inside the getter so derived selector arrays keep a stable reference for React's external-store contract.

### What I reconciled

- Read: the Final Report (`./.forge/final-report.md`), `STATE.md` in full, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, `./program/signal-loss/prompts/fix-generated-map/MASTER.md`, and all five prior `ROSHI-LOG.md` entries. Grounded every claim against `git log --oneline -30`, `git diff --stat 1b5c898..0790cc6`, and per-file `git show` of the pre/post `context.tsx`.
- **`arch/` — no change this cycle, and this is a reconciliation result, not an omission.** All three repairs sit below the arch's descriptive altitude and none contradicts a documented claim:
  - Jikijitsu stapled no mid-run delta into any arch file this cycle — the 7-file cycle diff touches no `./program/signal-loss/arch/**` path (verified by `git diff --stat`); the arch mtimes are cycle-5 Roshi's.
  - `M19-ui-components.md`'s one-line `MapPreview` ("accepted-map review") and `RosterPicker` ("legal saved and prebuilt human-roster selection") descriptions are higher-altitude than a viewBox derivation or a React key namespace; both remain true.
  - `M17-app-state-bridge.md`'s only reference to the fixed hook — line 19, "`useFlowStore` … mirroring `useMatchStore`; re-renders only when the selected slice changes by reference (or `equal`)" — states the external-store *contract* SESSION-03 made real. Pre-fix, `getSnapshot` returned a fresh filtered array, so that contract was violated in practice for the match store (the reported `getSnapshot`/maximum-update-depth loop). The fix moves the cache inside `getSnapshot`; the post-fix code comment matches the arch wording verbatim. The doc was already describing the intended contract, so the fix brings reality to the doc, not the doc to reality — nothing to rewrite. Rewriting would append implementation detail below altitude, against Vow 2.
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): no update. All six touched files fall inside existing `Owns` contracts — `MapPreview.tsx` / `RosterPicker.tsx` under M19, `store/match/context.tsx` under M17, the three tests under M22. No new module boundary shipped.

### What I did NOT promote to a convention

The Final Report's granularity feedback is empty — both declared checkpoint counts met on every session, no context exhaustion, no ownership overlap needing a wave-plan correction. No Forge-authoring pattern to fold into `./program/signal-loss/FORGE-CONFIG.md`. One standing Robe-targeted pattern recurred:

- **Scope `git commit` pathspec, not only `git add`.** Recurred this cycle: SESSION-02 found `tests/e2e/match/match-runtime-stability.spec.ts` (SESSION-03's lease) already staged in the shared index at commit time and used explicit `git commit -m … -- <path>` so its two commits carried only its own lease files (confirmed by its own `git show`). Same shared-index-contamination shape as `full-v1` cycle 1's `cab5120`; another preventive success. Cycle count now **5** (full-v1 c1 failure, c2 + c3 preventive, `match-setup-route` c4 failure-and-fix, `fix-generated-map` c6 preventive). Still a `./JIKIJITSU.md` / `./MU.md` concern Roshi cannot edit — no `./FORGE-CONFIG.md` change.

The crash-vs-blocked pattern gained no new data point (all three sessions completed cleanly). SESSION-03's aside — the "Own constructs" accessible name resolving to two elements, disambiguated in-test via `role=region` — is a one-off test-authoring detail at count-of-1, not queued.

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md`, `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **5**. Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and label the result accordingly.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso at spawn time, not by mid-flight delegation.** Cycles observed: **2**. Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic or Forge's per-session worker-mix hint.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition heuristics.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` retry policy.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Cycles observed: **1**. Candidate home: `arch/`-authoring convention / mid-run arch-append instruction.

### Roshi entry

`fix-generated-map` was a three-defect repair cycle on already-shipped setup/match code. No arch file changed — a reconciliation result, not an omission: Jikijitsu stapled no delta, all three repairs sit below the arch's descriptive altitude, and the only doc reference to the fixed hook (M17's `useMatchStore` external-store contract) is one the SESSION-03 `getSnapshot` fix now upholds rather than contradicts. Module registry and `./program/signal-loss/FORGE-CONFIG.md` unchanged — every touched file falls inside existing M17/M19/M22 `Owns`. No convention promoted. The git-commit-pathspec observation advances to count-of-5 on a fresh preventive success (SESSION-02) but remains a Robe recommendation Roshi cannot fold in.

---

## 2026-08-28 — Cycle 7 · SIGNAL LOSS / fix-deployment-placement

New feature (`fix-deployment-placement`) on the same program — an affordance/input repair that makes the already-shipped human deployment interaction discoverable and complete at the board/screen boundary. Session numbers restart again: this cycle's SESSION-01 is distinct from `full-v1`'s, `match-setup-route`'s, and `fix-generated-map`'s.

### What ran

Jikijitsu ran the single session in one wave (sole exclusive lease, no concurrent sibling). SESSION-01 completed 3/3 checkpoints. The session was launched as Mu and, after startup triage identified UI-dominant risk, passed to Enso under a sanctioned mid-flight Brush Pass; it committed all three checkpoints itself (`69fb9cb` CP1 board, `8b24d74` CP2 screen/style/test, `7062e3b` CP3 command-gate/e2e), with Jikijitsu recording the handoff at `97c7e26`. Eight files touched, all inside the declared M18/M19/M20/M22 `Owns`; no lease violation, no arch fragment, working tree clean. Verification: 40 focused Vitest pass, 3 Playwright pass across Chromium/Firefox/WebKit, typecheck/lint/build green (seed `8592953eb8ce193f7fcdc987660b5fab`).

### What I reconciled

- Read: the Final Report (`./.forge/final-report.md`), `STATE.md` in full, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, the feature's `MASTER.md` / `SESSION-01.md` / `STATE.md`, and all six prior `ROSHI-LOG.md` entries. Grounded every claim against `git log --oneline`, `git diff --stat e05cfcf..7062e3b`, and per-checkpoint `git show --stat`, plus `git show 7062e3b:<path>` for the actual shipped public surface.
- **Reconciled 4 arch files (M18, M19, M20, M22).** This is the key judgment call of the cycle, and it departs from cycle 6's no-change outcome. The Final Report says "no architecture file changed and no architecture fragment was produced; the existing M18/M19/M20/M22 boundaries remain accurate" — true at the level it speaks to (module *boundaries* / the registry), but distinct from arch *completeness*. Unlike `fix-generated-map`'s below-altitude viewBox/key/hook fixes, this cycle shipped a genuinely new, at-altitude public surface that the arch enumerates and had simply omitted:
  - `./program/signal-loss/arch/M18-board-renderer.md` — the Public API block lists `paintTerrain(ctx, scene, cam)` / `paintOverlay(ctx, scene, cam)` signatures and the `BoardCanvas` component verbatim. SESSION-01 added the exported `DeploymentBoardState` prop plus `TerrainDeploymentOptions` / `OverlayDeploymentOptions` and an optional `deployment` param on both paint functions (verified in `git show 7062e3b:src/app/board/**`). Added the render-only deployment-presentation surface to Public API, a Conventions bullet (solid `YOUR SPAWN·VECTOR` region + outside dim; shape-not-colour hover cue per NFR-5; non-deployment output byte-for-byte unchanged; drafts stay M17-local), and a Change History row. This is documentation-completeness reconciliation, not contradiction resolution — the arch never claimed the board had no deployment path; it omitted a now-shipped one.
  - `./program/signal-loss/arch/M19-ui-components.md` — refined the `CommandBar` bullet and added a Change History row for the `DEPLOYMENT` gate: `BEGIN MATCH` disabled with `N CONSTRUCTS UNPLACED` until the human roster is complete, `Ctrl/Cmd+Enter` guarded by the same predicate, `applyDeployment()` left as final engine authority (grounded in `git show 7062e3b:src/app/components/match/CommandBar.tsx`).
  - `./program/signal-loss/arch/M20-screens.md` — the `DeploymentMode` line already read "board + spawn-region click placement, HUD progress + reason," which was accurate at contract altitude; enriched it to name selected-or-next-unplaced placement, reposition/unplace, the two live rejection reasons, and the `DeploymentBoardState` handoff to `BoardCanvas` (sibling coherence with M18), plus a Change History row noting the still-out-of-lease M15/M17 AI-deployment orchestration that gates the full `MOVEMENT_PLOT` transition.
  - `./program/signal-loss/arch/M22-verification-tests.md` — recorded the two new test files in the App-match and Browser-e2e rows and a Change History entry: `deployment-mode.test.tsx` (static contract, in the 40-pass focused run) and `deployment-placement.spec.ts` (3-pass Chromium/Firefox/WebKit setup→placement + gating regression).
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): no update. All eight touched files fall inside existing `Owns` contracts — board files under M18, `CommandBar.tsx` / `match-shell.css` under M19, `DeploymentMode.tsx` under M20, the two tests under M22. No new module boundary shipped.
- Every arch session reference this cycle is written feature-qualified (`fix-deployment-placement` SESSION-01) so bare `SESSION-01` still reads as `full-v1`'s.

### What I did NOT promote to a convention

The Final Report's Granularity feedback for Forge is explicitly "None" — the single exclusive lease landed all three declared checkpoint boundaries with no context exhaustion and no concurrency conflict. No Forge-authoring pattern to fold into `./program/signal-loss/FORGE-CONFIG.md`; nothing was added there.

- **Scope `git commit` pathspec, not only `git add`.** No new data point: this was a single-session wave, so there was no concurrent sibling and no shared-index contamination opportunity. Count unchanged at **5**.
- **Distinguish "session crashed" from "session declared blocked."** No new data point: the session completed cleanly, 3/3. Count unchanged at **4**.
- **Route UI-dominant sessions to Enso at spawn time, not by mid-flight delegation.** This cycle is a genuine third observation, and it is *counter-evidence*, not reinforcement: SESSION-01 was launched as Mu, triaged as UI-dominant at startup, and delegated to Enso mid-flight under a sanctioned Brush Pass — and it succeeded 3/3 with a clean lease. So the evidence is now mixed: one mid-flight *failure* (full-v1 SESSION-07, context exhaustion), one Enso-at-spawn *success* (`match-setup-route` SESSION-04), and one sanctioned mid-flight *success* (this cycle). The takeaway shifts from "mid-flight delegation is harmful" toward "early startup triage is what matters; a Brush Pass caught before real work is committed is not a failure mode." Counting this as **3 cycles observed (mixed signal)** and softening the recommendation accordingly; still a `./JIKIJITSU.md` Robe concern Roshi cannot edit.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Applied concretely this cycle — four arch files stamped with `fix-deployment-placement` SESSION-01 — the second cycle where the practice was actively needed (after cycle 4 introduced it). Count advances to **2**.

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md`, `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **5**. Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and label the result accordingly.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso — or accept an early sanctioned Brush Pass.** Cycles observed: **3 (mixed)**. The signal is now that startup triage timing, not spawn-vs-mid-flight per se, predicts success. Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic / Brush-Pass timing guidance, or Forge's per-session worker-mix hint.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition heuristics.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` retry policy.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Cycles observed: **2**. Candidate home: `arch/`-authoring convention / mid-run arch-append instruction.

### Roshi entry

`fix-deployment-placement` repaired the human deployment interaction at the board/screen boundary in a single 3/3 session. Reconciled 4 arch files (M18, M19, M20, M22) — a deliberate departure from cycle 6's no-change outcome, because this cycle shipped a genuinely at-altitude new public surface the arch enumerates: M18's `BoardCanvas` gained an exported render-only `DeploymentBoardState` and optional deployment params on `paintTerrain` / `paintOverlay`, with matching behavioral notes for M19's `CommandBar` deployment gate and M20's `DeploymentMode` placement/editing, and M22's two new deployment tests recorded. This is documentation-completeness reconciliation of an omission, not resolution of a contradiction; the Final Report's "no arch change needed" holds for module *boundaries* and the registry, both left unchanged, as was `./program/signal-loss/FORGE-CONFIG.md` (granularity feedback None). No convention promoted. The Enso-routing observation reaches count-of-3 but as mixed signal — a sanctioned mid-flight Brush Pass succeeded here — reframing the recommendation around triage timing; feature-qualified `arch/` session references advance to count-of-2. Both remain Robe recommendations Roshi cannot fold in.

---

## 2026-08-29 — Cycle 8 · SIGNAL LOSS / fix-match-start

New feature (`fix-match-start`) on the same program — repairs the match-start path end to end so a complete five-squad deployment reaches movement plotting. Session numbers restart again: this cycle's SESSION-01/02 are distinct from `full-v1`'s, `match-setup-route`'s, `fix-generated-map`'s, and `fix-deployment-placement`'s.

### What ran

Jikijitsu ran both sessions concurrently in one wave (disjoint write sets; only SESSION-01 held `port:5173` and `/tmp/signal-loss-e2e`). SESSION-01 (wire AI deployment into match start) 4/4; SESSION-02 (preflight human deployment footprints) 2/2. Feature 2/2 complete; six Mu checkpoint commits (`b11ac9c` → `f42de88` less the completion records), binding Zen, wall clock 18m 38s. One lease violation was caught and repaired mid-flight (see below). Residual gap: a fully-parallel three-browser e2e produced one WebKit first-paint timeout at the pre-existing 5s assertion limit under heavy shared preview-server load; each browser passed alone and all three passed sequentially with `--workers=1` — no product-code failure implicated.

### What I reconciled

- Read: the Final Report (`./.forge/final-report.md`), `STATE.md` in full, every file under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, and all seven prior `ROSHI-LOG.md` entries. Grounded every claim against `git log --oneline -30`, `git diff --stat 00813fb^..HEAD`, and the on-disk source of every new/changed public surface (`ai-client.ts`, `ai-config.ts`, `ai-deployment.ts`, `match-store.ts`, `MatchScreen.tsx`, `deployment-placement.ts`, `CommandBar.tsx`, `data/ai.weights.json`).
- **Reconciled 5 arch files (M02, M17, M19, M20, M22).** Jikijitsu stapled one mid-run delta this cycle — a `<!-- SESSION-01 -->` fragment at the tail of `M17-app-state-bridge.md` — and it described cross-module work (M17 stores/bridge, plus M19 `CommandBar` and M20 `MatchScreen`). Like cycle 7, this cycle shipped genuinely new at-altitude public surface the arch enumerates, so this is documentation-completeness reconciliation, and the cross-module bullets were folded to their owning modules:
  - `./program/signal-loss/arch/M17-app-state-bridge.md` — dissolved the stapled `<!-- SESSION-01 -->` delta into the coherent body: added `browserAiWorker()` to the AI-client bridge signature block, a new "Match AI deployment" Public API subsection for `ai-config.ts` (`resolveMatchAiConfig`) and `ai-deployment.ts` (`startAiDeployment` + the `applyDeployment()` all-`READY_DEPLOY` gate), an Internal Structure row, a Status sentence, and one Change History row. The `MatchScreen` / `CommandBar` bullets that had been carried in the M17 staple were removed here and recorded in their owning modules (M20 / M19) instead of duplicated.
  - `./program/signal-loss/arch/M20-screens.md` — recorded the `MatchScreen` `AiDeploymentController` mount (SESSION-01) and `DeploymentMode`'s new engine-backed `deployment-placement.ts` legality delegation (SESSION-02). **Resolved a now-stale claim:** the `fix-deployment-placement` change-history row said the full `MOVEMENT_PLOT` transition "still awaits out-of-lease in-match AI deployment orchestration (M15/M17)" — that orchestration shipped this cycle, so the new SESSION-01 row explicitly closes it (the older dated row is left as the accurate record of what was true then).
  - `./program/signal-loss/arch/M19-ui-components.md` — extended the `CommandBar` bullet + a Change History row: `BEGIN MATCH` now also gates on every launch AI squad at `READY_DEPLOY`, with `WAITING FOR AI DEPLOYMENT` / `AI DEPLOYMENT FAILED` status via `data-testid="deploy-ai-status"`.
  - `./program/signal-loss/arch/M22-verification-tests.md` — recorded the new `ai-deployment.test.ts` / `command-bar.test.tsx` / `match-start.test.ts` / `deployment-placement.test.ts`, the extended `deployment-mode.test.tsx` and five-squad e2e, in the App-match / Browser-e2e rows and two Change History entries.
  - `./program/signal-loss/arch/M02-authored-content.md` — recorded the new `./data/ai.weights.json` app-side AI input: a static release-coefficient bundle validated at the app boundary by M17's `resolveMatchAiConfig`, explicitly NOT engine catalog/rule state and NOT validated by `loadCatalog`.
- **Module registry** (in `./program/signal-loss/FORGE-CONFIG.md`): no update. Every touched file falls inside an existing `Owns` contract — `./data/ai.weights.json` under M02, `./src/app/store/**` + `./src/app/bridge/**` under M17, `CommandBar.tsx` under M19, `./src/app/screens/match/**` under M20, tests under M22. No new module boundary shipped; the registry describes contract, not implementation status. `./program/signal-loss/FORGE-CONFIG.md` is otherwise unchanged.

### What I did NOT promote to a convention

The Final Report's Granularity feedback for Forge is explicitly "none" — both sessions met their declared checkpoint counts with disjoint write sets, no context exhaustion, and no wave-plan correction. No Forge-authoring pattern crossed the threshold; nothing was added to `./program/signal-loss/FORGE-CONFIG.md`. Standing patterns:

- **Scope `git commit` pathspec, not only `git add`.** Recurred this cycle: SESSION-02's first attempt at checkpoint 2 transiently committed concurrently-staged SESSION-01 paths (shared-index contamination); Mu detected it and rewrote the checkpoint before handoff, and the two final reachable SESSION-02 commits plus SESSION-01's finals are lease-clean per the Final Report's lease-violations section. Same shape as `full-v1` cycle 1's `cab5120`; another caught-and-fixed instance. Cycle count now **6**. Still a `./JIKIJITSU.md` / `./MU.md` commit-protocol concern Roshi cannot edit — and the fix (scope the *commit* pathspec) would edit `./program/signal-loss/FORGE-CONFIG.md`'s Git Configuration table, which is Mu-correctness territory outside Roshi's ownership — so no `./FORGE-CONFIG.md` change.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Applied again this cycle — all five reconciled files stamp `fix-match-start` SESSION-0N so bare `SESSION-0N` still reads as `full-v1`'s. Count advances to **3**, crossing the three-cycle signal mark. The actionable half (Roshi's own arch-authoring practice) is already standing practice; the promotable half is a mid-run arch-append instruction for Jikijitsu (Robe), so it stays a recommendation rather than a `./FORGE-CONFIG.md` convention (it governs doc authorship, not Forge decomposition or Mu implementation, so it is outside Vow 4's promotion criterion).

The crash-vs-blocked (**4**) and Enso-routing (**3, mixed**) patterns gained no new data point — both sessions ran as Mu and completed cleanly with no delegation.

### New observation this cycle

- **Lower e2e browser parallelism or raise the first-paint assertion timeout under a shared preview server.** The residual gap and SESSION-01's follow-up both report one WebKit first-paint timeout at the pre-existing 5s limit only when all three browsers hit one shared preview server simultaneously; sequential and single-browser runs pass. Cycle count: **1** (one cycle is noise). Candidate home: `./program/signal-loss/FORGE-CONFIG.md` CI / e2e-parallelism guidance or `.github/workflows/ci.yml` (M01) — a future cycle can fold it if it recurs.

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md`, `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **6**. Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and label the result accordingly.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso — or accept an early sanctioned Brush Pass.** Cycles observed: **3 (mixed)**. The signal is that startup triage timing, not spawn-vs-mid-flight per se, predicts success. Candidate home: `./JIKIJITSU.md` spawn-time routing heuristic / Brush-Pass timing guidance, or Forge's per-session worker-mix hint.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Cycles observed: **3**. Candidate home: `arch/`-authoring convention / mid-run arch-append instruction (Jikijitsu).
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition heuristics.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` retry policy.
- **Lower e2e browser parallelism or raise the first-paint assertion timeout under a shared preview server.** Cycles observed: **1**. Candidate home: `./program/signal-loss/FORGE-CONFIG.md` CI guidance or `.github/workflows/ci.yml` (M01).

### Roshi entry

`fix-match-start` repaired the match-start path end to end across two clean sessions (SESSION-01 4/4 AI deployment + commit gate, SESSION-02 2/2 human footprint preflight). Reconciled 5 arch files (M02, M17, M19, M20, M22): dissolved M17's stapled `<!-- SESSION-01 -->` delta into coherent Public API / Internal Structure / Change History and pushed its cross-module `MatchScreen` / `CommandBar` bullets down to their owning modules (M20 / M19) rather than duplicating them; recorded the new `ai-config` / `ai-deployment` coordinator, the `applyDeployment()` all-`READY_DEPLOY` gate, the `MatchScreen` AI controller, the `CommandBar` AI-readiness gate, the engine-backed `deployment-placement.ts` preflight, the new `./data/ai.weights.json` app input, and the new tests. Resolved one live-stale claim — M20's note that the `MOVEMENT_PLOT` transition "still awaits out-of-lease AI deployment orchestration" is closed now that this cycle shipped it. Module registry and `./program/signal-loss/FORGE-CONFIG.md` unchanged — no new boundary, granularity feedback none. No convention promoted. The git-commit-pathspec observation advances to count-of-6 on a caught-and-fixed lease contamination, and feature-qualified `arch/` session references reach count-of-3; both remain Robe / doc-authorship recommendations Roshi cannot fold into `./FORGE-CONFIG.md`. One new count-of-1 observation: lower e2e browser parallelism (or raise the first-paint assertion timeout) under the shared preview server.

---

## 2026-08-29 — Cycle 9 · SIGNAL LOSS / complete-match-loop

### What ran

Jikijitsu ran five sessions across three waves and collected parseable **done** handoffs for all five. All 15/15 declared checkpoints landed: phase-safe movement/attack AI and deferred authority (SESSION-01), event-true playback (SESSION-02), truthful human combat (SESSION-03), exactly-once pool accounting plus authoritative summary derivation (SESSION-04), and the direct result/rematch/browser loop (SESSION-05). Repository gates passed (`typecheck`, lint, 94 files / 877 unit tests, build). Development-server browser checkpoints passed across Chromium/Firefox/WebKit for the real combat flow and Chromium for the bounded full loop. The prescribed production-preview runs remained red before setup because the existing Vite-ignored migration import is absent from the static bundle; this is an M13/M14 integration limitation outside every feature lease, not a value Roshi invents or resolves in code.

### What I reconciled

- Read the Final Report (`./.forge/final-report.md`), the complete feature `STATE.md`, all 22 files under `./program/signal-loss/arch/**`, `./program/signal-loss/FORGE-CONFIG.md`, and all eight prior entries in `./program/signal-loss/ROSHI-LOG.md`. Grounded the cycle against the 15 checkpoint commits (`5c178d8` through `7937782`), completion/arch commits, the on-disk source/test tree, and `git log --oneline -45`.
- Reconciled the six Jikijitsu staples into their owning module descriptions and removed every `<!-- SESSION-0N -->` fragment:
  - `./program/signal-loss/arch/M09-match-resolution.md` — folded exact normalized `MovedEvent.plottedPath` into the event API/invariants and exactly-once completed-round pool waste into the resolution contract.
  - `./program/signal-loss/arch/M17-app-state-bridge.md` — folded exact `READY_MOVE` / `READY_ATTACK`, four-worker `startAiPhase`, immutable before/after playback authority, append-only history/opponent-model updates, authoritative result derivation, and direct transient flow payload into the existing store/core sections. Resolved the live obsolete DOM-event result-handoff claim to the shipped direct FlowStore write.
  - `./program/signal-loss/arch/M18-board-renderer.md` — folded `projectPlaybackFrame` and `BoardCanvas.playbackProgress` into Public API and the public-safe event-prefix projection invariant.
  - `./program/signal-loss/arch/M19-ui-components.md` — folded playback transport, the public-position engine-backed attack model, guarded combat controls, and the delivered result subtree into their owning API sections. Resolved the status/internal-structure claim that result components were still unstarted.
  - `./program/signal-loss/arch/M20-screens.md` — folded all-phase AI control, playback/combat behavior, direct result derivation/handoff, and the self-registering `#/result` route into the coherent screen record. Removed `#/result` from Pending routes and resolved its unstarted/custom-event wording.
  - `./program/signal-loss/arch/M22-verification-tests.md` — folded the real-match helper, focused engine/app/result coverage, 94-file/877-test repository gate, development-server browser proof, and production-preview acceptance limitation into the test registry once.
- Reconciled one sibling record not stapled by Jikijitsu: `./program/signal-loss/arch/M14-platform-adapters.md` now records the confirmed production-preview limitation at its actual architectural owner — the existing Vite-ignored migration preload shim — rather than leaving the failure only in one feature Final Report.
- **Module registry:** unchanged. Every delivered path remains inside M02/M09/M17/M18/M19/M20/M22's existing `Owns` contracts, and the M14 note documents an existing boundary rather than a new module. `./program/signal-loss/FORGE-CONFIG.md` remains unchanged.

### What I did NOT promote to a convention

The Final Report's Granularity feedback is explicitly **None**: all five sessions met every checkpoint without context exhaustion or a wave-plan correction. No program-specific Forge/Mu convention crossed the three-cycle threshold, so nothing was added to `./program/signal-loss/FORGE-CONFIG.md`.

- **Scope `git commit` pathspec, not only `git add`.** Recurred: SESSION-02 reported a concurrently staged path briefly entered checkpoint 2 before amendment; the surviving commit and all normalized `filesTouched` are lease-clean. Count advances to **7**. This remains a `./JIKIJITSU.md` / `./MU.md` commit-protocol concern outside Roshi's Robe authority and outside the Conventions-only slice Roshi owns in `./program/signal-loss/FORGE-CONFIG.md`.
- **Feature-qualify session references in `arch/`.** Applied across all seven reconciled files because session numbers restart per feature. Count advances to **4**. The practice remains an arch-authoring / mid-run-append instruction rather than a Forge decomposition or Mu implementation convention.
- Crash-vs-blocked remains **4**; Enso/startup-triage remains **3 (mixed)**; combined visual working-set cap, shared-style ownership, and retry escalation remain **1** each. This cycle adds no evidence to those patterns.
- The earlier shared-preview first-paint parallelism observation remains **1**. This cycle's preview failure has a different cause (bundle omission before setup), so the two are not conflated.

### New observations this cycle

- **Preflight the production bundle's setup boot before feature browser acceptance.** The real feature flows passed under Vite development serving, but the prescribed production-preview suite could not reach setup because of a pre-existing M14 preload/bundle defect. Cycle count: **1**. Candidate home: human-owned scheduling / verification guidance; Roshi does not edit `./program/signal-loss/FORGE-CONFIG.md` Verification Commands.
- **Retain the requested terminal outcome and final hash in the session handoff/artifact.** SESSION-05 retained seed and completion round but omitted the concrete outcome/hash requested by the feature master, leaving Roshi to preserve the gap rather than invent values. Cycle count: **1**. Candidate home: `./JIKIJITSU.md` handoff/final-report evidence collection.

### Proposed for the framework

To be folded in by a human; Roshi does not edit `./FORGE.md` (absent in this checkout), `./MU.md`, `./ENSO.md`, or `./JIKIJITSU.md`.

- **Scope `git commit` pathspec, not only `git add`.** Cycles observed: **7**. Candidate home: `./JIKIJITSU.md` orchestration envelope or `./MU.md` checkpoint-commit protocol.
- **Distinguish "session crashed" from "session declared blocked," and label the result accordingly.** Cycles observed: **4**. Candidate home: `./JIKIJITSU.md` spawn/await/result-classification.
- **Route UI-dominant sessions to Enso — or accept an early sanctioned Brush Pass.** Cycles observed: **3 (mixed)**. Candidate home: `./JIKIJITSU.md` startup-triage / Brush-Pass timing guidance.
- **Feature-qualify session references in `arch/` for multi-feature programs.** Cycles observed: **4**. Candidate home: arch-authoring / Jikijitsu mid-run append instruction.
- **Cap combined visual working set per session at what one context can hold.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition heuristics.
- **Carve a shared-style owner before concurrent UI leases.** Cycles observed: **1**. Candidate home: `./FORGE.md` decomposition.
- **Escalate retry strategy after two consecutive non-declarative failures on the same session.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` retry policy.
- **Lower e2e browser parallelism or raise the first-paint assertion timeout under a shared preview server.** Cycles observed: **1**. Candidate home: program CI guidance / M01.
- **Preflight production-preview setup boot before feature browser acceptance.** Cycles observed: **1**. Candidate home: human-owned verification scheduling.
- **Retain requested terminal outcome/hash evidence in the session handoff.** Cycles observed: **1**. Candidate home: `./JIKIJITSU.md` evidence collection.

### Roshi entry

`complete-match-loop` completed 5/5 sessions and 15/15 checkpoints. Reconciled 7 arch files (M09, M14, M17, M18, M19, M20, M22): dissolved all six mid-run staples into their owning sections; recorded exact movement paths, exactly-once pool accounting, phase-safe worker AI, deferred playback authority/history/model updates, public-safe presentation/combat, authoritative result derivation, direct transient `#/result` handoff/rematches, and the expanded verification surface; resolved stale result-subtree/custom-event claims; and located the production-preview boot failure at M14's existing migration preload shim. Module registry and `./program/signal-loss/FORGE-CONFIG.md` unchanged; granularity feedback was None, so no convention promoted. Git-commit pathspec evidence advances to count-of-7 and feature-qualified arch references to count-of-4, both remaining Robe/doc-authoring recommendations. Two count-of-1 observations were added: preflight production-preview setup boot, and retain requested terminal outcome/hash evidence.
