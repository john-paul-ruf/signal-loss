# Architecture — SIGNAL LOSS

**Status:** approved · builder-confirmed 2026-08-28 · phase `architecture`
**Derived from:** `specs/idea.md`, `specs/requirements.md`, `specs/design.md`
**Owns:** stack, module boundaries, dependency flow, state model, codec format, determinism strategy, deployment
**Does not own:** catalog values (content design), screen layout (Designer), schema tables (DB), implementation (Coder)

---

## 0. Architectural Thesis

Four requirements dictate the entire structure. Everything below is downstream of them.

1. **NFR-2 / FR-29 — determinism is a P0 correctness property, not a feature.**
   A match must replay byte-identically, resolve order-independently, and produce the
   same result in Chrome, Safari, and Node. This is not achievable by discipline alone,
   so it is achieved structurally: **all rule-affecting arithmetic is integer
   fixed-point**, the engine is a **pure, dependency-free, DOM-free module**, and the
   forbidden-primitive list (§4.3) is enforced by lint, not by review.

2. **FR-29 / FR-11 / FR-23 / FR-31 — the headless harness is not a test tool, it is a
   second consumer of the product.** Three shipping-gate batteries run the full game with
   no browser. That means the engine cannot be reachable *from* the UI only — the UI must
   be reachable *from* the engine's boundary, and the engine must not know the UI exists.
   Engine is a library; the browser app and the Node harness are two clients of it.

3. **FR-24 — the information contract is an architectural boundary, not a UI convention.**
   "Intent is the only hidden information" is enforceable by construction: the AI runs in
   a **Web Worker** that is only ever handed a `PublicState`. It is structurally
   incapable of seeing an uncommitted human plot, because that data never crosses the
   `postMessage` boundary. A promise the type system and the process boundary both keep
   is stronger than one a code review keeps.

4. **C-1 / NFR-7 / NFR-8 — no backend, ever, and no runtime network call.**
   Static bundle, service-worker precache, self-hosted fonts, and a Content Security
   Policy with `connect-src 'none'`. The privacy requirement is enforced by a header the
   browser applies, so a stray `fetch()` in future code fails loudly rather than silently
   violating NFR-8.

The shape that falls out: **one pure engine, two clients, zero services.**

---

## 1. Stack Decision

| Layer | Technology | Rationale |
|---|---|---|
| Language | **TypeScript 5.7**, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | Catalog data, dial state machines, and the codec are all shape-heavy. Types are the cheapest defence against a malformed dial reaching resolution (FR-30). |
| Runtime target | ES2022, browser + Node 22 | Same source runs in the tab and in the CI harness. No transpile fork. |
| UI framework | **React 19** | Screens 01–03 and the match shell are dense, stateful panel UI (composer, codex tables, pool ledger, inspector). Component reuse across 11 screens (§3 of design.md is a 30-component inventory) is the win. The board is canvas, so React's reconciler never touches the 60fps path. |
| Board rendering | **Canvas 2D**, layered, hand-rolled scene | 50 markers + dial pips + wireframe walls + trace hatch + paths + ghosts at 60fps (NFR-3). Full control of glow/dither/hatch (design.md §1.7, §2.4). SVG at this node count reflows badly; WebGL is unjustified complexity for ~2k primitives. |
| Chrome / panels | **HTML + Tailwind CSS v4** | Mocks are already authored in Tailwind with the exact token set (design.md §9). Coder lifts markup directly. v4's CSS-first `@theme` config carries the tokens with no JS config file. |
| State management | **Zustand 5** (vanilla store + React bindings) | Selector-based subscriptions keep the squad rail and pool ledger from re-rendering the world on every waypoint drag. Vanilla store means UI state is readable from the worker bridge and from tests without React. ~1KB. |
| Engine dependencies | **none** | The engine has *zero* runtime dependencies. Every dependency is a determinism risk and an offline risk. Validation, PRNG, fixed-point math, and the codec are all hand-rolled (~1200 lines total) rather than imported. |
| Data / catalog | **Authored JSON in `data/`**, validated on load by a hand-rolled schema validator in the engine | FR-30 requires catalog and every tunable be data. Validation is engine-side so the harness gets the same load-time failure the browser does. |
| Persistence | **`localStorage`**, namespaced + versioned, via a `CollectionRepository` port | FR-6 is a handful of KB of roster JSON. Synchronous, quota errors are catchable and reportable (FR-6's explicit requirement), survives sessions (A-1). |
| Concurrency | **Web Workers** — one AI worker (pooled per squad), one map-gen worker | AI search and the map playability gate (< 2s, NFR-3) must not block the 60fps plotting thread. Doubles as the FR-24 information boundary. |
| Build tool | **Vite 6** | Sub-second HMR, first-class worker bundling (`new Worker(new URL(...))`), library-mode capable, static output. |
| Test framework | **Vitest 3** (unit + engine), **Playwright** (UI smoke + `@axe-core/playwright` for NFR-5) | Vitest shares Vite's transform pipeline — engine tests run in Node against the exact code the browser ships. |
| Harness | **Node 22 + `tsx`**, CLI in `harness/` | FR-11, FR-23, FR-31 batteries. Imports `src/engine` directly. No browser, no bundler. |
| Offline | **`vite-plugin-pwa`** (Workbox), precache-everything strategy | NFR-7. Catalog, fonts, and bundle are all precached; there is nothing to fetch at runtime. |
| Fonts | **`@fontsource`** self-hosted (Chakra Petch, IBM Plex Mono), `woff2`, subset latin | design.md §1.5 notes the mocks' CDN link must not ship. NFR-7 forbids it outright. |
| Deployment | **Static bundle → any static host** (Cloudflare Pages / GitHub Pages / Netlify) | C-1. `dist/` is the artifact. No server, no runtime config, no environment variables. |
| CI | **GitHub Actions** | Runs unit tests + the three batteries on every catalog or engine change (NFR-10). |

### 1.1 Alternatives Considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| UI framework | React 19 | Svelte 5, vanilla TS + templates | Svelte is leaner and its signals suit the ledger UI well, but React's ecosystem depth and the sheer volume of panel components tip it. Vanilla was seriously considered — the board is canvas anyway — but the composer alone (4 linked regions, live legality, dial delta overlay) is where hand-rolled DOM becomes a liability. **Reversible:** the engine is framework-agnostic; a UI rewrite touches no rules. |
| Board rendering | Canvas 2D | SVG, WebGL/PixiJS | SVG gives free hit-testing and CSS styling, but 50 constructs × (footprint + glyph + 5 dial pips + rings + tag) ≈ 500+ nodes mutating per playback frame, plus hatch/dither patterns, is a layout-thrash risk against the 60fps target. WebGL buys headroom we don't need for ~2k primitives and costs a shader pipeline for glow. Canvas 2D with layer caching is the middle. |
| Fixed-point vs float | Integer fixed-point (`FX_ONE = 1024`) | IEEE-754 doubles with epsilon comparisons | Doubles are *mostly* deterministic in JS, but `Math.hypot`, `Math.pow`, and trig are implementation-defined across engines (V8 vs JavaScriptCore vs SpiderMonkey), and epsilon comparisons make order-independence (FR-15) unprovable. Integers make byte-identical replay a property of the number system rather than of care. |
| Movement resolution (OQ-7) | Fixed substepping + halt fixed-point | Analytic swept-circle intersection | See §5.2. Analytic requires quadratic roots (floats), and cascade handling requires ordering halts by collision *time*, which reintroduces exactly the evaluation-order dependence FR-15 forbids. Substepping makes order-independence structural. |
| Persistence | `localStorage` | IndexedDB, OPFS, File System Access | Rosters are ~200 bytes each; a heavy collection is under 100KB against a 5MB budget. IndexedDB's async API would infect the build-zone store for no capacity we need. Quota errors are catchable in both; localStorage's are simpler to surface (FR-6). |
| Catalog validation | Hand-rolled validator | Zod / Valibot / Ajv | 13–50KB of dependency inside the engine's purity boundary, for ~40 field checks we can express directly. Zero-dependency engine is a load-bearing determinism claim. |
| Share-string compression | Bit-packed binary + Base64url, no compressor | `CompressionStream('deflate-raw')`, LZ-string, JSON+gzip | A 6-construct roster bit-packs to ~40 bytes → ~56 chars of Base64url. Compression would add async APIs and a Safari version floor to save nothing at that size. |
| Styling | Tailwind v4 | CSS Modules, vanilla-extract, styled-components | The mocks are already Tailwind with the exact design tokens. Any other choice means re-authoring 12 mocks' worth of markup. |
| AI placement | Web Worker, one per AI squad (pooled) | Main thread with time-slicing, `requestIdleCallback` | Time-slicing on the main thread competes with the 60fps plotting target and makes the information boundary a convention instead of a wall. |
| AI search bound | **Deterministic node budget** | Wall-clock time budget | A time-bounded search produces different results on a fast and a slow machine — an instant, irreparable NFR-2 violation. Search is bounded by nodes visited. See §7.3. |
| Monorepo split | Single package, enforced internal boundaries | pnpm workspace: `@signal-loss/engine` + `@signal-loss/app` | Workspaces buy publishable isolation we have no use for and cost build complexity. The boundary is enforced by `eslint-plugin-import`'s `no-restricted-paths` instead, which is checked in CI just as reliably. |

---

## 2. Module Structure

```
signal-loss/
├── data/                        — authored content, validated at load (FR-30)
│   ├── catalog.chassis.json     — chassis: dial, hardpoints, movement, footprint, cost
│   ├── catalog.mounts.json      — mounts: family, required port type, stats, cost
│   ├── catalog.commanders.json  — commander types: cost, commander_base, modifications
│   ├── catalog.prebuilts.json   — prebuilt rosters, one+ per budget (FR-5)
│   ├── tunables.json            — every constant in requirements §Tunables (FR-30)
│   └── map.archetypes.json      — 7 archetype parameter sets + target ranges (FR-10)
│
├── src/
│   ├── engine/                  — PURE. No DOM, no deps, no I/O, no clock, no float.
│   │   ├── fx/                  — fixed-point scalars, vectors, geometry, isqrt
│   │   ├── rng/                 — seeded PRNG + named streams
│   │   ├── catalog/             — schema, validator, loader, id↔code table
│   │   ├── build/               — construct/roster model, costing, legality
│   │   ├── codec/               — share-string encode/decode (FR-7)
│   │   ├── map/                 — generation, archetypes, playability gate (FR-10/11)
│   │   ├── match/               — match state, round pipeline, all resolution (FR-13–21)
│   │   ├── view/                — per-squad public projection + resolution loss (FR-24/25)
│   │   ├── ai/                  — tiered policies (FR-22/23)
│   │   └── index.ts             — the engine's entire public surface
│   │
│   ├── app/                     — browser client. React + Canvas.
│   │   ├── board/               — canvas scene graph, layers, camera, hit-test
│   │   ├── screens/             — 11 screens from design.md §4
│   │   ├── components/          — the 30-component inventory from design.md §3
│   │   ├── store/               — zustand slices: collection, setup, match, prefs
│   │   ├── bridge/              — worker clients (typed request/response)
│   │   └── main.tsx             — mount, routing, error boundary
│   │
│   ├── workers/                 — worker entry points (import engine only)
│   │   ├── ai.worker.ts
│   │   └── mapgen.worker.ts
│   │
│   └── platform/                — browser capabilities behind ports
│       ├── storage/             — CollectionRepository (localStorage impl)
│       ├── clipboard/           — copy share string / seed
│       └── capability.ts        — viewport gate (NFR-4), reduced-motion, storage probe
│
├── harness/                     — Node CLI. Imports src/engine only. (FR-29)
│   ├── cli.ts                   — `sl <battery> [--seeds N] [--json]`
│   ├── playability.ts           — FR-11 battery
│   ├── behavior.ts              — FR-23 AI battery
│   ├── costing.ts               — FR-31 costing + snowball battery
│   ├── determinism.ts           — FR-29: replay + permutation checks
│   └── report/                  — machine-readable + human-readable output
│
├── tests/                       — Tester's. Vitest + Playwright.
└── dist/                        — Deployer's. Static bundle.
```

### 2.1 The one hard rule

> **`src/engine/**` may import only from `src/engine/**`.
> Nothing in `src/engine/**` may import React, the DOM, `src/app`, `src/platform`, or any
> npm package.**

Enforced in CI by `eslint-plugin-import` `no-restricted-paths` + a `no-restricted-imports`
zone. A violation fails the build. This single rule is what makes the harness, the worker,
and the browser three clients of one identical rule implementation.

---

## 3. Module Contracts

### 3.1 `engine/fx` — fixed-point mathematics

- **Owns:** the number system every rule-affecting value uses.
- **Exports:** `Fx` (branded integer), `FX_ONE = 1024`, `fxAdd/Sub/Mul/Div`, `Vec2`,
  `isqrt`, `dist2`, `segIntersect`, `pointInPoly`, `circleOverlap`.
- **Depends on:** nothing.
- **Key contract:**
  - 1 board unit = `1024` fx. A board is ≤ 2048 units → ≤ 2.1e6 fx. Squared distances
    reach ~8.8e12, comfortably inside the exact-integer range (2^53).
  - `isqrt(n)` = exact `floor(sqrt(n))`, computed as `Math.sqrt` seed plus a ±1
    correction loop. `Math.sqrt` is the *only* permitted `Math` transcendental because
    IEEE-754 requires it be correctly rounded; the correction loop makes even that
    dependency-free of rounding mode.
  - Segment intersection and point-in-polygon use **integer cross products only** —
    sign tests, never divisions. Exact by construction.
  - Prefer squared distances. `isqrt` is called only where a true length is required
    (polyline length vs movement allowance, the measuring rule in design.md §2.1).

### 3.2 `engine/rng` — seeded randomness

- **Owns:** every non-deterministic-looking value in the product.
- **Exports:** `Rng` (PCG32 over `Uint32Array`), `rngFromSeed(seed: string)`,
  `stream(rng, label: string): Rng`, `nextInt`, `nextRange`, `pick`, `shuffle`.
- **Depends on:** `fx`.
- **Key contract:**
  - **Named streams.** A consumer never draws from the root RNG; it draws from
    `stream(root, "map.walls")`, `stream(root, "ai.squad3.round7")`, etc. The stream key
    is hashed (FNV-1a) into the state. **Consequence:** adding a `nextInt()` call in map
    generation cannot shift AI roster generation. Without this, every tuning change
    invalidates every recorded seed.
  - AI decisions may consume randomness — that is not "randomness in resolution" (C-6).
    Resolution (`match/attack`, `match/movement`, `match/trace`) draws from **no** RNG at
    all; those modules do not import `engine/rng`. Enforced by lint.

### 3.3 `engine/catalog` — content loading and validation

- **Owns:** the in-memory catalog and its integrity.
- **Exports:** `Catalog`, `loadCatalog(raw): Result<Catalog, CatalogError[]>`,
  `Chassis`, `Mount`, `CommanderType`, `Dial`, `DialState`, `HardpointType`, `Tunables`.
- **Depends on:** `fx`.
- **Key contract:**
  - Validates on load and **fails loudly**, never partially (FR-30). Checks include:
    every mount's port type exists; every dial has ≥1 state and monotone ordering;
    every cost is a non-negative integer; every chassis declares its curve family and the
    declared family matches the dial's actual shape; **no chassis' hardpoint layout admits
    one of each of the five mount families** (FR-2's structural rule, checked
    combinatorially at load, not left to the content author's memory).
  - Every catalog entry carries a **stable numeric `code`** alongside its string `id`.
    Codes are assigned in data, never reused, never renumbered — they are the codec's
    wire identity (§3.5). A duplicate or missing code is a load failure.
  - `Tunables` is a typed read of `tunables.json`. **Nothing anywhere else in the engine
    may contain a rule-affecting numeric literal.** Lint rule: `no-magic-numbers` inside
    `engine/match`, `engine/map`, `engine/ai`, with `0` and `1` allowed.

### 3.4 `engine/build` — composition, costing, legality

- **Owns:** what a legal construct and a legal roster are.
- **Exports:** `Construct`, `Roster`, `constructCost`, `rosterCost`,
  `validateConstruct(c, catalog): Violation[]`, `validateRoster(r, catalog, budget): Violation[]`,
  `applyCommanderType(chassis, type): Chassis` (returns the modified stat/dial view for
  design.md §5.2's delta overlay).
- **Depends on:** `catalog`, `fx`.
- **Key contract:** `Violation` is a **discriminated union with a rendered reason string
  and the rule id it comes from** — `{ rule: "FR-2", kind: "PORT_TYPE_MISMATCH", port, mount, message }`.
  design.md §7.7 requires every rejection name its rule; this is the type that guarantees
  it. The same `Violation[]` is consumed by the composer's legality banner, by codec
  import, by AI roster generation, and by the costing battery — **one legality
  implementation, four consumers.**

### 3.5 `engine/codec` — share strings (FR-7)

- **Owns:** the wire format.
- **Exports:** `encodeConstruct`, `encodeRoster`, `decode(s): Result<Roster|Construct, DecodeError>`.
- **Depends on:** `catalog`, `build`.
- **Format:**

```
SL1-<base64url payload>

payload (bit-packed, big-endian bit order):
  u8    format version            (1)
  u3    kind                      (0 = construct, 1 = roster)
  u4    budget index              (0..7 → 25..200)  [roster only]
  u5    construct count           (1..MAX_SQUAD)    [roster only]
  per construct:
    u12 chassis code
    u4  commander type code       (0 = untagged)
    u4  mount count
    per mount:
      u4  hardpoint index
      u12 mount code
  u16   FNV-1a checksum of all preceding bits
```

- **Key contract:**
  - **Version-first.** `SL1-` and the leading version byte mean a future format can be
    detected and rejected with `VERSION_UNSUPPORTED` rather than misparsed.
  - **Four distinguishable failure kinds** (FR-7, design.md §5.1 renders each):
    `MALFORMED` (bad prefix / bad base64 / bad length / checksum mismatch, with char
    offset), `UNKNOWN_ENTRY` (code not in catalog, with the code), `ILLEGAL` (decodes
    fine, fails `validateRoster` — carries the `Violation[]`), `VERSION_UNSUPPORTED`.
  - **Never repairs.** `decode` returns `ILLEGAL` with the violations attached; it has no
    code path that mutates a roster toward legality.
  - Carries the budget it was built for (FR-7), and carries **no** name, no timestamp, no
    identifier of any kind (FR-7, NFR-8). Roster names are collection-local and are
    *deliberately* not in the string.
  - Round-trip is a property test: `decode(encode(r)) ≡ r` over generated rosters.

### 3.6 `engine/map` — generation and the playability gate

- **Owns:** map geometry and the guarantee it is playable.
- **Exports:** `generateMap(seed, archetype, tunables): MapResult`,
  `GameMap { walls: Segment[], spawns: SpawnRegion[5], bounds, traceSchedule }`,
  `runPlayabilityGate(map, tunables): GateReport`, `measureArchetype(map): ArchetypeMetrics`.
- **Depends on:** `fx`, `rng`, `catalog` (tunables only).
- **Key contract:**
  - Geometry is **continuous** (D-1): walls are integer-endpoint line segments; there is
    no play grid.
  - The gate internally rasterises to a **coarse analysis grid** (½ construct footprint
    per cell) for connectivity flood-fill, pocket sizing, open-area fraction, and
    chokepoint detection. **This grid has no rule authority** — it never touches
    movement, LOS, or damage. It is an analysis instrument, and its resolution is a
    tunable.
  - Generation loop: `generate(seed) → gate → if fail, seed' = stream(seed, "regen:" + n) → retry`,
    up to `MAX_REGEN_ATTEMPTS`, then throw a **defect condition** (FR-11's explicit
    requirement — not an infinite loop, not a silent relaxation).
  - Every rejection is logged with the failing check, so the harness can report a pass
    rate per archetype over a large seed sample (FR-11).
  - `measureArchetype` returns wall density, mean sightline length, and open-area
    fraction, checked against `map.archetypes.json`'s declared ranges — that is FR-10's
    "distinguishable by measurement, not by eye."
  - **Trace overlays terrain and does not delete it (A-3, confirmed).** The trace is a
    shrinking polygon evaluated as a point-in-poly test at the trace step. Terrain is
    immutable for the whole match, so the wall spatial index is built once.

### 3.7 `engine/match` — the round pipeline

- **Owns:** every rule that resolves. This is the heart of the product.
- **Exports:**
  ```ts
  createMatch(config: MatchConfig): MatchState
  resolveRound(state: MatchState, plots: SquadPlots[5]): { state: MatchState, events: Event[] }
  legalMovePlot(state, constructId, path): Result<Path, Violation>
  legalAttackPlot(state, squadPlot): Violation[]
  exchangePreview(state, attackerId, targetId): ExchangeCard   // FR-18, design.md §5.7
  poolFor(state, squadId): { total, terms: PoolTerm[] }        // FR-17 breakdown
  hashState(state): string                                     // FR-29 byte-identity
  ```
- **Depends on:** `fx`, `catalog`, `build`, `map`. **Does not depend on `rng`.**
- **Internal stages, in the exact order of FR-13:**
  `refillPools → (movement plots in) → resolveMovement → (attack plots in) → resolveAttacks → applyDamage → applyTrace → checkElimination`
- **Key contracts:**
  - `MatchState` is a **plain, structurally-cloneable, canonically-serialisable value.**
    No class instances, no `Map` keyed by object, no `Set` of references, no functions.
    This is what lets it cross `postMessage`, be hashed for FR-29, and be diffed in tests.
    Entity collections are **arrays sorted by stable integer id**, never objects with
    string keys whose enumeration order could vary.
  - `resolveRound` is **pure**: same input, same output, always. It performs no I/O,
    reads no clock, and allocates no identity-dependent structure.
  - It emits `Event[]` — the complete, ordered, plain-language record of everything that
    happened (moved, halted-with-reason, fired, posture-revealed, damaged, dial-advanced,
    trace-damaged, destroyed, eliminated). **Playback consumes this event log and nothing
    else** (FR-26: "playback is a presentation of an already-computed result"). The round
    log in design.md §5.8 is a direct render of `Event[]`.

### 3.8 `engine/view` — public projection and resolution loss

- **Owns:** what a given squad knows.
- **Exports:** `publicView(state, squadId): PublicState`, `resolutionRangeOf(construct)`.
- **Depends on:** `match`, `fx`.
- **Key contract:**
  - `PublicState` contains **everything FR-24 declares public** — every chassis, every
    mount, every stat, every exact dial position, commander status, every squad's pool
    size, the full trace schedule, the map — and **structurally excludes** uncommitted
    plots. There is no field to leak through.
  - Resolution loss (FR-25) is **engine state, not a UI effect**: `MatchState` carries
    `knownPositions[squadId][constructId] = { pos, confirmedRound }`, updated at each
    resolution. This must live in the engine because **the AI operates under the same fog
    rules** (FR-25) — if ghosting were a renderer concern, the AI would be cheating.
  - Position confidence only. Stats, dial, and commander status are never elided from
    `PublicState`. The `?` badge and `LAST SEEN R4` stamp in design.md §2.4 read
    `confirmedRound`; the drift ring radius is `movementAllowance × (round − confirmedRound)`,
    computed here, not in the renderer.

### 3.9 `engine/ai` — tiered opponents

- **Owns:** AI roster generation, deployment, and per-round plotting.
- **Exports:** `generateAiRoster(rng, budget, catalog): Roster`,
  `aiDeploy(publicState, squadId, rng)`,
  `aiMovePlot(publicState, squadId, tier, rng, budget: NodeBudget): SquadMovePlot`,
  `aiAttackPlot(publicState, squadId, tier, rng, budget): SquadAttackPlot`.
- **Depends on:** `view` (`PublicState` only), `build`, `map`, `rng`, `fx`.
- **Key contract:** the signature *is* the fairness guarantee. The AI's only view of the
  world is `PublicState` — the same projection the human UI renders from. It cannot be
  passed a `MatchState`; the type forbids it. No tier gets a different input type, a pool
  bonus, or a stat modifier (FR-22).
- **Bounded by nodes, never by time** — see §7.3.

---

## 4. Determinism Strategy

This section is the reason the rest of the architecture looks the way it does.

### 4.1 The number system
All rule-affecting values are integers (§3.1). Damage, integrity, costs, and pool points
are plain small integers. Positions, distances, and movement allowances are `Fx`.
FR-18's rounding (floor, minimum 1 on any landing shot, 0 for normal-into-posture) is a
pure integer expression with no floating intermediate:
`dmg = max(1, (base * mulNum) / mulDen | 0)` with `(mulNum, mulDen) ∈ {(1,1),(3,2),(1,2)}`.

### 4.2 The RNG
One PCG32 implementation, integer-only, with named streams (§3.2). Seed is a
user-visible string (FR-8: displayed and copyable). No other source of variation exists.

### 4.3 Forbidden primitives inside `src/engine/**`
Enforced by `eslint` `no-restricted-globals` / `no-restricted-properties`, failing CI:

| Forbidden | Why |
|---|---|
| `Math.random` | Unseeded. |
| `Date`, `Date.now`, `performance.now` | FR-29 forbids wall-clock influence. |
| `Math.hypot`, `Math.pow`, `Math.sin/cos/tan/atan2/exp/log`, `**` on non-integers | Not correctly-rounded per spec; results differ across JS engines. |
| Float literals in rule paths | Everything is `Fx` or an integer ratio. |
| `Array.prototype.sort` without an explicit total-order comparator | Implementation-defined for equal keys. Comparators must end in a stable-id tiebreak. |
| `Object.keys`/`for...in` over a data map used to drive resolution | Enumeration order is a footgun; iterate sorted arrays. |
| `structuredClone` on anything with a `Map`/`Set` of objects | `MatchState` is plain by contract. |
| `Intl`, `toLocaleString` in engine | Locale-dependent output. |

`Math.sqrt` is the single permitted exception, wrapped in `fx.isqrt` with an exactness
correction loop, and used nowhere else.

### 4.4 Order independence (FR-15)
Two structural techniques:
- **Snapshot-then-apply.** Every resolution stage reads a frozen pre-stage snapshot and
  writes into a fresh state. No stage observes another stage's partial output. Damage is
  accumulated per-target as an integer sum — integer addition is commutative and
  associative, so summation order is provably irrelevant.
- **Fixed-point iteration for coupled effects.** Movement halts (§5.2) are computed as
  the least fixed point of a *symmetric* contact relation, which by definition does not
  depend on the order constructs are examined.

### 4.5 Verification (continuous, not one-off)
`harness/determinism.ts`, in CI on every engine change:
1. **Replay identity.** Re-run N recorded matches from `MatchLog`; assert `hashState` is
   byte-identical at every round boundary.
2. **Permutation invariance.** For each recorded round, re-resolve it under all 120
   squad-evaluation permutations (and randomised construct orderings within squads);
   assert identical output state and identical `Event[]` modulo the log's declared sort.
   This is FR-15's explicit acceptance test, automated.
3. **Cross-runtime identity.** The same suite runs in Node and, in a Playwright job, in
   Chromium / Firefox / WebKit; hashes must match across all four (FR-29's
   platform-independence clause).
4. **Purity fuzz.** Deep-freeze the input `MatchState`; any mutation attempt throws.

---

## 5. Resolution Design Decisions

### 5.1 Canonical state hash
`hashState` serialises `MatchState` through a **canonical serialiser** (keys emitted in
lexicographic order, integers only, no floats, arrays in stable-id order) and hashes with
FNV-1a 64. "Byte-identical" (FR-29) is defined as equality of this hash, and the
serialiser is the definition of record.

### 5.2 Movement: substepping with a halt fixed point — **resolves OQ-7**

```
N = MOVE_SUBSTEPS (rules constant, confirmed at 64)
positions ← current
halted ← ∅
for k in 1..N:
    candidate[c] = arcLengthPoint(path[c], length[c] * k / N)  for c ∉ halted
    candidate[c] = positions[c]                                for c ∈ halted
    repeat:                                            # fixed point, order-independent
        contact = { c : ∃d ≠ c, dist2(candidate[c], candidate[d]) < (r_c + r_d)² }
        new = contact \ halted
        halted ← halted ∪ new
        for c ∈ new: candidate[c] = positions[c]       # revert to last legal substep
    until new = ∅
    positions ← candidate
```

Why this satisfies every clause of FR-15:
- **Simultaneous, no squad first** — all candidates are computed from the same prior state.
- **Proportional traversal** — arc-length is parameterised by `k/N` of *total path
  length*, so a 9.0 path and a 2.0 path both complete over the same round.
- **Both stop (D-2)** — the contact set is symmetric; both members of a contacting pair
  enter `halted` in the same iteration. No priority, no displacement, no pass-through.
- **Cascades handled** — the inner `repeat` propagates: a third construct reaching a
  freshly-halted one halts in a later iteration of the same fixed point.
- **Order independence is structural** — `contact` is a set defined by a symmetric
  predicate over a snapshot; there is no loop order that could change it.
- **Never overlapping walls** — paths are wall-legal at plot time (FR-14), and halting
  only ever moves a construct *backwards* along an already-legal path.

`MOVE_SUBSTEPS` is a **rule constant, not an implementation detail** — it quantises halt
positions and is therefore part of the game's definition. It lives in `tunables.json`,
is documented in the rules drawer, and changing it invalidates recorded replays (the
`MatchLog` records the tunables hash for exactly this reason).

**Cost:** 64 substeps × 50 constructs, pairwise ≈ 78k `dist2` checks/round, ~0.5ms. A
uniform spatial hash is available if construct counts ever rise, but is not needed at 50.

### 5.3 Attack resolution
Snapshot at commit → for every declared shot, evaluate LOS (integer segment intersection
against the wall index) and range against the **post-movement** snapshot → look up the
2×2 matrix → floor, apply minimum-1 → accumulate integer damage per target → apply all
at once → advance dials → destroy → *then* trace → *then* elimination.

FR-18's "a construct destroyed this round still fires this round" falls out for free:
damage is computed from the snapshot, and destruction is applied after all damage is
computed. No special case needed.

`exchangePreview` is **the same function** that resolution uses, called with a hypothetical
posture flag. design.md §5.7's Exchange Card is therefore guaranteed to agree with
resolution — it is not a parallel implementation. Any drift is impossible by construction,
which is the strongest available form of FR-1's "no stat displayed differs from the stat
used in resolution."

### 5.4 Reaction pool
`poolFor` returns the total **and its term breakdown** (`base`, `commanderBase`, `unitTerm`
with the `R` used), because design.md §5.7 renders the breakdown and FR-17 requires it
visible. `R` is looked up from a per-commander-type ladder in `catalog.commanders.json`
indexed by the commander's current dial position — data, not a formula in code (OQ-3 is
then a data edit, not a code change). Commander-dead is a permanent flag on the squad, not
a re-derivation, so the collapse is irreversible by construction (FR-17).

### 5.5 Simultaneous elimination tiebreak — **resolves OQ-5**
When the last two or more squads are eliminated in the same round, placement is ordered by:
1. Total integrity remaining across the squad **at the start of that round** (higher = better placement);
2. then number of constructs alive at the start of that round;
3. then total damage dealt across the match;
4. then squad index (VECTOR=1 … NULLSET=5) — a guaranteed total order.

Deterministic, documented, computable from state the player can already see, and
builder-confirmed as the v1 rule.

---

## 6. Data Flow

### 6.1 Build zone
```
data/*.json ──loadCatalog──▶ Catalog ──▶ build/validate ──▶ Violation[]
                                 │                              │
                                 ▼                              ▼
        composer store ◀── applyCommanderType             legality banner
                │
                ├── codec.encodeRoster ──▶ share string ──▶ clipboard
                └── CollectionRepository ──▶ localStorage
share string ──▶ codec.decode ──▶ Result<Roster, DecodeError> ──▶ import result panel
```

### 6.2 Match round (the hot loop)
```
                     ┌──────────────── main thread ────────────────┐
 MatchState ──▶ view.publicView(state, HUMAN) ──▶ zustand ──▶ React ──▶ Canvas
      │                                                │
      │                                          plotting UI
      │                                                │
      │                                        legalMovePlot / legalAttackPlot
      │                                                │  (engine, sync, <1ms)
      │                                                ▼
      │                                          human SquadPlots
      │                                                │
      ├──▶ view.publicView(state, AI_n) ──postMessage──┼──▶ [ai.worker]
      │                                                │      aiMovePlot / aiAttackPlot
      │      (starts the instant the phase opens,      │      (node-bounded search)
      │       overlapping human thinking time)         │            │
      │                                                ◀────────────┘  4× SquadPlots
      ▼                                                ▼
   resolveRound(state, plots[5]) ──▶ { state', events[] }
                                            │
                                            ├──▶ playback transport ──▶ Canvas animation
                                            └──▶ round log (design.md §5.8)
```

**The critical property:** the AI's plot request is dispatched with `publicView` at the
*start* of the phase — before the human has committed anything. There is no message on the
wire that could contain a human plot. FR-24's private-until-commit half is enforced by the
worker boundary.

**Latency:** AI search overlaps human plotting entirely (there is no timer — C-7 — so the
human takes as long as they take, and the AI has at least that long). If the human commits
before all four AI squads return, the commit button enters a brief `RESOLVING` state. This
is the only place the player can ever wait, and it is bounded by the node budget.

### 6.3 Replay and reproducibility
```
MatchLog = { formatVersion, seed, budget, archetype, tier,
             catalogHash, tunablesHash, rosters[5] (as share strings),
             deployments[5], plots[round][5] }
```
Folding `resolveRound` over `plots` reconstructs the match exactly. `catalogHash` and
`tunablesHash` are recorded so a replay against edited content **fails loudly** rather
than diverging silently. This is the substrate every battery (FR-11, FR-23, FR-31) and
`REMATCH · SAME SEED` (design.md §5.9) run on.

---

## 7. Dependency Flow

```
                          ┌─────────────┐
                          │   data/     │  (JSON, authored)
                          └──────┬──────┘
                                 ▼
   ┌───────────────────── src/engine ──────────────────────┐
   │                                                        │
   │   fx ◀── rng                                           │
   │   ▲       ▲                                            │
   │   │       │                                            │
   │  catalog ─┴──▶ build ──▶ codec                         │
   │   ▲             ▲                                      │
   │   │             │                                      │
   │  map ──────────▶ match ──▶ view ──▶ ai                 │
   │                                                        │
   └───────▲──────────────────▲──────────────────▲──────────┘
           │                  │                  │
     ┌─────┴─────┐      ┌─────┴─────┐      ┌─────┴─────┐
     │ src/app   │      │ workers/  │      │ harness/  │
     │ (React,   │      │ (ai,      │      │ (Node CLI,│
     │  Canvas)  │      │  mapgen)  │      │  batteries│
     └─────┬─────┘      └───────────┘      └───────────┘
           │
     ┌─────▼─────────┐
     │ src/platform  │  (localStorage, clipboard, capability gate)
     └───────────────┘
```

Arrows point toward the dependency. **Every arrow crossing the engine boundary points
inward.** The engine knows nothing about React, the DOM, workers, or Node.

### 7.1 Rendering architecture

Three stacked `<canvas>` elements sharing one camera transform:

| Layer | Redraws when | Contents |
|---|---|---|
| **Terrain** | map changes (once per match, unless OQ-A1 overturns A-3) | wireframe walls, grid, spawn regions |
| **Field** | state changes / each playback frame | trace hatch + next-boundary inset, markers, dial pips, ghosts + drift rings, wreck marks |
| **Overlay** | per pointer event | active path + measuring rule, reach envelope, shot lines, reticle, halt labels |

Glow is a pre-rendered radial-gradient sprite blitted per marker rather than
`ctx.shadowBlur` per draw — `shadowBlur` is the classic Canvas 2D framerate killer and
would not survive 50 markers at 60fps. Hatch and dither are `createPattern` fills built
once at load. Hit-testing is arithmetic against the entity array (footprint circles,
sorted by z), never a per-pixel probe.

Panels, ledgers, tables, and the Exchange Card are HTML — they need text selection,
keyboard focus, and screen-reader semantics (NFR-5). **The board is a picture; everything
else is a document.**

### 7.2 Accessibility architecture (NFR-5 is a hard requirement)
- **Reduced motion is a store-level mode**, not a CSS media query alone. When active,
  playback switches from the animated transport to a **stepped `Event[]` card list** —
  the same event log, rendered as DOM. This is why `Event[]` must be *complete and
  self-describing*: reduced-motion playback has no animation to fall back on, so every
  fact an animation would convey must be a field on an event (design.md §7.10).
- **The board carries a parallel accessible tree.** Every construct on the canvas has a
  corresponding focusable, labelled DOM node in the squad rail / enemy list, so `Tab`
  navigation and screen readers reach 100% of board information without the canvas.
- **The squad-identity trio** (lightness rank, glyph, fill pattern, two-letter tag) is a
  single `SquadIdentity` value object in `app/board` consumed by every renderer — there
  is no code path that draws a squad by hue alone.
- `axe-core` runs against every screen in CI (Playwright); contrast tokens are asserted
  against design.md §1.2's declared ratios by unit test.

### 7.3 AI architecture and the node budget

| Tier | Policy | Node budget |
|---|---|---|
| **1** | Greedy heuristic. Threat-weighted target scoring, trace-aware pathing, fixed posture/called-shot rates from a data-driven table. | ~1e3 |
| **2** | One-ply simultaneous lookahead. Solves the posture/called-shot 2×2 as a mixed strategy over the opponent's observed frequencies; maintains a per-opponent posture-frequency model across rounds. | ~5e4 |
| **3** | Tier 2 + beam search over multi-round movement and pool allocation, with a squad-level threat map and explicit anti-kingmaking damage-distribution term. | ~5e5 |

- **Bounded by nodes visited, never by wall-clock time.** A time bound would make the AI's
  choice machine-dependent and break NFR-2 instantly. The budget is a tunable; if tier 3
  is too slow on target hardware, the budget drops — the *determinism* does not.
- All three tiers share one evaluation function and one legal-move generator (the same
  `legalMovePlot` / `legalAttackPlot` the human UI calls). Tiers differ **only in search
  depth and opponent modelling** (FR-22), which is enforceable because the constraint
  layer is literally shared code.
- **Value-based, not distance-based, target selection** (FR-23): score = f(threat output
  at current dial, wounded state, commander status, exposure, kill-this-round bonus,
  anti-kingmaking penalty proportional to the target squad's current standing). Every
  coefficient is in `tunables.json` so the FR-23 battery tunes without a rebuild.
- **Novel-roster robustness** (FR-23): the evaluator scores *derived stats* (damage per
  round at current dial, effective range, integrity remaining, mobility) rather than
  memorised chassis identities. It has no chassis lookup table, so an unseen arrangement
  of known mounts is not a special case.
- AI randomness draws from `stream(matchRng, "ai." + squadId + ".r" + round)` — varied,
  but fully reproducible in replay.

---

## 8. Performance Budget (NFR-3, NFR-6)

| Operation | Budget | Approach |
|---|---|---|
| Full round resolution, 50 constructs | **< 100 ms** | Measured ~2–5 ms. Movement substepping ~0.5ms; LOS via wall spatial hash ~1ms; the rest is integer arithmetic over arrays. Ample headroom. |
| Map generation + full playability gate | **< 2 s** | Runs in `mapgen.worker`. Flood-fill and chokepoint analysis on the coarse grid, not on segments. Regeneration retries are the tail risk — the gate must pass at a high enough rate that `MAX_REGEN_ATTEMPTS` is never approached; **the harness measures the per-archetype pass rate and it is a tuning gate on archetype parameters.** |
| Interactive plotting | **60 fps** | Overlay layer only redraws on pointer move; terrain layer is static; reach-envelope is computed once per selection, not per frame. |
| AI plot, 4 squads, tier 3 | overlapped with human plotting; worst case ~1–2 s if the human commits instantly | Node-bounded search in workers. Dispatched at phase open. |
| First interactive load | **< 3 s @ 10 Mbit** | Target ≤ 400 KB gzip total: React+Zustand ~55KB, engine ~45KB, UI ~60KB, fonts ~90KB (subset woff2), catalog JSON ~40KB. Screens code-split by route; the match shell and the AI worker load on `NEW MATCH`. |
| Match start from setup | **< 2 s** | Map gen in worker (parallel with AI roster generation), both seeded from the same match seed. |
| Repeat load | instant, offline | Service-worker precache (NFR-7). |

---

## 9. Security & Privacy Posture

| Concern | Approach |
|---|---|
| **Authentication** | None. No accounts (C-2). |
| **Authorization** | None. Single-user, single-device, no shared resources. |
| **Data at rest** | Plain JSON in `localStorage`. Not encrypted — there is no secret, no PII, and no threat model in which a local roster list needs confidentiality. Stated plainly rather than security-theatred. |
| **Data in transit** | Nothing is ever in transit. Static assets over HTTPS at load; **zero runtime requests**. |
| **Network egress** | **CSP: `default-src 'self'; connect-src 'none'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.** `connect-src 'none'` makes NFR-8 a browser-enforced invariant: any future `fetch`/`WebSocket`/beacon fails. Shipped as `<meta http-equiv>` plus host headers where available. |
| **Untrusted input** | Share strings are the only externally-authored data. They are decoded as **binary through a fixed bit-reader** — never `eval`, never `JSON.parse` of attacker-shaped structure, never a dynamic property write. Length and checksum are validated before any allocation sized by the payload (bounded construct/mount counts prevent a decode bomb). |
| **XSS** | Roster names are the only user-authored text. Rendered through React's escaping; `dangerouslySetInnerHTML` is banned by lint repo-wide. |
| **Telemetry** | None. No analytics, no error reporting, no beacons (NFR-8). Errors surface in-product. |
| **Supply chain** | Engine has zero runtime dependencies. App dependencies are pinned with a lockfile; `npm audit` in CI. |

---

## 10. Deployment Architecture

- **Target:** static object hosting. Cloudflare Pages recommended (free, HTTP/2, custom
  headers for CSP); GitHub Pages and Netlify are drop-in equivalents. **No server-side
  component exists to deploy.**
- **Build:** `npm run build` → `tsc --noEmit` (typecheck) → `vite build` → `dist/`.
  Output is fully static: hashed JS/CSS chunks, `woff2` fonts, catalog JSON, service
  worker, `index.html`.
- **Gates (CI, blocking merge):** typecheck · lint (including the engine-purity and
  forbidden-primitive rules) · unit tests · determinism suite (§4.5) · FR-11 playability
  battery · FR-23 behavioural battery · FR-31 costing battery · Playwright smoke +
  `axe-core`. NFR-10 requires the last three run on any catalog or logic change; they are
  path-triggered on `data/**` and `src/engine/**`.
- **Runtime:** one browser tab. Main thread runs UI + canvas; two worker threads run AI
  and map generation. Nothing else runs anywhere.
- **Content updates are deploys.** The catalog is a build artifact, not fetched
  configuration (NFR-7 forbids runtime fetching, and a fetched catalog would break replay
  reproducibility). Balance changes ship as a new static build with a bumped
  `catalogHash`.
- **Versioning:** the share-string format (`SL1-`), the persistence schema, and the
  `MatchLog` format each carry independent version numbers. Persistence has a forward
  migration chain; share strings reject unknown versions rather than guessing.

---

## 11. Requirements Coverage

| Requirement | Architectural home |
|---|---|
| FR-1 Catalog browsing | `engine/catalog` + `app/screens/codex`; single-source stats guaranteed by §5.3 |
| FR-2/3/4 Composition, commander, budget | `engine/build`, one `Violation[]` with rule ids |
| FR-5 Prebuilts | `data/catalog.prebuilts.json`, validated by the same `validateRoster` |
| FR-6 Local collection | `platform/storage` `CollectionRepository`, quota error surfaced |
| FR-7 Share strings | `engine/codec` §3.5, four distinguishable failure kinds |
| FR-8/9 Match config, AI rosters | `MatchConfig` + `engine/ai.generateAiRoster`, seeded streams |
| FR-10/11 Maps + gate | `engine/map` §3.6, coarse analysis grid with no rule authority |
| FR-12 Deployment | `match` stage; same constraint code for human and AI |
| FR-13 Round structure | `resolveRound` stage order §3.7 |
| FR-14/15 Movement | `legalMovePlot` + substepping fixed point §5.2 (**resolves OQ-7**) |
| FR-16/17 Attack plot, pool | `legalAttackPlot`, `poolFor` with term breakdown §5.4 |
| FR-18 Deterministic resolution | §4, §5.3; `exchangePreview` shares resolution's code path |
| FR-19 Dials | `catalog` dial state machines; advance-only, no regression path exists |
| FR-20 Trace | `map.traceSchedule` (public from round 1 by construction) + `applyTrace` |
| FR-21 Elimination & placement | `checkElimination` + tiebreak §5.5 (**resolves OQ-5**) |
| FR-22/23 AI tiers + battery | `engine/ai` §7.3, node-bounded; `harness/behavior.ts` |
| FR-24 Information contract | `PublicState` type + worker boundary §0.3, §3.8 |
| FR-25 Resolution loss | `knownPositions` in engine state — AI is fogged too |
| FR-26 Playback | `Event[]` is the sole playback input §3.7 |
| FR-27 Rules reference | `app/components/RulesDrawer` reading live `poolFor` / trace schedule |
| FR-28 Match summary | Aggregated from `Event[]`; share strings via `codec` |
| FR-29 Determinism harness | §4.5 + `harness/determinism.ts` + `MatchLog` §6.3 |
| FR-30 Data-driven tuning | `data/*.json` + `no-magic-numbers` lint in rule modules |
| FR-31 Costing battery | `harness/costing.ts`, enumerating via `engine/build` |
| NFR-1 Match length | Trace schedule tunables; harness reports round-count distribution |
| NFR-2 Determinism | §4 in full |
| NFR-3 Performance | §8 |
| NFR-4 Platform | `platform/capability.ts` viewport gate (design.md §8) |
| NFR-5 Accessibility | §7.2 |
| NFR-6 Load | §8 bundle budget, route code-splitting |
| NFR-7 Offline | PWA precache, self-hosted fonts, catalog as build artifact |
| NFR-8 Privacy | CSP `connect-src 'none'` §9 |
| NFR-9 Art constraint | Canvas vector primitives only; no raster assets in `dist/` (build-asserted) |
| NFR-10 Testability | Engine purity §2.1 makes every battery a plain Node import |

---

## 12. Resolved Architectural Decisions

All architecture-gate questions were builder-confirmed on 2026-08-28:

- **AD-1 — Trace vs. terrain:** the trace overlays immutable terrain; it never deletes or
  modifies topology. This resolves requirements OQ-1.
- **AD-2 — Resolution range:** chassis declares a base, mounts contribute additive
  modifiers, and effective range is the clamped sum. This resolves requirements OQ-4.
- **AD-3 — Movement precision:** `MOVE_SUBSTEPS` is fixed at **64** for v1. It is a rules
  constant covered by `tunablesHash`; changing it invalidates recorded replays.
- **AD-4 — Simultaneous elimination:** §5.5's total ordering is the v1 rule. This resolves
  requirements OQ-5.
- **AD-5 — Enumeration tractability:** `harness/costing.ts` measures the threshold. It
  begins with a single process and switches to deterministic `node:cluster` workers when
  the legal space exceeds approximately `1e7` rosters.
- **AD-6 — Playback history:** retain the complete `Event[]` log for the match. Summary
  aggregates are derived from that log rather than replacing it.
- **AD-7 — Prebuilt rosters:** prebuilts remain a required catalog-content deliverable.
  They do not block architecture or Forge decomposition, but they do block release.

---

*"The architect's job is not to build the system. It's to make sure the system can be
built — and that someone else knows how."*
