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
