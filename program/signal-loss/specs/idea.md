# Idea — SIGNAL LOSS

## One-Sentence Summary

SIGNAL LOSS is a simultaneous-turn skirmish tactics game where you compose
intrusion constructs from chassis and mounts, plot every move and shot in secret
against four AI rivals, and spend a brutally scarce reaction pool on the handful
of dodges and called shots you can actually afford — inside a system trace that's
closing around you.

---

## Problem

Frozen Synapse nailed simultaneous-turn tactics in 2011 and then the genre went
quiet. What's left splits into two piles, neither of which is what a tactics
player actually wants at lunch:

- **Tabletop skirmish games** (Warmachine, Infinity, Kill Team) have deep list
  building and rich unit identity — but they need a table, an opponent, two
  hours, and $300 of unpainted plastic.
- **Digital tactics games** (XCOM, Into the Breach) are sequential and solitaire.
  You move, then they move. There's no read, no bluff, no moment where you commit
  blind and find out you guessed wrong.

Nobody is shipping the intersection: **list building with real depth, played
solo, against AI, in fifteen minutes, in a browser tab.** The player who wants
that today has to either schedule a game night or settle for a game where the
enemy politely waits their turn.

Meanwhile the simultaneous-turn games that do exist are all duels. The
free-for-all — four rivals, shifting threat, nobody's plan visible — is
essentially unoccupied ground.

---

## Vision

SIGNAL LOSS is a run you're watching through a deck, not a battlefield you're
standing on. Your squad isn't soldiers — it's constructs you've loaded and
launched into a hostile system, rendered as clean vector shapes because that's
all your deck resolves. Walls are wireframe because they're topology, not
architecture. Glitch isn't decoration, it's packet loss: a construct at the edge
of your resolution renders as a decaying ghost of its last confirmed position.
The abstraction isn't a shortcut, it's the fiction.

**The information contract is the whole design.** Resolution is fully
deterministic — no rolls, no variance, no "I played it right and lost anyway."
There's no plotting timer. Every construct's damage state is public, and so is
every stat. You can compute, exactly, what happens if both sides do a given
thing. The *only* unknown in the entire game is what the other four minds intend
this round. Everything else is on the table.

A round is two secret plots. First **movement**: everyone plots paths blind,
everyone commits, everyone resolves at once. You find out where the board
actually is. Then **attack**: you plot shots with full positional knowledge — but
so does everyone else, and each shot is either a normal shot or a **called shot**,
while each of your own constructs is either flat or holding a **posture**. Both
cost from the same pool. Neither side sees the other's choice.

| | Target has posture | Target is flat |
|---|---|---|
| **Normal shot** | no damage | normal damage |
| **Called shot** | half damage | **1.5× damage** |

That's matching pennies with an economy bolted to it, and the economy is the
point. The **reaction pool** refills fresh every round and never carries over —
nothing to hoard, no banking three rounds for an alpha strike. Spend it or waste
it:

```
pool = 1  +  commander_base(type)  +  floor(alive_constructs / R)
R    = 3 with a healthy commander, degrading toward 8 as they take damage
commander destroyed → both commander terms zero out → pool = 1, permanently
```

| Budget | Constructs | Healthy | Wounded commander | Commander dead |
|---|---|---|---|---|
| 25  | 3 | **3** | 2 | 1 |
| 100 | 6 | **4** | 2 | 1 |
| 200 | 9 | **5** | 3 | 1 |

Nine constructs and five points. You can cover a third of your squad, or throw
two punches, not both. Every point is a heart-wrenching decision because postures
and called shots draw from the same well — protecting the wounded sniper means
not punching through the guy who's obviously bracing. The pool also thins as you
lose constructs, so losing compounds. That is deliberate, and the flat `1 +
commander_base` is the only cushion against it.

Any chassis can be tagged as **commander** — it's a point-cost modifier applied at
build time, not a special unit class. Each commander type reshapes the chassis
differently and sets your pool base, so the choice is doctrine, not stats: the
Overclock commander plays a reactive, read-heavy game and paints a target on its
own back; the Sysop grinds with almost no reactions. And whoever you pick is the
piece that, if it dies, drops you to one point a round for the rest of the match.
Choose and protect wisely.

Damage is a state machine, not a bar. Every chassis has a **dial** — a deliberately
abstract profile that changes as it takes hits. Most degrade. Some spike: a
runaway process gets faster and hits harder as it's wounded, then dies suddenly.
An unstable construct loses accuracy while its damage climbs. You always know
exactly how hurt everyone is. You never know what anyone is about to do.

The trace advances on a schedule and deals **escalating damage** rather than
instant death. You *can* sit in it — you'll just be paying for the privilege in
integrity, and the price keeps going up. That makes hiding a purchasable option
instead of a wall, guarantees contact, and enforces the lunch-hour promise in the
rules rather than in hope.

Between matches you live in the **build zone**. A construct is a **chassis** — the
dial plus its typed hardpoints — loaded with **mounts** from a closed catalog:
ICE, daemons, spikes, spoofers, wipes. Hardpoints are the discipline. A brawler
frame can't be rebuilt into a sniper, and nothing loads up with everything, so
chassis identity survives customization and the legal build space stays bounded
and enumerable. Start from a prebuilt, modify it, or compose from scratch; keep
what you like in a local collection. Everything encodes to a shareable string. No
accounts, no server, no grind.

---

## Target User

**Primary — the lunch-break tactician.** Played Frozen Synapse or Into the
Breach. Has opinions about list building. Wants a real tactical decision in a
browser tab, finished before the meeting, with no install and no login. Values
that a match ends when it says it will.

**Secondary — the ex-tabletop player.** Loves Warmachine/Infinity/Kill Team list
construction but can't get a game scheduled anymore. Wants the theorycraft — the
"what fits in 100 points" problem — without the table, the opponent, or the
plastic. Will build twelve constructs and play four of them.

**Tertiary — the systems tourist.** Comes for the neon vector aesthetic, stays
because the double-blind commit is unlike anything else they've played. Uses the
prebuilts and enjoys the ride.

---

## Key Features (high-level)

1. **Two-phase simultaneous plotting.** Plot movement blind → commit → resolve.
   Plot attacks with full position knowledge → commit → resolve. No one sees
   another player's plan before it locks. No timer.

2. **Deterministic resolution.** No dice, no rolls, no hidden modifiers. Given
   both sides' choices, the outcome is computable in advance. Uncertainty comes
   from intent, never from arithmetic.

3. **Posture vs. called shot.** The core mind game. Posture blanks a normal shot
   outright; a called shot beats posture but only half-lands; a called shot into a
   flat construct is a 1.5× execution. Both sides pay from the same pool.

4. **A pool scarce enough to hurt.** `1 + commander_base + floor(alive/R)`, fresh
   every round, zero carryover, collapsing to 1 if the commander dies. Roughly
   2–5 points against 3–9 constructs. The mechanic is triage, not control — and it
   gets tighter, not looser, as the budget climbs.

5. **Commander as a build-time modifier.** Any chassis can be tagged commander.
   At least four types, each costing points and reshaping the chassis it's applied
   to — integrity, movement, defense, and a fragile high-pool type. The type sets
   your pool base. Killing the enemy commander is the highest-value play on the
   board, and everyone knows it.

6. **Public dials with divergent curves.** Every construct's damage state is
   visible to everyone and changes what it *does*, not just how much it can take.
   Degrade curves, spike curves, and inversion curves (accuracy down / damage up).

7. **Chassis + mounts + hardpoints.** A closed catalog of chassis (dial +
   hardpoint layout) and mounts (ICE, daemons, spikes, spoofers, wipes). Typed
   ports bound what any one construct can be. Prebuilts are the on-ramp;
   composing your own is the between-match loop.

8. **Local collection + string sharing.** Constructs and rosters both encode to
   copy-pasteable text. Paste a roster and its constructs come with it. Sharing
   happens on Discord and forums, not on our servers.

9. **Free-for-all elimination under an advancing trace.** Up to five squads (1
   human + 4 AI). The trace closes on a schedule and deals escalating damage;
   last squad standing wins. Elimination order is the score.

10. **Three AI tiers, all test-vetted.** Every tier must clear a behavioral
    acceptance battery before it ships. "Doesn't do anything stupid" is a test
    suite, not a vibe.

11. **Fully procedural maps behind a playability gate.** Generation is procedural
    with archetype-biased parameter sets (dense grid, long avenues, open scatter,
    maze, arena, asymmetric ruins, hazard field). Every generated map must pass an
    automated playability battery — connectivity, cover distribution, spawn
    fairness, no degenerate chokepoints — or be rejected and regenerated. Seeds
    are shareable.

12. **Point budget as density dial.** 25–200 in 25-point increments. This is not a
    "more constructs" slider — squad size caps around 8–10. Higher budgets buy
    *denser* constructs: better chassis, more filled hardpoints. 25 points is three
    constructs at most, or one elite.

13. **Deck aesthetic.** Neon vectors, bold color, satisfying motion.
    Resolution loss at range is both the art direction and the fog-of-war
    mechanic.

---

## Non-Goals

- **User-authored chassis or mounts.** Players compose from the catalog; they do
  not extend it. Every chassis, hardpoint type, and mount is designer-authored and
  costed. This is what keeps costing testable and keeps the AI facing known parts
  in novel arrangements rather than arbitrary stat blocks.
- **Hosted sharing / accounts / any backend.** Sharing is copy-paste strings.
  Collection is local. No server, no accounts, no cloud save. A construct exchange
  is a different product.
- **Online multiplayer, in any form.** Static hosting, client-side only. Solo vs.
  AI is the whole product. The door isn't closed forever, but v1 does not open it.
- **Persistent campaign roster.** Constructs don't carry damage, XP, or upgrades
  between matches. No veterans, no permadeath, no progression curve.
- **Unlocks / packs / grind.** The catalog is fully open from match one. The
  constraint is points, not ownership.
- **Randomness in resolution.** No to-hit rolls, no crit tables, no variance
  anywhere in combat. If two identical situations resolve differently, it's a bug.
- **Plotting timers.** Take as long as you want. The trace, not a clock, is what
  ends the match.
- **Team play / alliances.** Free-for-all only.
- **Representational art.** No sprites, no character art, no animation frames. If
  it can't be done with vectors, glow, and motion, it doesn't ship.
- **Spectating after elimination.** When the human's last construct dies, the
  match ends and reports placement.
- **Narrative campaign / story mode.** The fiction exists to justify the
  abstraction, not to be told.

---

## Open Questions

**Top risk — the AI acceptance bar.** Three tiers, each gated by a behavioral test
battery. What are the actual pass conditions? A five-way free-for-all lives or
dies on target selection: naive "attack the leader" produces kingmaking, naive
"attack the nearest" produces four idiots. The AI must also read the posture /
called-shot game — an opponent that never calls shots is exploitable by always
posturing, and one that always calls them is exploitable by never posturing. And
it must evaluate constructs it has never seen, composed from known mounts.
Defining "not a naive idiot" as a concrete, runnable suite is the largest single
piece of design work in the project.

**Costing integrity under determinism.** With no variance to hide behind, an
undercosted combination wins *every time*, reproducibly. Because chassis and
mounts are a closed catalog with typed hardpoints, the legal build space is
bounded — at 25 and 50 points it may be small enough to enumerate and search
exhaustively for degenerate builds. Is that tractable? At what budget does it stop
being? And what's the fallback for the high end — automated tournament sampling?

**Pool tuning and the snowball.** Are the divisors (3 healthy → 8 wounded) right?
The unit term means the winning player gets more reactions than the losing one, on
top of having more constructs. The flat `1 + commander_base` is the only cushion.
First thing the balance battery should measure: does a mid-match lead become
unrecoverable, and how much does commander type change that answer?

**Commander type pricing.** Each type costs points and modifies its chassis. At 25
points with three constructs, an expensive commander tag might cost a whole third
construct. Is that an interesting decision or a trap? Do cheaper commander types
need to exist purely as a budget option?

**Trace vs. terrain.** Does the advancing trace respect cover and walls, or delete
topology as it closes? Deleting terrain reshapes the tactical map mid-match, which
is interesting but makes late-round planning much harder to reason about — and
harder for the AI to evaluate.

**Playability battery definition.** "Automated tests reject unplayable maps"
requires knowing what unplayable means, numerically. Connectivity is easy; cover
distribution and spawn fairness are not. This needs to be specified before it can
be built.

---

## Prior Art & Positioning

- **Frozen Synapse** — the closest relative. Simultaneous plot-and-commit, 1v1
  duels, integrated single-phase orders. SIGNAL LOSS departs on four axes:
  free-for-all instead of duel, split move/attack phases instead of one order
  set, a reaction economy layered on top, and a point-buy build system instead of
  scenario-fixed squads.
- **Warmachine** — the focus-allocation economy is the ancestor of the reaction
  pool, and the warcaster-as-generator relationship is the ancestor of the
  commander coupling. Mechanics are not copyrightable; vocabulary, art, and names
  are entirely original here.
- **HeroClix** — the combat dial. WizKids' dial patent (filed ~1999) has expired;
  the mechanic is public domain. SIGNAL LOSS pushes past it with divergent curves
  and with the dial as an abstract chassis profile rather than a character sheet.
- **Battle royale (Fortnite, PUBG)** — the closing playfield, used here as the
  structural fix for free-for-all turtling rather than as a genre signifier.
- **Netrunner** — the vocabulary and the fiction of running hostile systems. Named
  as tonal reference only; no mechanical borrowing.
- **Deadzone (Mantic Games)** — a live trademark in this exact category.
  Deliberately avoided. Named here so it doesn't get re-proposed.
