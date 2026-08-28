# Design Spec — SIGNAL LOSS

**Status:** draft 1 · phase `design`
**Derived from:** `specs/idea.md`, `specs/requirements.md`
**Owns:** screen layout, interaction design, visual language, `mocks/*.html`
**Does not own:** stack, state model, codec format, catalog values (Architect / content design)

---

## 0. Design Thesis

Three requirements dictate the entire interface, and everything below is downstream of them:

1. **FR-24 — the information contract.** Intent is the only hidden thing. Every other
   fact is public. This is not "we allow inspection"; it means **the UI's primary job is
   to surface computable truth without the player having to ask.** Anything the player
   has to hunt for is a design failure, because the game promises they never guess at
   arithmetic. Hence the **Exchange Card** (§5.7) — the exact damage of a shot under both
   enemy posture states, shown inline, before commit, always.

2. **FR-17 — a pool of 2–5 points against 3–9 constructs.** The player's scarcest
   resource is not points, it's *attention across the triage*. The whole attack screen is
   organised as a **ledger**: one row per construct, two independent spend decisions per
   row, one running balance. You should be able to read your entire round as a list.

3. **NFR-5 — accessibility as a hard requirement.** A neon-on-black five-way free-for-all
   is the worst possible starting point for colour vision. So colour is demoted to a
   *third* channel everywhere. **Lightness ladder first, glyph second, hue third.** The
   board is legible in full greyscale. This is designed in, not retrofitted.

The tone target: *you are reading a deck, not standing on a battlefield.* The UI is an
instrument panel that happens to be beautiful. Chrome is thin, data is loud, motion is
purposeful and short.

---

## 1. Design Language

### 1.1 Colour — surfaces

| Token | Hex | Use |
|---|---|---|
| `void` | `#04060A` | Page background, board field |
| `panel` | `#090D13` | Panel background |
| `panel-2` | `#0E141C` | Elevated panel / row hover |
| `panel-3` | `#141C27` | Selected row, input fill |
| `line` | `#1C2733` | Hairline dividers, wireframe walls (unlit) |
| `line-2` | `#2A3946` | Emphasised border, grid major |

### 1.2 Colour — text

| Token | Hex | Contrast on `void` | Use |
|---|---|---|---|
| `ink` | `#E8F2FB` | 16.8:1 | Primary text, numerals |
| `ink-2` | `#9CB0C4` | 8.1:1 | Secondary text, labels |
| `ink-3` | `#6B8096` | 4.6:1 | Tertiary — meets AA body minimum |
| `ink-4` | `#42566A` | 2.6:1 | **Decorative only.** Never carries information. |

`ink-3` is the floor for any text a player must read. `ink-4` exists for grid ticks and
frame ornament and is forbidden on words.

### 1.3 Colour — semantic

| Token | Hex | Meaning | Non-colour partner |
|---|---|---|---|
| `sys` | `#4DE1FF` | System accent, focus ring, active control | 2px ring + uppercase label |
| `ok` | `#4BE8A4` | Legal, affordable, confirmed | `✓` glyph |
| `warn` | `#FFB43C` | Unspent pool, clamped path, attention | `!` glyph |
| `bad` | `#FF4D6D` | Illegal, blocked, destroyed, trace damage | `✕` glyph + strikethrough |
| `trace` | `#FF3B6B` | Trace boundary and traced area | 45° hatch + dashed edge |

### 1.4 Colour — squads (FR-24, NFR-5)

Five squads must stay mutually distinguishable under deuteranopia, protanopia,
tritanopia, and full greyscale. Colour alone cannot carry this. Design rule:

> **Squad identity = lightness rank (primary) + glyph (secondary) + hue (tertiary) + two-letter tag (always rendered).**

| # | Squad | Hex | approx L\* | Glyph | Marker fill | Tag |
|---|---|---|---|---|---|---|
| 1 | **VECTOR** *(player)* | `#A8FBFF` | 94 | ▲ triangle-up | solid | `VC` |
| 2 | **AXIOM** | `#FFB43C` | 80 | ■ square | solid | `AX` |
| 3 | **KESTREL** | `#5AA8FF` | 68 | ◆ diamond | 50% dot screen | `KS` |
| 4 | **HOLLOW** | `#F2569B` | 60 | ⬡ hexagon | horizontal hatch | `HL` |
| 5 | **NULLSET** | `#8C6BD6` | 50 | ● circle | vertical hatch | `NS` |

Lightness steps are ≥8 L\* apart and monotonic, so the ladder survives full
desaturation. The player is always squad 1 and always the brightest thing on the board —
you can find yourself instantly with no colour vision at all.

**Verification obligation (carried to `polish`):** render the board in
deuteranope / protanope / tritanope / greyscale simulation and confirm every squad pair
is separable. Any failure is fixed by moving lightness, never by adding a legend.

**High-contrast squad mode** (settings toggle): drops hue entirely — all five squads
render in `ink` with only glyph + fill pattern + tag. Ships as an accessibility escape
hatch and doubles as our own verification tool.

### 1.5 Typography

| Role | Family | Weight | Size / tracking |
|---|---|---|---|
| Display | **Chakra Petch** | 700 | 28–44px, `uppercase`, `0.06em` |
| UI heading | Chakra Petch | 600 | 13–18px, `uppercase`, `0.14em` |
| UI body | Chakra Petch | 400/500 | 13–15px, `0.01em` |
| Data / numerals | **IBM Plex Mono** | 400/600 | 11–20px, `0.02em`, `tabular-nums` |

Two families, hard split: **anything that is a number, a stat, a seed, a share string, or
a dial value is mono.** Anything that is a word is Chakra Petch. This makes the board's
readouts scannable as columns and reinforces "you are reading a deck."

Minimum type size anywhere: 11px, and 11px is reserved for mono numerals and all-caps
micro-labels only.

*Mocks load both from Google Fonts CDN. Production self-hosts them — NFR-7 forbids a
runtime network dependency.*

### 1.6 Spacing, radius, edges

- **Base unit 4px.** Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- **Radius: 0.** Vector fiction means hard edges. Inputs and buttons get `2px` maximum.
- **Notched corners** replace rounding as the signature panel treatment: a 10px 45° cut
  on one or two corners via `clip-path`. Used on primary panels and primary buttons only —
  it's a signature, not a texture.
- **Hairlines are 1px `line`.** Emphasis is achieved with glow, not with thicker borders.

### 1.7 Elevation — glow, not shadow

There are no drop shadows. Depth is glow + border luminance.

| Level | Treatment |
|---|---|
| `glow-0` | `border: 1px solid line` — resting panel |
| `glow-1` | `border: 1px solid line-2` + `box-shadow: 0 0 0 1px rgba(77,225,255,.06)` — hover |
| `glow-2` | `border: 1px solid sys` + `box-shadow: 0 0 12px -2px rgba(77,225,255,.45)` — active/selected |
| `glow-3` | `border: 1px solid <squad>` + `box-shadow: 0 0 20px -2px <squad>66` — focused construct, committed state |

### 1.8 Motion

| Motion | Duration | Curve | Purpose |
|---|---|---|---|
| Control state change | 90ms | `ease-out` | Feedback |
| Panel / overlay enter | 160ms | `cubic-bezier(.2,.8,.2,1)` | Orientation |
| Marker traversal (playback) | scaled to round | `linear` | **Truth** — proportional traversal is a rule (FR-15) |
| Damage flash | 220ms | `ease-out` | Consequence |
| Ghost decay pulse | 2400ms loop | `ease-in-out` | Ambience / resolution loss |

**Reduced motion (NFR-5)** is a first-class mode, not a `prefers-reduced-motion`
afterthought — though it also honours the media query. It suppresses glitch, decay pulse,
and continuous playback; playback becomes a **stepped state-card sequence** the player
advances manually. **No information is lost in reduced-motion mode.** Halts, shots,
postures and damage that were animations become explicit labelled cards.

No effect flashes between 3–50 Hz. The ghost pulse is 0.42 Hz and never crosses 40%
luminance delta.

---

## 2. Board Rendering Language

The board is the product. These rules are binding on Coder.

### 2.1 Topology

- Walls are **wireframe**: 1px `line-2` stroke, no fill, faint `sys` glow at 6% opacity.
  They are topology, not architecture — no thickness illusion, no shading.
- Ground plane is `void` with a `line` grid at low opacity, major ticks every 10 units.
  The grid exists for distance estimation, **not** because space is gridded (D-1).
- A **measuring rule** appears along any active path or shot line, in mono, showing exact
  continuous length. Distance is never something the player estimates.

### 2.2 Construct marker

```
        ┌ dial pips (public, FR-19)
        │
    ●●●○○         ← 5-state dial, filled = spent
    ┌─────┐
    │  ▲  │  VC   ← squad glyph + squad tag
    └─────┘
     ═══           ← integrity underline (trace damage)
```

- Footprint circle drawn at true scale; the glyph sits inside it.
- **Dial pips** ride above every marker, on every construct, always — friendly and
  enemy. FR-19 makes damage state public and this is how the promise is kept without a
  click.
- **Commander** carries a **double outer ring** plus a `◆CMD` badge. It is the single most
  important fact on the board (killing it collapses a squad's pool permanently), so it
  gets the loudest non-colour treatment available.
- Selected: `glow-2` ring + reachable-area envelope.
- Destroyed: marker collapses to a 45° cross in `bad`, held for one playback beat, then
  becomes a small persistent `✕` wreck mark at the death position for the rest of the
  match (elimination order is the score — the board should remember).

### 2.3 Posture, called shot, halt

| State | Visual | Label |
|---|---|---|
| Posture held | Bracket pair `⌐ ¬` clamped around the marker + 1px inner ring | `POSTURE` chip on inspector |
| Flat | *(no decoration — flat is the default and free)* | `FLAT` chip, `ink-3` |
| Normal shot | Solid 1px line attacker→target, arrowhead at target | `NORMAL` |
| Called shot | Line with a chevron ligature `»` mid-run + brighter stroke | `CALLED · 1pt` |
| Halt (FR-15) | Path draws to the halt point, then a `▮` stop bar + the un-walked remainder in `ink-4` dashes | `HALT — CONTACT` floating label |

Halts get a floating label and survive in the round log, because "why is my construct
short of where I sent it" is the single most likely confusion in the whole game and the
requirement calls it out explicitly.

### 2.4 Resolution loss (FR-25)

A construct beyond resolution range renders as a **ghost**:

- Marker at 34% opacity, filled with a 2px dither pattern, outline dashed `3 2`.
- A `?` badge in the corner and a mono `LAST SEEN R4` stamp.
- A faint **drift ring** whose radius = chassis movement allowance × rounds since
  confirmation — the honest bound on where it could be.
- The inspector for a ghost reads **`POSITION: UNCONFIRMED · STATS: CONFIRMED`**.

That last line is the load-bearing detail. Resolution loss is *position confidence only*
(FR-25); stats, dial and commander status stay fully readable. The UI must say so out
loud or players will assume the fog hides more than it does.

### 2.5 The trace (FR-20)

- Traced area: 45° hatch in `trace` at 18% opacity, boundary dashed and slowly marching.
- **Next boundary** drawn one round ahead as a thin dotted inset ring with a
  `NEXT · R7` tag — the requirement demands one round of signposting; we render the
  actual geometry, not a warning.
- **Trace timeline** in the HUD: a horizontal rail of round ticks with contraction
  markers and the escalating damage printed under each (`2 · 4 · 6 · 8 · 10`). The whole
  future schedule is public from round 1, so the whole schedule is drawn from round 1.
- A construct standing in the trace gets a pulsing `trace` underline and an inspector line
  `IN TRACE — 6 INTEGRITY AT ROUND END`. Escalating damage means the number must be
  quoted, not implied.

---

## 3. Component Inventory

| Component | Description | States |
|---|---|---|
| **Button / primary** | Notched, `sys` fill on dark, uppercase | default, hover, active, focus-visible, disabled, loading |
| **Button / ghost** | 1px border, transparent | default, hover, active, focus-visible, disabled |
| **Button / danger** | `bad` border, used for delete + commit-irreversible | default, hover, confirm-armed, disabled |
| **Toggle chip** | Small square-cornered on/off (POSTURE, CALLED, HOLD) | off, on, unaffordable, locked |
| **Segmented control** | 2–8 exclusive options (budget, AI tier, shot type) | idle, hover, selected, disabled |
| **Stepper / budget dial** | 25→200 in 25s, 8 stops, arrow-key driven | value, at-min, at-max, focus |
| **Text input** | Roster name, seed, share string | default, focus, valid, error, disabled, readonly |
| **Textarea / share string** | Mono, select-all on focus, copy affordance | empty, filled, copied, import-error |
| **Stat row** | Label + mono value + optional delta | base, modified (`+2` in `ok`), degraded (`−1` in `bad`) |
| **Dial strip** | Ordered state pips + per-state stat grid | full, current-state highlighted, spent, terminal, projected |
| **Dial curve chart** | Sparkline of a stat across dial states | degrade, spike, inversion |
| **Hardpoint slot** | Typed port; drop target | empty, filled, type-valid-hover, type-invalid-hover, locked |
| **Mount card** | Catalog entry: name, cost, type, stats | idle, hover, selected, unaffordable, incompatible |
| **Chassis card** | Name, cost, hardpoint layout, movement, footprint, curve family | idle, hover, selected |
| **Commander badge** | Type + `commander_base` + applied modifications | untagged, tagged, illegal (0 or 2+ per roster) |
| **Budget meter** | Spent / remaining bar with cap ticks | under, exact, over (illegal) |
| **Legality banner** | States the specific violation (FR-4, FR-7) | legal, illegal-with-reason, warning |
| **Construct rail row** | Per-construct row in match HUD; the ledger line | unplotted, plotted, hold, posture, firing, halted, destroyed |
| **Pool ledger** | Pip row + term breakdown + waste warning | full, partial, empty, overspend-blocked, collapsed(=1) |
| **Exchange Card** | Damage vs posture / vs flat, both shot types | preview, declared, invalid (no LOS / out of range) |
| **Exposure meter** | Count of enemy guns bearing on a construct | none, 1, 2, 3+ |
| **Target reticle** | On-board target affordance | valid, hovered, declared, invalid + reason |
| **Marker** | Construct on board | own, enemy, selected, ghost, posture, commander, destroyed |
| **Trace timeline** | Round rail + contraction ticks + damage ladder | past, current, next, future |
| **Round log** | Scrolling plain-language event list | move, halt, shot, posture, damage, dial, destroy, trace |
| **Playback transport** | Play / step / skip-to-end / speed | playing, paused, stepped, complete |
| **Inspector panel** | Any construct's full stats + full dial (FR-24) | own, enemy, ghost, destroyed |
| **Rules drawer** | In-match reference: matrix, pool formula, trace schedule | closed, open, deep-linked to a term |
| **Term tooltip** | Glossary definition on first appearance (FR-27) | idle, hover, pinned |
| **Toast** | Transient: clamped path, copied string, illegal action | info, warn, error |
| **Modal** | Confirm commit, confirm delete, import result | open, confirming, error |
| **Seed field** | Mono, copyable, regenerate | supplied, generated, copied |

---

## 4. Screen Inventory

| # | Screen | Mock file | Purpose | Key FRs |
|---|---|---|---|---|
| 00 | **Boot** | `mocks/00-boot.html` | Title, entry points, desktop-only statement | NFR-4, FR-27 |
| 01 | **Build Zone — Collection** | `mocks/01-build-collection.html` | Rosters + constructs, prebuilts, import/export strings | FR-5, FR-6, FR-7 |
| 02 | **Build Zone — Composer** | `mocks/02-build-composer.html` | Chassis + hardpoints + mounts + commander tag + budget | FR-2, FR-3, FR-4 |
| 03 | **Codex** | `mocks/03-catalog.html` | Full catalog, every stat, every dial | FR-1, FR-19 |
| 04 | **Match Setup** | `mocks/04-match-setup.html` | Budget, tier, archetype, seed, roster, AI roster reveal | FR-8, FR-9, FR-10 |
| 05 | **Deployment** | `mocks/05-deploy.html` | Place constructs in spawn region | FR-12 |
| 06 | **Movement Plot** | `mocks/06-move-plot.html` | Draw paths, allowance, commit | FR-13, FR-14 |
| 07 | **Attack Plot** | `mocks/07-attack-plot.html` | Targets, called shots, postures, pool ledger | FR-16, FR-17, FR-18 |
| 08 | **Resolution Playback** | `mocks/08-playback.html` | Watch the round, round log, skip | FR-15, FR-26 |
| 09 | **Match Summary** | `mocks/09-result.html` | Placement, elimination order, pool efficiency, rematch | FR-21, FR-28 |
| 10 | **Rules Drawer** | `mocks/10-rules.html` | In-match reference overlay | FR-27, FR-24 |
| — | **Prototype hub** | `mocks/index.html` | Navigation across all mocks | *(design aid)* |

Screens 05–08 and 10 share one persistent chrome — the **Match Shell** (§5.4). They are
modes of a single screen, not separate pages. The mocks split them for reviewability.

---

## 5. Screen-by-Screen

### 5.0 Boot

Full-bleed void, wireframe map fragment drifting behind at 6% opacity. Wordmark
`SIGNAL LOSS` in display weight with a 1px chromatic-offset ghost layer (packet loss as
type treatment). Three entries: **NEW MATCH**, **BUILD ZONE**, **CODEX**. A mono
sub-line states the contract in one sentence:
`DETERMINISTIC · NO ROLLS · NO TIMERS · INTENT IS THE ONLY UNKNOWN`.

Below the fold: a `DESKTOP ONLY · 1280×720 MINIMUM · MOUSE + KEYBOARD` notice.
NFR-4 requires the product *state* this rather than degrade silently — so at viewports
under 1280 wide the boot screen shows the statement in place of the entry buttons rather
than reflowing.

### 5.1 Build Zone — Collection

Three columns: **Rosters** (left, 280px) · **Roster detail** (centre, flex) ·
**Constructs** (right, 320px).

- Roster list rows show name, budget chip, construct count, legality dot, commander
  glyph. Prebuilts are a separate pinned group with a `PREBUILT` tag and a
  `DUPLICATE TO EDIT` affordance — FR-5 requires the original survive modification, so
  editing a prebuilt forks it and says so in a toast rather than in a dialog.
- Roster detail: budget meter, construct strip, legality banner, and the **share block** —
  a mono textarea with `COPY` and an `IMPORT` sibling.
- **Import result is a screen state, not a toast.** FR-7 demands distinguishable
  human-readable rejection for malformed / unknown-entry / illegal-roster, and forbids
  silent repair. So import renders a result panel: `MALFORMED AT CHAR 47` /
  `UNKNOWN MOUNT "ICE-9"` / `ILLEGAL: 2 COMMANDERS` / `OK — BUILT FOR 100 PTS`. Legal
  imports still require an explicit `ADD TO COLLECTION` click.
- Delete requires a two-stage armed button (`DELETE` → `CONFIRM DELETE`), never a modal —
  modals for destructive list actions cost more attention than they save.
- Storage-limit failure (FR-6) surfaces as a persistent banner, not a toast.

### 5.2 Build Zone — Composer

The theorycraft screen. Four regions:

1. **Chassis** (left rail) — searchable card list. Each card: cost, hardpoint layout as
   typed glyph row, movement, footprint, and a **curve-family tag** (`DEGRADE` /
   `SPIKE` / `INVERSION`) with a 24px sparkline. The curve family is the chassis's
   personality and belongs on the card, not two clicks deep.
2. **Construct** (centre) — the chassis silhouette with its **hardpoints as physical
   ports** arranged around it. Each port is labelled with its type. Drag a mount onto a
   port, or select port → select mount. Type mismatch is refused *at hover*: the port
   renders `bad`, and a message states the reason — `PORT: ICE · MOUNT: DAEMON` — because
   FR-2 requires the reason be stated, not just the rejection.
3. **Mounts** (right rail) — catalog filtered by the selected port's type by default,
   with a `SHOW ALL` escape. Cards show cost, required type, and every contributed stat.
   Unaffordable mounts are dimmed and tagged `+4 OVER BUDGET` — still visible, because
   FR-1 forbids hiding catalog content.
4. **Dial + commander** (bottom strip) — the full dial as a horizontal state grid:
   one column per state, one row per stat (`MOVE · DMG · RANGE · MOD`). Commander
   modifications overlay this grid as coloured deltas so
   FR-3's "visible before committing" is literal: you see the *before* value struck and
   the *after* value beside it.

Persistent: budget meter and legality banner pinned to the bottom bar with remaining
points always live (FR-4).

**Keyboard (NFR-5 requires full keyboard navigation of the build zone):** `Tab` moves
between the four regions, arrows move within a list, `Enter` selects/mounts, `Backspace`
unmounts, `C` toggles commander tag, `/` focuses search.

### 5.3 Codex

The reference reading of the same data as §5.2, without a construct in progress. Two
tabs: **CHASSIS** and **MOUNTS**, plus a **COMMANDER TYPES** section. Sortable data
tables in mono, with an expandable dial view per chassis showing all states and a stat
curve chart. A permanent line at the top of the screen states the contract:
`EVERY VALUE SHOWN HERE IS THE VALUE USED IN RESOLUTION` (FR-1).

### 5.4 Match Shell (chrome for screens 05–08)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  ROUND 6 · PHASE: ATTACK PLOT   trace timeline   pool ledger  ⚙ ?│
├────────────┬────────────────────────────────────────────┬────────────────┤
│ SQUAD RAIL │                                            │   INSPECTOR    │
│  (280px)   │              BOARD (flex)                  │    (320px)     │
│            │                                            │                │
│ one row    │   wireframe walls · markers · trace        │  full stats +  │
│ per own    │   paths · shot lines · ghosts              │  full dial of  │
│ construct  │                                            │  any construct │
│ = ledger   │                                            │  incl. enemy   │
│            │                                            │                │
│ then a     │                                            │  ─────────────  │
│ compact    │                                            │  ROUND LOG     │
│ enemy list │                                            │                │
├────────────┴────────────────────────────────────────────┴────────────────┤
│ COMMAND BAR   context actions            [ COMMIT MOVEMENT ]  ⌃⏎         │
└──────────────────────────────────────────────────────────────────────────┘
```

Invariants across all match modes:

- **Round number and phase name are always visible** (FR-13).
- **No timer anywhere.** Not a hidden one, not a cosmetic one, not a progress bar that
  looks like one. C-7 is a promise the UI must visibly keep; the command bar reads
  `NO TIMER — COMMIT WHEN READY` beneath the commit button during plotting phases.
- **Pool ledger is always visible during attack plotting** (FR-17) and shown greyed with
  its projected next-round value during movement — so the player plots movement already
  knowing what they'll be able to afford.
- **Trace timeline is always visible** (FR-20).
- **Any construct is inspectable, including enemies** (FR-24) — click any marker, or
  `Tab` through the enemy list.

### 5.5 Deployment

Board is dimmed outside the player's spawn region; the region is drawn as a solid-edged
zone with a `YOUR SPAWN` tag. Squad rail lists undeployed constructs; drag one to the
board or select + click. Invalid drops (wall overlap, construct overlap, outside region)
show the reason at the cursor. Other squads' spawn regions are outlined and labelled but
empty — their deployments reveal simultaneously at match start (FR-12), and the empty
outlines make that fact obvious rather than surprising.

Command bar: `DEPLOY ALL (auto)` as a convenience, and `BEGIN MATCH` disabled with
`3 CONSTRUCTS UNPLACED` until every construct is down.

### 5.6 Movement Plot

**The core interaction.**

- Select a construct: click marker, click rail row, or press `1`–`9`.
- On selection the board draws the **reach envelope** — the outline of everywhere that
  construct can legally end, walls accounted for. This is a computable public fact and
  the player should never have to test it by trial and error.
- Draw a path: click to place waypoints, `double-click` or `Enter` to finish; or
  click-drag for freehand which simplifies to a polyline on release.
- A **length rule** follows the cursor in mono: `7.4 / 9.0`. Past allowance the excess
  segment renders `warn` dashed and is **clamped** on release, with a toast
  `PATH CLAMPED TO 9.0` (FR-14 permits reject or clamp; clamping is kinder and equally
  deterministic).
- Wall crossing is refused at placement: the offending segment flashes `bad`, the wall
  edge lights, and the waypoint snaps to the last legal point.
- Editing until commit: drag waypoints, `Backspace` drops the last, `Esc` clears,
  `H` sets HOLD (empty path — legal and free, FR-14).
- Rail rows show plot state as a ledger line: `UNPLOTTED · PATH 7.4/9.0 · HOLD`.
- Commit is explicit and armed: `COMMIT MOVEMENT` → confirm modal listing anything
  unplotted (`2 constructs will HOLD`). Irreversible actions get one deliberate beat.

**Anticipated collisions are not shown.** D-2's both-stop rule is deterministic, but
showing predicted halts would leak enemy intent, which violates FR-24's private-until-
commit half. The reach envelopes of enemy constructs *are* available on demand (public
information — stats and positions), which is the legitimate version of the same question.

### 5.7 Attack Plot — the centrepiece

Everything here serves the matching-pennies decision under a 2–5 point budget.

**Squad rail as ledger.** One row per living construct:

```
┌────────────────────────────────────────────────────┐
│ ▲ 3  SPINE-CLASS      ●●●○○   EXPOSURE ▮▮▯  2 guns │
│      TARGET  → AX-2 ⬡ HOLLOW-4        [NORMAL|CALLED]│
│      SELF    [ FLAT | POSTURE ]                 1pt │
└────────────────────────────────────────────────────┘
```

Two independent controls per row, exactly matching FR-16: the shot's type and the
construct's own posture are separate purchases from one pool, and a construct may do both.

**Pool ledger** (top right, always visible, FR-17):

```
POOL  ◆◆◆◇   3 / 4 SPENT
      1 base + 1 cmd(SYSOP) + ⌊6/3⌋=2
      ⌐ posture ×2   » called ×1
      ⚠ 1 POINT WILL BE LOST AT COMMIT
```

The term breakdown is required by FR-17 and is also the teaching surface for the whole
economy. The waste warning is deliberate emotional pressure: zero carryover is the
design's cruelty and the UI should make you feel it every round. When the commander dies
the ledger collapses to `POOL ◆ 1 / 1 · COMMANDER LOST — PERMANENT` in `bad`.

**The Exchange Card** — the single most important component in the product. On hovering
or declaring any target:

```
┌ SPINE-CLASS → HOLLOW-4 ─────────────┐
│ RANGE 8.2 / 12  ✓    LOS  ✓         │
│                                     │
│              TARGET POSTURED  FLAT  │
│  NORMAL   0pt        0          7   │
│  CALLED   1pt        3         10   │
│                                     │
│ target dial: ●●○○  →  ●●●○ if 7     │
└─────────────────────────────────────┘
```

Exact integers, both shot types, both enemy states, floor-rounded and minimum-1 applied
exactly as FR-18 specifies — plus the resulting dial advance. FR-18's final criterion
requires the player be able to see this before commit; making it a persistent hover
artifact rather than a queried panel is what turns "can compute" into "does compute."

**Exposure meter.** Each of the player's constructs shows how many enemy constructs
currently have LOS + range on it. This is derived entirely from public information
(positions, stats, ranges) and is exactly the calculation that makes posture triage a
decision rather than a guess. Hovering it lists which ones and their damage at current
dial state.

**Invalid targets** are never silently unclickable. Hovering an out-of-reach enemy shows
`OUT OF RANGE 14.2 / 12` or `NO LINE OF SIGHT` at the reticle.

**Overspend** is blocked at plot time with the balance shown (FR-16): the control shakes
90ms, the pool ledger flashes, and a toast reads `POOL EXHAUSTED — 0 REMAINING`.

Keyboard: `1`–`9` select, `T` then click declares target, `C` toggles called shot,
`P` toggles posture, `Ctrl+Enter` commits.

### 5.8 Resolution Playback

The board plays; the rail becomes a **round log**; the transport sits in the command bar.

Order is the round order (FR-13), and each beat is announced in the log in plain language:

```
R6 · MOVEMENT
  ▲ SPINE-CLASS       moved 7.4
  ■ AX-2              HALTED — contact with ⬡ HL-4 at 3.1
R6 · ATTACK
  ▲ SPINE-CLASS  »CALLED→ ⬡ HL-4      10 dmg   (target was FLAT)
  ⬡ HL-4         NORMAL→ ▲ SPINE       0 dmg   (target held POSTURE)
  ⬡ HL-4         dial ●●○○ → ●●●○
R6 · TRACE
  ● NS-1          6 integrity  (advance 3)
R6 · ELIMINATION
  ■ AX-2 DESTROYED — squad AXIOM eliminated (4th)
```

- Posture states reveal at the attack beat — the reveal *is* the payoff of the round, so
  it gets its own 220ms beat with the bracket glyphs snapping onto every posturing marker
  at once across all five squads.
- Halts get an on-board floating `HALT — CONTACT` label (FR-15).
- `SKIP TO END` is always available (FR-26); the log remains complete afterwards.
- Playback never influences the result and the UI says so implicitly by allowing skip
  without consequence.
- **Reduced motion:** the same beats render as a vertical stack of state cards the player
  steps with `→`. Identical information, zero animation.

### 5.9 Match Summary

Placement first and large: `2ND OF 5`. Then:

- **Elimination order** as a five-row ladder with squad glyph, tag, round eliminated.
- **Per-construct table:** damage dealt, damage taken, rounds alive, final dial state.
- **Pool efficiency panel** (FR-28): points granted / spent / **wasted**, split
  postures vs called shots, plus a per-round sparkline of spent-vs-wasted. This is the
  self-coaching surface — waste is the most legible mistake in the game.
- **Reproducibility block:** seed, budget, archetype, AI tier, and share strings for the
  player's roster **and all four AI rosters**, each copyable (FR-21). The AI rosters being
  copyable is the quiet gift here — losing to a build you can now open in the composer is
  the loop that makes the build zone matter.
- Actions: `REMATCH · SAME SEED` · `REMATCH · NEW SEED` · `BUILD ZONE`.
- Explicit line: `NO PROGRESSION — ROSTERS ARE UNCHANGED BY PLAY` (FR-21 non-goal, stated
  so players don't hunt for XP).

### 5.10 Rules Drawer

A right-side overlay, `?` or `F1`, over any match mode without leaving the match (FR-27).
Contents in fixed order: **outcome matrix**, **pool formula with your current numbers
substituted**, **trace schedule with your current round marked**, **glossary**. Every
glossary term rendered anywhere in the product is a dotted-underline tooltip trigger that
deep-links into this drawer.

---

## 6. User Flows

### Flow A — New player to first match *(the on-ramp; there is no tutorial, A-4)*
1. **Boot** → `NEW MATCH`
2. **Match Setup** → budget `100` (default) → AI tier `1` → archetype `any` → seed blank
3. Roster picker shows **prebuilts** first, legality pre-verified → pick one
4. `GENERATE` → map + four AI rosters render, seed displayed and copyable
5. **Deployment** → `DEPLOY ALL` or place by hand → `BEGIN MATCH`
6. **Movement Plot** → select → draw → commit
7. **Playback** → watch
8. **Attack Plot** → target → posture/called → commit
9. **Playback** → repeat 6–9 until trace closes
10. **Match Summary** → placement → `BUILD ZONE`

The first-time player never touches the composer. Prebuilts plus in-context tooltips are
the entire on-ramp, exactly as FR-27/A-4 require.

### Flow B — Theorycraft loop *(the secondary user's home)*
Collection → duplicate a prebuilt → Composer → swap chassis → mounts refilter by port
type → tag commander, watch the dial deltas apply → budget meter goes red → drop a
mount → legal → save → copy share string → paste in Discord.

### Flow C — Learning from a loss
Summary → notice `7 POINTS WASTED` → copy the winning AI's share string →
Build Zone → import → result panel confirms `OK — BUILT FOR 100 PTS` →
`ADD TO COLLECTION` → open in Composer → inspect its dial → rematch same seed.

### Flow D — The round *(the loop that must feel good 24 times a match)*
Pool refills → read the ledger → plot movement blind → commit → *find out where the
board is* → read exposure → open Exchange Cards → triage 4 points across 6 constructs →
commit → *find out what they intended* → repeat.

---

## 7. Interaction Notes & Rulings

Decisions Coder should not have to re-derive:

1. **Nothing in this UI is modal-on-the-board.** Selecting a construct never blocks
   inspecting another. Inspection is always available in every phase, including during
   playback and commit confirmation.
2. **Commit is the only irreversible action** and is the only place a confirm step
   appears in the match loop. Everything before commit is freely editable (FR-14, FR-16).
3. **No progress bars in plotting phases.** They read as timers.
4. **Enemy plot state is never hinted at** — not by rail ordering, not by highlight, not
   by "they seem to be aiming at you." Intent is the only secret and the UI leaks none of
   it.
5. **Everything public is one hover away, zero clicks deep** where it fits, and never more
   than one click. If a player has to open a panel to learn something the rules call
   public, the information contract is being technically honoured and practically broken.
6. **Numbers are always exact and always mono.** No bars without numerals, no "high /
   medium / low", no approximations. A game with zero variance should never round for the
   player's comfort.
7. **Errors state the rule, not the failure.** `TYPE MISMATCH — PORT: ICE · MOUNT: DAEMON`,
   not `Invalid`. Every rejection in FR-2, FR-4, FR-7, FR-14, FR-16 names its rule.
8. **The wasted-point warning is never suppressed** and has no "don't show again."
9. **Ghosts are never cleaned up quietly.** When a construct re-enters resolution its
   ghost animates to the confirmed position rather than teleporting, so the player sees
   the correction happen (FR-25).
10. **Reduced motion is information-complete.** Any animation carrying information has a
    static equivalent. This is a review gate, not a preference.

### Keyboard map

| Key | Context | Action |
|---|---|---|
| `1`–`9` / `0` | Match | Select own construct n |
| `Tab` / `Shift+Tab` | Any | Cycle focus region / list item |
| `Enter` | Plot | Finish path · select · mount |
| `Esc` | Plot | Clear current path / deselect / close overlay |
| `Backspace` | Plot / Composer | Remove last waypoint / unmount |
| `H` | Movement | Set HOLD |
| `T` | Attack | Enter target-pick mode |
| `C` | Attack / Composer | Toggle called shot / toggle commander tag |
| `P` | Attack | Toggle posture |
| `I` | Match | Inspect hovered construct |
| `Ctrl+Enter` | Plot | Commit phase |
| `Space` | Playback | Play / pause |
| `→` | Playback | Step one beat |
| `S` | Playback | Skip to end |
| `?` / `F1` | Any | Rules drawer |
| `/` | Build Zone | Focus search |

---

## 8. Responsive & Platform

D-4 and NFR-4 make this **desktop-only, minimum 1280×720**. That is a design licence, not
a limitation — the layouts assume a real pointer and a wide canvas.

| Width | Behaviour |
|---|---|
| ≥1680 | Full three-column match shell, inspector and round log both expanded |
| 1440–1679 | Inspector collapses round log to a 5-line tail, expandable |
| 1280–1439 | Squad rail compacts to 240px; Exchange Card becomes a cursor-anchored popover |
| <1280 | **Statement, not degradation.** A full-screen notice: `SIGNAL LOSS IS A DESKTOP PRODUCT — 1280×720 MINIMUM · MOUSE + KEYBOARD REQUIRED`, per NFR-4 |

Mocks are authored at 1440×900 and verified at 1280×720.

---

## 9. Mock Boilerplate

Every mock opens with this exact block, so the token set is identical across all files
and Coder can lift it directly.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[SCREEN] — SIGNAL LOSS</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script>
tailwind.config = { theme: { extend: {
  colors: {
    void:'#04060A', panel:'#090D13', panel2:'#0E141C', panel3:'#141C27',
    line:'#1C2733', line2:'#2A3946',
    ink:'#E8F2FB', ink2:'#9CB0C4', ink3:'#6B8096', ink4:'#42566A',
    sys:'#4DE1FF', ok:'#4BE8A4', warn:'#FFB43C', bad:'#FF4D6D', trace:'#FF3B6B',
    vector:'#A8FBFF', axiom:'#FFB43C', kestrel:'#5AA8FF', hollow:'#F2569B', nullset:'#8C6BD6',
  },
  fontFamily: { display:['Chakra Petch','sans-serif'], mono:['IBM Plex Mono','monospace'] },
}}}
</script>
</head>
<body class="bg-void text-ink font-display antialiased">
```

Shared utility classes defined in each mock's `<style>`: `.notch` (10px corner cut),
`.hatch` (45° trace fill), `.dither` (ghost fill), `.glow-2`, `.glow-3`, `.rule`
(1px `line` divider), `.tnum` (`font-variant-numeric: tabular-nums`).

---

## 9b. Mock Canon — Illustrative, Not Authored

The mocks share one internally consistent catalog so that twelve screens agree with each
other. **These values are placeholders chosen to exercise the UI, not a costed catalog.**
FR-30 makes the real catalog a data deliverable, and the requirements name it as the
critical path and a *content* deliverable — it is not Designer's to author.

Shared across all mocks: 7 chassis (RELAY 8 · CIPHER 9 · LATCH 10 · SPINE 12 · FERAL 14 ·
KILN 18 · MONOLITH 22), 11 mounts across the five families, 4 commander types
(COURIER +5 · SYSOP +6 · BULWARK +8 · OVERCLOCK +10, bases 1/1/1/2). The match-loop
screens (05–10) all render one match: VECTOR squad, 6 constructs, LATCH-05 tagged SYSOP
commander, pool `1 + 1 + ⌊6/3⌋ = 4`, trace contractions on R4/R6/R8/… with the ladder
2·4·6·8·10 holding at 10 once the final region is reached.

Two things Coder must not infer from the mocks:
- **Dials for RELAY, CIPHER, FERAL and MONOLITH were extrapolated** to fill the Codex.
  Only SPINE (degrade), KILN (spike) and LATCH (inversion) illustrate deliberate curve
  families. Treat all four as unauthored.
- **No cost in the mocks has been through FR-31's costing battery.** They are arithmetic
  placeholders, not balance claims.

---

## 10. Open Design Questions

- **DQ-1 — Reach envelope and enemy intent.** Showing your own reach envelope is
  unambiguously public. Showing an *enemy's* on demand is also public — but it makes the
  collision-prediction question much easier to ask. Is on-demand correct, or should it be
  always-on for all constructs? Leaning on-demand; revisit after playtest.
- **DQ-2 — Exchange Card density.** At nine constructs the attack rail is tall and the
  Exchange Card is large. Does the card belong pinned in the inspector rather than as a
  hover popover at high construct counts? Resolve at `prototype`.
- **DQ-3 — Ghost drift ring honesty.** The drift ring shows the true bound on a ghost's
  position, which is public-derivable. Is rendering it clarity or clutter at five squads?
- **DQ-4 — Wreck marks.** Persistent death markers aid elimination-order reading but add
  board noise late in a match when it's most crowded. Fade after N rounds, or keep?
- **DQ-5 — Squad palette verification.** §1.4's lightness ladder is designed to survive
  simulation but has not been run through one. **Blocking item for `polish`.**
- **DQ-6 — Composer dial deltas.** Commander modifications shown as struck-through
  before/after pairs across a 5-state × 4-stat grid may be too dense. Alternative: a
  toggle between `BASE` and `AS COMMANDER` views. Resolve at `prototype`.

---

## 11. Requirements Coverage

| FR | Where designed |
|---|---|
| FR-1 Catalog browsing | §5.3 Codex, §5.2 rails |
| FR-2 Composition | §5.2 hardpoint ports, type-mismatch reason |
| FR-3 Commander tagging | §5.2 dial delta overlay, §2.2 double ring + `◆CMD` |
| FR-4 Budget legality | §5.2 budget meter + legality banner |
| FR-5 Prebuilts | §5.1 pinned group, fork-on-edit |
| FR-6 Local collection | §5.1 armed delete, storage banner |
| FR-7 String sharing | §5.1 import result panel |
| FR-8 Match config | §5.4 setup, seed field |
| FR-9 AI rosters | §5.4 pre-match reveal, §5.9 share strings |
| FR-10/11 Maps | §5.4 archetype + seed, board render §2.1 |
| FR-12 Deployment | §5.5 |
| FR-13 Round structure | §5.4 top bar invariants |
| FR-14 Movement plotting | §5.6 |
| FR-15 Simultaneous movement | §2.3 halt treatment, §5.8 log |
| FR-16 Attack plotting | §5.7 rail ledger |
| FR-17 Reaction pool | §5.7 pool ledger + term breakdown |
| FR-18 Deterministic resolution | §5.7 Exchange Card |
| FR-19 Dials | §2.2 pips, §5.2/§5.3 dial grid |
| FR-20 Trace | §2.5 timeline + next boundary |
| FR-21 Elimination | §5.9 |
| FR-22/23 AI | §5.4 tier selector *(no UI surface beyond selection — correct)* |
| FR-24 Information contract | §0, §7.5, inspector everywhere |
| FR-25 Resolution loss | §2.4 ghosts |
| FR-26 Playback | §5.8 |
| FR-27 Rules reference | §5.10 drawer + tooltips |
| FR-28 Match summary | §5.9 |
| NFR-4 Platform | §8 |
| NFR-5 Accessibility | §1.4, §1.8, §5.2 keyboard, §7.10 |
| NFR-9 Art constraint | §1.6, §2.1 — vectors, glow, motion only |
</content>
</invoke>
