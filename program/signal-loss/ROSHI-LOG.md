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
