# Requirements — SIGNAL LOSS

**Status:** draft 1 · derived from `specs/idea.md`
**Scope:** full v1 as described in the idea document. No feature cuts.

---

## Reading This Document

- **FR-n** — functional requirement. Each has a user story and testable acceptance criteria.
- **NFR-n** — non-functional requirement. Measurable target.
- **A-n** — assumption. True unless corrected; downstream agents may rely on it.
- **OQ-n** — open question. Not yet decided. Must be resolved before the affected FR is implementable.
- **§Tunables** — named numeric constants. Values here are *initial* values, not final. Every one must be data-driven and adjustable without code changes (FR-30).

Where the idea document specified a number, it is carried through verbatim. Where it did not, a value is proposed here and marked tunable.

This document is technology-agnostic. Rendering, state management, persistence mechanism, string codec format, and file layout are Architect's. Screen layout, plotting interaction design, and visual language are Designer's.

---

## Locked Decisions

These were open at idea stage and are now settled. They are load-bearing for many requirements below.

| # | Decision |
|---|---|
| D-1 | **Continuous space.** Not grid or hex. Positions are continuous coordinates; paths are free-drawn polylines. |
| D-2 | **Movement collision: both stop.** When two constructs' plotted paths would put them in contact, both halt short. No pass-through, no priority, no displacement. |
| D-3 | **Reaction pool is strictly 1:1 and non-stackable.** 1 point = one posture on one construct for one round. 1 point = one called shot. Multiple points cannot be stacked on a single construct or single shot for greater effect. |
| D-4 | **Desktop only.** Mouse + keyboard. Tablet and phone are explicit non-goals for v1. |
| D-5 | **AI squads build from the identical catalog at the identical point budget** as the human, under the same legality rules. |

---

## Functional Requirements

### Part A — Build Zone

#### FR-1: Catalog browsing
- **User story:** As a builder, I want to see every chassis and mount available to me, with full stats and costs, so that I can theorycraft without hidden information.
- **Acceptance criteria:**
  - [ ] The full catalog is available from match one. No unlocks, no ownership gating, no currency.
  - [ ] Each chassis exposes: name, point cost, hardpoint layout (count and type per port), movement allowance, footprint size, and its complete dial (every state, in order).
  - [ ] Each mount exposes: name, point cost, hardpoint type required, and every stat it contributes (damage, range, and any modifiers).
  - [ ] No stat displayed to the builder differs from the stat used in resolution.
  - [ ] Catalog contents are identical to the catalog the AI builds from (D-5).

#### FR-2: Construct composition
- **User story:** As a builder, I want to load mounts into a chassis's hardpoints so that I can create a construct with an identity I chose.
- **Acceptance criteria:**
  - [ ] A construct is exactly one chassis plus zero or more mounts, each occupying one hardpoint.
  - [ ] A mount may only occupy a hardpoint whose type it matches. Type mismatches are rejected and the reason is stated.
  - [ ] A hardpoint holds at most one mount.
  - [ ] Hardpoints may be left empty. A construct with empty hardpoints is legal.
  - [ ] Construct point cost = chassis cost + sum of mounted mount costs + commander tag cost (if tagged).
  - [ ] The mount catalog spans at least the five families named in the idea: ICE, daemons, spikes, spoofers, wipes.
  - [ ] No chassis has a hardpoint layout that permits mounting one of every mount family simultaneously. (Enforces "nothing loads up with everything.")

#### FR-3: Commander tagging
- **User story:** As a builder, I want to tag one construct as commander and choose its type, so that my reaction economy and my doctrine are a build decision.
- **Acceptance criteria:**
  - [ ] Any chassis may be tagged commander. Commander is a modifier, not a unit class — no chassis is commander-only or commander-forbidden.
  - [ ] At least four commander types exist. Each has a point cost, a `commander_base` pool value, and a set of modifications it applies to the tagged chassis.
  - [ ] The four types collectively cover the axes named in the idea: integrity, movement, defense, and a fragile high-pool type.
  - [ ] Commander type modifications are applied to the chassis's dial and stats at build time and are visible in the build zone before committing.
  - [ ] A roster contains **exactly one** commander. Zero-commander and multi-commander rosters are illegal and are rejected with a stated reason.
  - [ ] Commander status is public information to all squads from round 1 (see FR-24).

#### FR-4: Point budget legality
- **User story:** As a builder, I want the budget enforced so that I know my roster is legal before I take it into a match.
- **Acceptance criteria:**
  - [ ] Budget is selectable from 25 to 200 inclusive in 25-point increments (8 values).
  - [ ] A roster's total cost must not exceed the budget. Underspending is legal.
  - [ ] Squad size is capped at `MAX_SQUAD` constructs regardless of budget, and requires at least 1.
  - [ ] Illegal rosters cannot be taken into a match, and the specific violation is stated.
  - [ ] Remaining points are displayed continuously during composition.

#### FR-5: Prebuilt rosters
- **User story:** As a new player, I want ready-made rosters so that I can play a real match before I understand the catalog.
- **Acceptance criteria:**
  - [ ] At least one prebuilt roster exists for every budget value in FR-4.
  - [ ] Every prebuilt is legal under FR-2, FR-3 and FR-4.
  - [ ] A prebuilt can be loaded, modified, and saved as a new roster without altering the original.
  - [ ] Prebuilts collectively use every chassis, every mount family, and every commander type at least once.

#### FR-6: Local collection
- **User story:** As a builder, I want my constructs and rosters kept between sessions so that my theorycraft accumulates.
- **Acceptance criteria:**
  - [ ] Constructs and rosters can be named, saved, renamed, duplicated, and deleted.
  - [ ] Saved content survives closing and reopening the browser (A-1).
  - [ ] All storage is local to the browser. No account, no network call, no server-side copy (see NFR-8).
  - [ ] Deletion requires confirmation.
  - [ ] The collection has no size cap imposed by the product beyond the storage medium's own limit; if that limit is reached, the failure is reported clearly rather than silently dropping data.

#### FR-7: String encoding and sharing
- **User story:** As a builder, I want to copy a construct or roster as text so that I can post it on Discord and someone else can paste it in.
- **Acceptance criteria:**
  - [ ] Any single construct encodes to a copy-pasteable text string.
  - [ ] Any roster encodes to a single copy-pasteable text string that carries all of its constructs with it — importing a roster requires no separate construct import.
  - [ ] Import → export round-trips to a semantically identical roster.
  - [ ] Import validates: malformed strings, strings referencing unknown catalog entries, and strings encoding illegal rosters are all rejected with a distinguishable, human-readable reason.
  - [ ] An imported roster's budget is carried in the string; import states the budget it was built for.
  - [ ] Import never silently repairs an illegal roster.
  - [ ] Strings contain no personal data and no identifiers beyond the roster itself.

*(Codec format, compression, and versioning strategy are Architect's.)*

---

### Part B — Match Setup

#### FR-8: Match configuration
- **User story:** As a player, I want to choose the budget, the map, and the difficulty before I commit, so that I control the shape of the match.
- **Acceptance criteria:**
  - [ ] Player selects: point budget (FR-4), AI tier (FR-21), map archetype or "any", and optionally a map seed.
  - [ ] Player selects one of their legal rosters, built at the chosen budget.
  - [ ] Every match is 1 human squad + 4 AI squads = 5 squads.
  - [ ] Supplying the same seed, budget, archetype, AI tier, and rosters produces an identical starting board (see NFR-2).
  - [ ] The seed used is displayed and copyable after generation, including when it was generated rather than supplied.

#### FR-9: AI roster generation
- **User story:** As a player, I want AI squads that are built under the same rules I am, so that losing means I was outplayed and not out-budgeted.
- **Acceptance criteria:**
  - [ ] Each AI squad is generated from the same catalog, at the same point budget, under the same legality rules as the human (D-5, FR-2 through FR-4).
  - [ ] Each AI roster contains exactly one commander (FR-3).
  - [ ] AI rosters are generated deterministically from the match seed.
  - [ ] Across repeated generation at a fixed budget, AI rosters vary — the four AI squads in a single match are not all identical, and successive matches at the same budget do not always produce the same four rosters.
  - [ ] AI rosters are fully visible to the player before the first plot, as required by the information contract (FR-24).

#### FR-10: Procedural map generation
- **User story:** As a player, I want a new map every match so that memorized openings don't exist.
- **Acceptance criteria:**
  - [ ] Maps are generated procedurally from a seed, never selected from a fixed authored set.
  - [ ] Seven archetypes are supported, each a distinct parameter set: **dense grid, long avenues, open scatter, maze, arena, asymmetric ruins, hazard field**.
  - [ ] Archetypes are distinguishable by measurement, not only by eye: each archetype has a declared target range for wall density, mean sightline length, and open-area fraction, and generated maps fall inside their archetype's ranges.
  - [ ] Map geometry is walls/topology in continuous space (D-1), consistent with the wireframe fiction.
  - [ ] "Any" archetype selects an archetype deterministically from the seed.
  - [ ] Generation and the playability gate (FR-11) together complete within the budget in NFR-3.

#### FR-11: Playability gate
- **User story:** As a player, I want to never be dropped onto a broken map, so that "procedural" doesn't mean "sometimes unplayable."
- **Acceptance criteria:**
  - [ ] Every generated map is evaluated by an automated battery before use. A map failing any check is discarded and regenerated with a derived seed.
  - [ ] **Connectivity:** every spawn point can reach every other spawn point by a legal path. No isolated pockets of navigable space larger than `MIN_POCKET`.
  - [ ] **Cover distribution:** no open region larger than `MAX_OPEN_AREA` is free of cover. Cover is distributed across the map, not clustered in one quadrant — measured as: each map quadrant contains at least `MIN_QUADRANT_COVER` of the map's mean per-quadrant cover.
  - [ ] **Spawn fairness:** all five spawn points are mutually at least `MIN_SPAWN_SEP` apart; each spawn has at least `MIN_SPAWN_COVER` cover elements within `SPAWN_COVER_RADIUS`; no spawn is exposed to more than `MAX_SPAWN_SIGHTLINES` other spawns by direct line of sight at round 1.
  - [ ] **No degenerate chokepoints:** no single passage narrower than `CHOKE_WIDTH` whose removal disconnects more than `CHOKE_FRACTION` of navigable area.
  - [ ] **Trace survivability:** the map's final safe region (FR-19) satisfies connectivity and cover checks in its own right.
  - [ ] The battery is runnable headlessly against a large seed sample and reports a pass rate. Rejection is logged with the failing check.
  - [ ] If `MAX_REGEN_ATTEMPTS` consecutive generations fail, that is a defect condition, surfaced rather than looped on.

*Resolves OQ from idea: "Playability battery definition." Thresholds are tunable and expected to move; the checks themselves are fixed.*

#### FR-12: Deployment
- **User story:** As a player, I want to place my constructs at the start so that my opening formation is a decision.
- **Acceptance criteria:**
  - [ ] Each squad receives one spawn region. Regions are assigned deterministically from the seed.
  - [ ] The player places each of their constructs anywhere within their spawn region, subject to not overlapping walls or each other.
  - [ ] AI squads deploy within their own regions under the same constraints.
  - [ ] The player may not begin round 1 until all their constructs are placed.
  - [ ] All deployments are revealed to all squads simultaneously once the match begins.

---

### Part C — The Match Loop

#### FR-13: Round structure
- **User story:** As a player, I want a fixed, predictable round rhythm so that I always know what I'm committing to.
- **Acceptance criteria:**
  - [ ] Each round proceeds in exactly this order: **reaction pool refill → movement plot → movement commit → movement resolve → attack plot → attack commit → attack resolve → damage application → trace application → elimination check**.
  - [ ] No squad's plot is visible to any other squad before that phase's commit.
  - [ ] There is no plotting timer at any point (non-goal). Plotting phases wait indefinitely.
  - [ ] Every surviving construct may both move and attack in the same round (A-2).
  - [ ] The round number is displayed at all times.

#### FR-14: Movement plotting
- **User story:** As a player, I want to draw where each construct goes, so that positioning is expressive rather than menu-driven.
- **Acceptance criteria:**
  - [ ] Space is continuous (D-1). A movement plot is a polyline path from the construct's current position.
  - [ ] Each chassis has a movement allowance. A path's total length may not exceed it. Over-length paths are rejected or clamped, with the limit shown while plotting.
  - [ ] A path may not cross a wall. Illegal segments are rejected at plot time.
  - [ ] A construct may be given an empty path (hold position). This is legal and costs nothing.
  - [ ] The plot is fully editable until commit, and commit is explicit.
  - [ ] Plotting one construct does not lock another; all constructs are plotted, then all commit together.

#### FR-15: Simultaneous movement resolution
- **User story:** As a player, I want everyone to move at once under a rule I can predict, so that "deterministic" has no hole in it.
- **Acceptance criteria:**
  - [ ] All squads' movement resolves simultaneously. No squad moves first.
  - [ ] Constructs traverse their paths at a rate proportional to path length over the round, so that a long path and a short path both complete over the same round.
  - [ ] **Collision (D-2):** if two constructs would come into contact during traversal, **both halt** at their last legal non-contacting positions and remain there for the rest of the movement phase. Neither passes through, neither is displaced, neither is given priority.
  - [ ] A halted construct does not cause a cascade beyond the normal application of the same rule: a third construct that subsequently reaches a halted construct also halts.
  - [ ] Halting is a movement-phase event only. A halted construct is not otherwise penalized and may still attack.
  - [ ] **Order independence:** the resolved end state must not depend on the order in which squads or constructs are evaluated. Test: resolving the same committed round with every squad-evaluation permutation yields byte-identical end state.
  - [ ] Constructs never end a movement phase overlapping each other or overlapping a wall.
  - [ ] Halts are visibly communicated in the resolution so the player understands why a construct is short of its plotted destination.

#### FR-16: Attack plotting, posture, and called shots
- **User story:** As a player, I want to choose shots and defenses with full knowledge of position but none of intent, so that the mind game is the only unknown.
- **Acceptance criteria:**
  - [ ] Attack plotting begins with all post-movement positions and all damage states public.
  - [ ] For each of their constructs, the player may declare at most one attack against one target, subject to range and line of sight (FR-18).
  - [ ] Each declared attack is either a **normal shot** (costs 0) or a **called shot** (costs 1 reaction point).
  - [ ] Independently, each of the player's constructs is either **flat** (costs 0) or holding a **posture** (costs 1 reaction point).
  - [ ] A construct may both hold a posture and fire in the same round; these are independent choices costing independently.
  - [ ] **Strictly 1:1, non-stackable (D-3):** a construct may hold at most one posture; a shot may be called at most once. Additional points cannot be spent to deepen either.
  - [ ] Total points spent on called shots plus postures may not exceed the round's pool. Over-spend is rejected at plot time with the remaining balance shown.
  - [ ] No squad sees another squad's shot targets, called-shot choices, or posture choices before commit.
  - [ ] Unspent points are lost at end of round (FR-17).

#### FR-17: Reaction pool
- **User story:** As a player, I want a pool so scarce that every point hurts to spend, so that triage is the game.
- **Acceptance criteria:**
  - [ ] Pool is recomputed fresh at the start of every round. **Zero carryover.** Unspent points are destroyed, not banked.
  - [ ] Pool formula:
    ```
    pool = 1 + commander_base(type) + floor(alive_constructs / R)
    ```
    where `alive_constructs` is that squad's own living construct count at refill time, and `R` is a divisor determined by the commander's current dial position — `R = 3` at full health, degrading stepwise toward `R = 8` as the commander takes damage.
  - [ ] **Commander destroyed:** both commander-derived terms zero out — `commander_base = 0` and the `floor(alive/R)` term is 0 — giving `pool = 1` for every remaining round of the match. This is permanent and irreversible.
  - [ ] The formula reproduces the idea document's reference table exactly:

    | Budget | Constructs | Healthy | Wounded commander | Commander dead |
    |---|---|---|---|---|
    | 25 | 3 | 3 | 2 | 1 |
    | 100 | 6 | 4 | 2 | 1 |
    | 200 | 9 | 5 | 3 | 1 |

    *(Consistency check: this table is satisfied by `commander_base = 1` for the reference commander type with `R` stepping 3 → 7/8. Other commander types set different bases and are not constrained by this table.)*
  - [ ] The player's current pool, and its breakdown by term, is visible at all times during attack plotting.
  - [ ] Each AI squad computes its pool by the identical formula. No AI receives a pool bonus at any tier (see FR-21).
  - [ ] The pool never goes below 1 while the squad has at least one living construct.

#### FR-18: Deterministic attack resolution
- **User story:** As a player, I want to be able to compute the outcome of any exchange in advance, so that I lose to a read and never to a roll.
- **Acceptance criteria:**
  - [ ] All squads' attacks resolve simultaneously from the committed state. There is no initiative, no first-strike, and no sequencing advantage.
  - [ ] Damage is computed against each target's state **at commit time**. A construct destroyed this round still fires this round; damage it dealt is not retracted.
  - [ ] The outcome matrix is exactly:

    | | Target has posture | Target is flat |
    |---|---|---|
    | **Normal shot** | 0 damage | 1.0 × damage |
    | **Called shot** | 0.5 × damage | 1.5 × damage |

  - [ ] **Rounding:** damage is an integer. Fractional results are floored. Any shot that lands (i.e. any non-zero row/column combination) deals a minimum of 1 damage. A normal shot into a posture deals 0 and is not subject to the minimum.
  - [ ] An attack requires unbroken line of sight from attacker to target and a target within the mount's range. Both are computed on post-movement positions and are checkable by the player before commit.
  - [ ] Cover affects line of sight (blocked / not blocked). Cover introduces no probabilistic term of any kind.
  - [ ] **No randomness anywhere in resolution.** No to-hit roll, no crit table, no scatter, no variance. Identical committed states produce identical outcomes, always (NFR-2).
  - [ ] The player can, before committing, see the exact damage each of their declared shots would deal under each of the two enemy posture states.

#### FR-19: Dials and damage state
- **User story:** As a player, I want damage to change what a construct does rather than just how long it lives, so that a wounded board is a different tactical problem.
- **Acceptance criteria:**
  - [ ] Every chassis has a dial: an ordered sequence of discrete states. Each state defines that construct's current movement allowance, damage output, range, and any accuracy or defensive modifier.
  - [ ] Damage advances the dial. The dial is a state machine, not a continuous bar.
  - [ ] Dial position never regresses. There is no healing, no repair, and no state recovery within a match.
  - [ ] The catalog includes all three curve families named in the idea: **degrade** (stats decline), **spike** (stats improve as damage climbs, then terminate abruptly), and **inversion** (one stat rises while another falls — e.g. damage up, accuracy down).
  - [ ] At least one chassis of each curve family exists.
  - [ ] Advancing past the dial's final state destroys the construct.
  - [ ] **Every construct's exact dial position is public to every squad at all times** (FR-24). No fog applies to damage state.
  - [ ] A construct's full dial — including states it has not yet reached — is inspectable during a match by any squad.
  - [ ] If the destroyed construct was the commander, FR-17's permanent pool collapse applies immediately, from the next refill.

#### FR-20: The trace
- **User story:** As a player, I want a closing boundary that makes hiding expensive rather than impossible, so that the match reaches a conclusion on schedule.
- **Acceptance criteria:**
  - [ ] A safe region shrinks on a fixed schedule. The region shrinks monotonically — it never grows or moves outward.
  - [ ] Traced area deals **escalating damage**, not instant death. A construct in the trace takes `TRACE_BASE + TRACE_STEP × (advances_completed)` integrity at the trace step of each round.
  - [ ] Remaining in the trace is survivable for at least one round early in the match at typical integrity values, and reliably fatal in the late match. Hiding is a purchase, not a wall.
  - [ ] **The entire trace schedule and every future region boundary is public from round 1.** Nothing about the trace is a surprise (FR-24).
  - [ ] The next contraction is signposted at least one round before it takes effect.
  - [ ] The trace applies uniformly to all five squads, including AI.
  - [ ] The final safe region is small enough to guarantee contact between any surviving squads, and is validated by FR-11.
  - [ ] The schedule is tuned so that a median match completes within the target in NFR-1.
  - [ ] **A-3:** the trace does **not** delete or modify terrain. It overlays the existing topology; walls and cover remain intact inside and outside it. *(See OQ-1 — this is the assumed answer, not a confirmed one.)*

#### FR-21: Elimination, victory, and placement
- **User story:** As a player, I want a clear ending with a placement, so that a loss still tells me how I did.
- **Acceptance criteria:**
  - [ ] A construct is destroyed when its dial is exhausted (FR-19) or its integrity reaches zero from trace damage (FR-20).
  - [ ] A squad is eliminated when its last construct is destroyed. Elimination order is recorded.
  - [ ] The match ends when one squad remains, **or immediately when the human squad's last construct is destroyed** — there is no spectating after elimination (non-goal).
  - [ ] The result screen reports the player's placement (1st through 5th) and the full elimination order.
  - [ ] Simultaneous elimination of the last two or more squads is resolved by an explicit, deterministic, documented rule; it is never left undefined.
  - [ ] The match seed and both the player's and AI rosters' share strings are available from the result screen.
  - [ ] No progression, XP, unlock, or persistent damage results from a match (non-goal). Rosters are unchanged by play.

---

### Part D — Artificial Intelligence

#### FR-22: Three AI tiers
- **User story:** As a player, I want a difficulty that matches me, so that the game is neither a walkover nor a wall.
- **Acceptance criteria:**
  - [ ] Three selectable tiers ship in v1.
  - [ ] Tiers differ only in decision quality — search depth, opponent modelling, target selection sophistication. **No tier receives an information advantage, a pool bonus, a stat bonus, a budget bonus, or any rule exemption.** AI plots under exactly the human's constraints.
  - [ ] AI does not see human plots before commit, at any tier.
  - [ ] Every tier clears the full acceptance battery in FR-23 before shipping.
  - [ ] Tier win rates against a fixed reference roster are measurably ordered: tier 3 > tier 2 > tier 1.

#### FR-23: AI behavioral acceptance battery
- **User story:** As a player, I want an AI that isn't a naive idiot, and I want that claim to be a test suite rather than a promise.
- **Acceptance criteria:** every tier must pass, headlessly and reproducibly:
  - [ ] **Target selection is not naive-nearest.** Over a sample of matches, AI target choice correlates with a value assessment (threat, wounded state, commander status, positional exposure) rather than distance alone. Test: in constructed scenarios where nearest ≠ highest-value, the AI selects the higher-value target above a threshold rate.
  - [ ] **Target selection is not naive-leader.** The AI does not focus the current leader to the point of kingmaking. Test: in a constructed 5-squad state with one clear leader, damage distribution is not collapsed onto that squad alone.
  - [ ] **Not exploitable by always-posture.** A human strategy of posturing every affordable construct every round must not achieve a win rate above `EXPLOIT_CEILING`. Requires the AI to call shots.
  - [ ] **Not exploitable by never-posture.** A human strategy of never posturing must not achieve a win rate above `EXPLOIT_CEILING`. Requires the AI to *not* always call shots.
  - [ ] **Called-shot rate is neither 0% nor 100%** over a match sample, and shifts in response to observed opponent posture frequency.
  - [ ] **Evaluates unseen constructs.** The AI is given rosters composed of catalog parts in arrangements never seen in training or tuning, and its performance does not collapse. Test: performance against novel rosters is within `NOVEL_ROSTER_TOLERANCE` of performance against reference rosters.
  - [ ] **Commander awareness.** The AI protects its own commander at a measurably higher rate than a non-commander construct of equal value, and prioritizes enemy commanders above equivalently-valued non-commanders.
  - [ ] **Trace awareness.** The AI vacates the trace ahead of contraction rather than reactively, and does not walk constructs to death in the trace. Test: trace deaths per AI match below `TRACE_DEATH_CEILING`.
  - [ ] **Pool discipline.** The AI does not routinely end rounds with unspent points while in contact, and does not spend its entire pool on posture while holding a winning attack.
  - [ ] **No stupid moves.** Zero incidence, across the sample, of: moving into the trace when a safe path exists, firing on an already-destroyed target, plotting an illegal path, or leaving every construct flat while holding a full pool under fire.
  - [ ] The entire battery runs headlessly, reports per-check pass/fail with numbers, and is re-runnable on every AI change.

*This is the project's largest single design risk, per the idea document. The battery above is the concrete form; thresholds are tunable, checks are not.*

---

### Part E — Information, Presentation, and Support

#### FR-24: The information contract
- **User story:** As a player, I want everything except intent to be on the table, so that I can compute and never guess at arithmetic.
- **Acceptance criteria:**
  - [ ] **Public to all squads at all times:** every construct's chassis, every mounted mount, every stat, exact dial position, exact position (subject to FR-25), commander status, every squad's reaction pool size, the full trace schedule, and the map.
  - [ ] **Private until commit, always:** movement paths, attack targets, called-shot declarations, posture declarations.
  - [ ] Intent is the *only* hidden information in the game. Any other concealment is a defect.
  - [ ] The player can inspect any construct on the board — including enemy constructs — and see its full stats and complete dial.
  - [ ] The player can query, before commit, the exact damage outcome of any declared shot under both enemy posture states (FR-18).

#### FR-25: Resolution loss
- **User story:** As a player, I want distant constructs to render as decaying ghosts, so that the fog is the fiction rather than a UI convention.
- **Acceptance criteria:**
  - [ ] A construct outside the squad's resolution range is shown at its **last confirmed position**, visibly degraded, and clearly marked as unconfirmed.
  - [ ] Resolution loss affects **position confidence only**. It never conceals stats, dial position, or commander status (FR-24).
  - [ ] A construct's own squad always has full-resolution knowledge of its own constructs.
  - [ ] Resolution range is a stated, inspectable value — derived from chassis and/or mounts — not a hidden constant.
  - [ ] AI squads operate under the same resolution rules as the human. No AI tier sees through fog.
  - [ ] Ghost positions update the moment a construct re-enters resolution.

*Visual treatment of decay is Designer's; the information rule is here.*

#### FR-26: Resolution playback
- **User story:** As a player, I want to watch what happened, so that I can learn what I read wrong.
- **Acceptance criteria:**
  - [ ] Movement resolution and attack resolution are played back visually, not applied as an instant state jump.
  - [ ] Playback shows: paths taken, halts and why (FR-15), shots fired, posture states revealed, damage dealt, dial advances, destructions, and trace damage.
  - [ ] Playback can be skipped to the end state.
  - [ ] Playback is a presentation of an already-computed deterministic result; it never influences the result.

#### FR-27: Rules reference
- **User story:** As a new player, I want the rules available in context, so that I don't need a tutorial to start.
- **Acceptance criteria:**
  - [ ] The posture / called-shot matrix, the pool formula, and the trace schedule are available in-match without leaving the match.
  - [ ] Terms defined in the Glossary below are explained in-product wherever they first appear.
  - [ ] There is no scripted tutorial in v1 (A-4). Prebuilts (FR-5) plus in-context reference are the on-ramp.

#### FR-28: Match summary
- **User story:** As a player, I want a readable outcome, so that a fifteen-minute match ends on a note rather than a fade.
- **Acceptance criteria:**
  - [ ] Reports placement, elimination order, rounds elapsed, and per-construct damage dealt and taken.
  - [ ] Reports reaction points spent versus wasted, and called shots versus postures, for the human squad.
  - [ ] Offers: rematch on the same seed, rematch on a new seed, and return to build zone.

---

### Part F — Cross-Cutting

#### FR-29: Determinism and reproducibility
- **User story:** As a player and as a tester, I want a match to be exactly reproducible, so that "deterministic" is verifiable rather than asserted.
- **Acceptance criteria:**
  - [ ] Given identical seed, budget, archetype, AI tier, rosters, and an identical sequence of committed plots, a match replays to a byte-identical end state.
  - [ ] Resolution is order-independent (FR-15) and platform-independent across supported browsers.
  - [ ] No wall-clock time, no unseeded randomness, and no floating-point-order-dependent comparison influences any rule outcome.
  - [ ] A headless harness can run N matches from seeds and report outcomes without rendering — this is the substrate FR-11, FR-23, and FR-31 all depend on.

#### FR-30: Data-driven tuning
- **User story:** As a designer, I want catalog and constants editable as data, so that balance work doesn't require a code change.
- **Acceptance criteria:**
  - [ ] Every chassis, mount, dial, commander type, and point cost is authored as data, not embedded in logic.
  - [ ] Every constant in §Tunables is data, not a literal in logic.
  - [ ] Catalog data is validated on load; malformed or internally inconsistent entries fail loudly at load rather than mid-match.

#### FR-31: Costing integrity battery
- **User story:** As a player, I want no build that wins every time, because under determinism an undercosted combination is not a soft problem.
- **Acceptance criteria:**
  - [ ] For budgets where the legal build space is small enough to enumerate exhaustively, it **is** enumerated, and every legal roster is evaluated for dominance. Test: no roster exceeds `DOMINANCE_CEILING` win rate against a broad sample of legal opposition.
  - [ ] The budget at which exhaustive enumeration stops being tractable is measured and documented, not guessed.
  - [ ] Above that budget, automated tournament sampling substitutes, with a documented sample size and confidence.
  - [ ] The battery reports the top-N and bottom-N performing builds per budget, so under- and over-costing are both visible.
  - [ ] **Snowball measurement:** the battery measures whether a mid-match lead becomes unrecoverable, and reports that figure per commander type. Specifically it reports win rate conditional on holding a construct-count lead at the round-`SNOWBALL_ROUND` mark.
  - [ ] The battery is re-runnable on every catalog or constant change.

---

## Non-Functional Requirements

- **NFR-1 — Match length.** A median match at 100 points completes in **≤ 15 minutes** of wall-clock time for a player familiar with the rules. Enforced structurally by the trace schedule (FR-20), not by a plotting timer. Measured as: median rounds to completion × observed median plotting time per round. Target round count: matches reach a conclusion within `MAX_EXPECTED_ROUNDS` rounds in ≥ 95% of headless samples.
- **NFR-2 — Determinism.** Zero variance in resolution. Any two identical committed states producing differing outcomes is a P0 defect. Verified continuously by FR-29's harness.
- **NFR-3 — Performance.** Target: 5 squads × up to `MAX_SQUAD` constructs = up to 50 constructs on board. Full round resolution (movement + attack + trace) computes in **< 100 ms**. Map generation including the full playability gate completes in **< 2 s**. Interactive plotting sustains **60 fps** on a mid-range desktop from the last 4 years.
- **NFR-4 — Platform.** Desktop browsers only (D-4). Current versions of Chrome, Firefox, Safari, and Edge. Minimum viewport 1280×720. Mouse and keyboard. Tablet and mobile are explicit non-goals; the product should state this rather than degrade silently.
- **NFR-5 — Accessibility.** The neon-on-black, heavily colour-coded aesthetic is a real accessibility risk and is treated as a hard requirement, not a nice-to-have (A-5):
  - No information is conveyed by colour alone. Squad identity, damage state, posture, and trace boundary each carry a non-colour channel (shape, pattern, label, or iconography).
  - The palette is verified against deuteranopia, protanopia, and tritanopia simulation; all five squad colours remain mutually distinguishable under each.
  - Text and critical UI meet **WCAG 2.1 AA** contrast (4.5:1 body, 3:1 large text and UI components).
  - The build zone is fully keyboard-navigable.
  - A reduced-motion mode suppresses glitch, decay, and playback effects while preserving all information.
  - Motion effects avoid flash patterns in the 3–50 Hz photosensitive range.
- **NFR-6 — Load.** First interactive load in **< 3 s** on a 10 Mbit connection. Match start from the setup screen in **< 2 s**.
- **NFR-7 — Offline.** After first load, the product functions with no network connectivity. No runtime call to any external service is required for any feature.
- **NFR-8 — Privacy.** No accounts, no telemetry, no analytics, no external requests carrying user data. All state is local. Share strings are transported by the user, never by the product.
- **NFR-9 — Art constraint.** Vectors, glow, and motion only. No raster sprites, no character art, no animation frames (non-goal).
- **NFR-10 — Testability.** Every acceptance criterion above that says "test:" is automatable headlessly. The batteries in FR-11, FR-23, and FR-31 run in CI on catalog or logic change.

---

## Constraints

- **C-1** Client-side only. Static hosting. No backend of any kind, ever, in v1.
- **C-2** No accounts, no cloud save, no hosted sharing.
- **C-3** No online multiplayer in any form. Solo vs. AI is the whole product.
- **C-4** Desktop only (D-4).
- **C-5** Closed, designer-authored catalog. No user-authored chassis or mounts.
- **C-6** No randomness in resolution.
- **C-7** No plotting timers.
- **C-8** Original vocabulary, naming, and art. "Deadzone" is a live trademark in this category and is avoided. Mechanics referenced from prior art (dial, focus allocation, closing playfield) are unpatented or expired; naming and presentation are original.

---

## Dependencies

- **Runtime:** none external. Per NFR-7 and C-1, the product must run entirely client-side with no third-party service dependency.
- **Development:** unconstrained — stack, libraries, and tooling are Architect's call.
- **Content:** the chassis, mount, commander-type, and dial catalog is a design deliverable and a hard prerequisite for FR-1, FR-2, FR-31, and the entire AI battery. It is the critical path.

---

## Assumptions

- **A-1** The local collection persists across browser sessions. Clearing site data loses it, and that is acceptable — no export-to-file backup is required in v1 (share strings serve as manual backup).
- **A-2** Every surviving construct may both move and attack in the same round.
- **A-3** The trace does not delete terrain; it overlays it. *(See OQ-1.)*
- **A-4** No scripted tutorial in v1. Prebuilts and in-context rules are the on-ramp.
- **A-5** Colourblind-safe presentation is a hard requirement, not a preference.
- **A-6** "Fifteen minutes" is converted to a round-count target and enforced by the trace schedule (NFR-1).
- **A-7** Squad size is capped uniformly at `MAX_SQUAD` across all budgets; the effective count at low budgets is limited by cost, not by a separate per-budget cap.
- **A-8** The reference commander type used in the idea's pool table has `commander_base = 1`. Other types differ.
- **A-9** A roster requires exactly one commander.
- **A-10** Cover is binary for line of sight — blocked or not blocked. There is no partial cover damage modifier, as that would reintroduce a non-binary term into deterministic resolution.

---

## Open Questions

- **OQ-1 — Trace vs. terrain.** Does the trace delete topology as it closes, or overlay it? A-3 assumes overlay because deleting terrain makes late-round planning much harder for both the player and the AI to reason about. **Confirm or overturn before FR-20 is built.**
- **OQ-2 — Commander type pricing.** At 25 points with three constructs, an expensive commander tag may cost a whole construct. Is that an interesting decision or a trap? Do budget-tier cheap commander types need to exist purely so 25-point play stays viable? Resolvable by FR-31's battery.
- **OQ-3 — Pool divisor tuning.** Are 3 (healthy) → 8 (wounded) the right endpoints, and is the degradation stepwise-per-dial-state or threshold-based? The unit term means the winning squad gets more reactions on top of more constructs. FR-31's snowball measurement is the first thing that should run.
- **OQ-4 — Resolution range source.** Is resolution range a chassis property, a mount property, or both? FR-25 requires it be stated and inspectable; it does not decide where it comes from.
- **OQ-5 — Simultaneous-elimination tiebreak.** FR-21 requires a deterministic documented rule. The rule itself is not yet chosen.
- **OQ-6 — Enumeration tractability threshold.** At what budget does exhaustive build-space search stop being feasible? FR-31 requires this be measured; the answer is unknown and shapes the balance workflow.
- **OQ-7 — Movement traversal model.** FR-15 requires proportional traversal and order-independent collision. Whether that is best expressed as continuous swept-volume intersection or fine-grained substepping is Architect's, but the choice must satisfy the order-independence test.

---

## Tunable Parameters

All values below are initial proposals subject to the balance batteries. All must be data-driven per FR-30.

| Name | Initial | Governs |
|---|---|---|
| `MAX_SQUAD` | 10 | Hard squad size cap (FR-4) |
| `TRACE_BASE` | 2 | Trace damage on first advance (FR-20) |
| `TRACE_STEP` | 2 | Trace damage escalation per advance (FR-20) |
| `TRACE_FIRST_ROUND` | 4 | Round of first contraction (FR-20) |
| `TRACE_INTERVAL` | 2 | Rounds between contractions (FR-20) |
| `MAX_EXPECTED_ROUNDS` | 24 | Round-count ceiling for NFR-1 |
| `MIN_POCKET` | 1 construct footprint | Isolated-area tolerance (FR-11) |
| `MAX_OPEN_AREA` | 15% of map area | Coverless region ceiling (FR-11) |
| `MIN_QUADRANT_COVER` | 50% of mean | Cover distribution floor (FR-11) |
| `MIN_SPAWN_SEP` | 40% of map diagonal | Spawn separation (FR-11) |
| `MIN_SPAWN_COVER` | 3 elements | Cover near spawn (FR-11) |
| `SPAWN_COVER_RADIUS` | 1× movement allowance | Spawn cover search radius (FR-11) |
| `MAX_SPAWN_SIGHTLINES` | 1 | Spawn-to-spawn LOS ceiling (FR-11) |
| `CHOKE_WIDTH` | 2 construct footprints | Chokepoint width threshold (FR-11) |
| `CHOKE_FRACTION` | 25% | Disconnection fraction threshold (FR-11) |
| `MAX_REGEN_ATTEMPTS` | 20 | Regeneration failure ceiling (FR-11) |
| `EXPLOIT_CEILING` | 60% | Degenerate-strategy win rate ceiling (FR-23) |
| `NOVEL_ROSTER_TOLERANCE` | 10 pts win rate | Unseen-roster performance drop (FR-23) |
| `TRACE_DEATH_CEILING` | 0.5 per AI match | AI trace deaths (FR-23) |
| `DOMINANCE_CEILING` | 65% | Single-roster win rate ceiling (FR-31) |
| `SNOWBALL_ROUND` | 8 | Lead-measurement round (FR-31) |

---

## Glossary

- **Construct** — one playable piece: a chassis plus its mounted mounts. The atomic unit of a squad.
- **Chassis** — the frame of a construct. Defines its dial, its hardpoint layout, its movement allowance, and its footprint. Cannot be changed after selection.
- **Mount** — a component loaded into a hardpoint. Families: ICE, daemons, spikes, spoofers, wipes. Contributes stats. Drawn from a closed, designer-authored catalog.
- **Hardpoint** — a typed slot on a chassis. Accepts only mounts of its type, and holds at most one. Hardpoints are the discipline that keeps chassis identity intact through customization.
- **Dial** — a chassis's ordered sequence of damage states. Each state defines what the construct currently does, not merely how much it can still take. Advances with damage, never regresses. Public at all times.
- **Degrade / spike / inversion curve** — the three dial families. Degrade declines with damage; spike improves then terminates abruptly; inversion trades one stat up while another goes down.
- **Commander** — a build-time tag applied to any one chassis in a roster. Costs points, modifies the chassis, and sets the squad's `commander_base` pool term. Exactly one per roster. Its death permanently collapses the squad's pool to 1.
- **Reaction pool** — the per-round budget for postures and called shots. Refills fresh each round, never carries over. `1 + commander_base + floor(alive/R)`.
- **Posture** — a 1-point defensive state held by one construct for one round. Blanks a normal shot entirely; halves a called shot. Not stackable.
- **Flat** — a construct not holding a posture. Costs nothing. Takes full damage from a normal shot and 1.5× from a called shot.
- **Called shot** — a 1-point attack upgrade. Deals 1.5× against a flat target, but only 0.5× against a posture. Not stackable.
- **Normal shot** — a free attack. Full damage against a flat target, zero against a posture.
- **Trace** — the advancing system sweep that shrinks the safe region on a public schedule and deals escalating damage to anything inside it. Structural guarantee of contact and of match length.
- **Squad** — one player's or one AI's set of constructs. Five per match: 1 human, 4 AI.
- **Roster** — a saved, legal, budgeted squad composition, including its commander tag.
- **Plot** — a committed-in-secret set of orders for one phase. Movement plots are paths; attack plots are targets plus called-shot and posture declarations.
- **Commit** — the irreversible lock of a plot. All squads commit before any resolve.
- **Resolution loss** — the fog mechanic: a construct beyond your resolution range renders as a decaying ghost at its last confirmed position. Affects position confidence only, never stats.
- **Integrity** — the damage quantity that advances a dial and is dealt by the trace.
- **Placement** — final ranking, 1st through 5th, derived from elimination order. The score.
- **Archetype** — a named parameter set biasing map generation: dense grid, long avenues, open scatter, maze, arena, asymmetric ruins, hazard field.
- **Playability gate** — the automated battery every generated map must pass before use.
- **Build zone** — the between-match mode where constructs are composed and rosters assembled.
