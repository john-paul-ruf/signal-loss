# PROGRAM-CONFIG — SIGNAL LOSS

> Authoritative program configuration. Derived from the approved Author artifacts at
> `program/signal-loss/specs/` (idea → requirements → design → architecture → database;
> all five phases confirmed per `pipeline-state.json`) and reconciled against the
> committed tree at plan HEAD (branch `main`, HEAD `3cb9579`).
> Created by Planner on the demiurge migration re-bootstrap (previous config was removed
> in commit `a8ca0bd`). Regenerate statements of *fact* from sources; do not re-derive
> stack or module decisions that contradict this file without an explicit user override.

## 1. Program Info

| Field | Value |
|---|---|
| Program name | SIGNAL LOSS |
| Slug | `signal-loss` |
| Root | `/program/signal-loss/` (prompts, STATE.md, MASTER.md, arch/) |
| One-sentence intent | A deterministic simultaneous-turn browser tactics game: compose constructs from chassis/mounts, plot moves and shots blind against four AI rivals under a scarce reaction pool, inside a closing system trace. |
| Product class | Static single-page browser game. No backend, no accounts, no runtime network. |
| Repo status | **Partially built.** Author run complete; a prior build run landed the engine, app shell, workers, platform, harness, and test suites. Verify current state in STATE.md before planning new sessions. |
| Bootstrap config | `program/signal-loss/demiurge.yaml` (models, context window 256k, concurrency cap 3) |

## 2. Stack

| Layer | Technology | Version (resolved) |
|---|---|---|
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | 5.7.3 |
| Runtime | ES2022; browser + Node (engines: `>=22`; local machine runs v24.20.0 — CI pins 22) | Node v24.20.0 (local), 22 (CI) |
| UI framework | React 19 | 19.1.1 |
| State | Zustand 5 (vanilla stores + React bindings) | 5.0.8 |
| Board rendering | Canvas 2D, layered (terrain/field/overlay), hand-rolled scene | — |
| Styling | Tailwind CSS v4 (`@theme` CSS-first tokens) + component CSS files | 4.1.14 |
| Build | Vite 6 + `vite-plugin-pwa` (Workbox precache) | 6.4.3 / 0.21.2 |
| Package manager | npm (lockfile present; npm ci in CI) | 11.19.0 |
| Unit/integration tests | Vitest 3, node environment, `tests/**/*.test.{ts,tsx}` | 3.2.7 |
| E2E / a11y | Playwright (`chromium`/`firefox`/`webkit`), `@axe-core/playwright` | 1.55.1 / 4.10.2 |
| Lint | ESLint 9 flat config (`eslint.config.js`), incl. engine-purity zones | 9.36.0 |
| Harness | Node CLI via `tsx` (`harness/cli.ts`, batteries under `tests/harness/`) | tsx 4.20.4 |
| Fonts | `@fontsource` self-hosted woff2 (Chakra Petch, IBM Plex Mono) | 5.2.6 |
| Engine dependencies | **none** — zero runtime deps inside `src/engine/**` | — |

## 3. Architecture

- **Pattern:** one pure engine, two clients, zero services. `src/engine` is a
  dependency-free, DOM-free library; the React app (`src/app`), the Web Workers
  (`src/workers`), and the Node harness (`harness/` + `tests/harness/`) are three
  clients of it. `src/platform` isolates browser capabilities behind ports.
- **Dependency flow (arrows point toward the dependency):**
  `data/*.json → engine → {app, workers, harness}`; `app → platform`; `app/bridge → workers/protocol`.
  Every arrow crossing the engine boundary points inward. The engine never imports app,
  platform, workers, React, the DOM, or any npm package.
- **Engine purity rule (the one hard rule, CI-enforced):** `src/engine/**` may import
  only `src/engine/**` (see Custom Rules R1).
- **Determinism:** all rule-affecting arithmetic is integer fixed-point (`FX_ONE = 1024`);
  seeded PCG32 with named streams; forbidden-primitive list (§4.3 of architecture.md)
  enforced by lint, not review; `MatchState` is plain, canonically-serialisable data;
  `hashState` (FNV-1a over canonical serialisation) defines byte-identity.
- **Information contract:** AI workers receive only `PublicState` (`engine/view`);
  uncommitted human plots never cross `postMessage`. Resolution loss lives in engine
  state (`knownPositions`), not the renderer.
- **State management:** Zustand slices under `src/app/store` (`core`: navigation/flow/
  preferences/collection/result-summary; `build`: composer/collection/setup;
  `match`: match store, plot drafts, AI phase orchestration).
- **DI:** no framework DI. Ports + factories (`createCollectionRepository`,
  `resolveBrowserStorage`, worker clients in `src/app/bridge`).
- **Persistence:** `localStorage` key `signal-loss:state`, schema v1, forward migration
  chain in `src/migrations/` (DB-owned; consumed through `src/platform/storage/migration-runtime.ts`
  via Vite eager glob — app TS sees the module only through `migration-shim.d.ts`).
- **Entry points:** `index.html` → `src/app/main.tsx` (React mount, route registry);
  workers `src/workers/ai.worker.ts`, `src/workers/mapgen.worker.ts`; harness `harness/cli.ts`
  (`npm run harness -- <battery>`).
- **Deployment:** static `dist/` from `npm run build` to any static host; CSP
  `connect-src 'none'` injected at build; no runtime network ever.

## 4. Module Registry

Stable IDs. M03–M12 are the engine's internal registry (carved on the facade,
`src/engine/index.ts` — do not renumber). Edges marked `[R]` realized (derived from
committed imports at plan HEAD); `[D]` declared (planned, not yet in the tree).

| ID | Module | Path | Owns | Imports From | Key Files |
|----|--------|------|------|--------------|-----------|
| M01 | Authored content | `data/` | authored catalog JSON, tunables, map archetypes, AI weights | — (consumed via M05 loader) | `catalog.chassis.json`, `catalog.mounts.json`, `catalog.commanders.json`, `catalog.prebuilts.json`, `tunables.json`, `map.archetypes.json`, `ai.weights.json` |
| M02 | Static shell | `index.html`, `public/`, `vite.config.ts`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.*.json`, `eslint.config.js` | entry HTML, PWA manifest, CSP injection, build/test/lint configuration | — | `index.html`, `public/icon.svg`, `vite.config.ts` |
| M03 | Fixed-point math | `src/engine/fx/` | the number system (Fx, FX_ONE=1024, vectors, isqrt, geometry predicates) | — | `fx/scalar.ts`, `fx/vector.ts`, `fx/geometry.ts` |
| M04 | Seeded RNG | `src/engine/rng/` | PCG32, named streams, fnv1a64 | M03 [D] | `rng/pcg32.ts`, `rng/streams.ts` |
| M05 | Catalog | `src/engine/catalog/` | schema, validator, loader, canonical hash, code tables | M03 [R] | `catalog/load.ts`, `catalog/validate.ts`, `catalog/schema.ts`, `catalog/canonical.ts` |
| M06 | Build rules | `src/engine/build/` | construct/roster model, costing, legality (`Violation[]` with rule ids), enumeration | M03 [R], M05 [R] | `build/model.ts`, `build/cost.ts`, `build/validate.ts`, `build/enumerate.ts` |
| M07 | Share codec | `src/engine/codec/` | SL1- share-string encode/decode, bitstream, four decode failure kinds | M05 [R], M06 [R] | `codec/bitstream.ts`, `codec/encode.ts`, `codec/decode.ts` |
| M08 | Map generation | `src/engine/map/` | 7 archetype generators, playability gate, measure, trace schedule, wall spatial index | M03 [R], M04 [R], M05 [R] | `map/generate.ts`, `map/gate.ts`, `map/measure.ts`, `map/trace.ts`, `map/spatial-index.ts`, `map/generators/*.ts` |
| M09 | Match resolution | `src/engine/match/` | match state, round pipeline (refill→movement→attacks→damage→trace→elimination), pool, replay/MatchLog, canonical hash | M03 [R], M05 [R], M06 [R], M08 [R], M07 [R] | `match/state.ts`, `match/resolve-round.ts`, `match/movement.ts`, `match/attack.ts`, `match/pool.ts`, `match/end-round.ts`, `match/replay.ts`, `match/canonical.ts` |
| M10 | Public projection | `src/engine/view/` | `PublicState`, resolution loss / known positions | M03 [R], M05 [R], M08 [R], M09 [R] | `view/public-state.ts`, `view/resolution-loss.ts` |
| M11 | AI | `src/engine/ai/` | roster generation, deployment, tiered plotting (node-bounded), opponent model | M03 [R], M04 [R], M05 [R], M06 [R], M08 [R], M09 [R], M10 [R] | `ai/policy.ts`, `ai/search.ts`, `ai/evaluate.ts`, `ai/candidates.ts`, `ai/deploy.ts`, `ai/roster.ts`, `ai/model.ts` |
| M12 | Engine facade | `src/engine/index.ts`, `src/engine/index.ts` siblings | the entire public engine import surface (consumers import here, not deep paths) | M03–M11 [R] | `src/engine/index.ts` |
| M13 | Platform | `src/platform/` | storage (`CollectionRepository`, migration runtime, errors), clipboard, capability probe (viewport, reduced motion) | M-via-shim: `src/migrations` types [R] | `platform/storage/collection-repository.ts`, `platform/storage/migration-runtime.ts`, `platform/clipboard/index.ts`, `platform/capability.ts` |
| M14 | DB migrations | `src/migrations/` | persistence schema + forward migration chain (**Author/DB-owned; never edited by build sessions**) | — | `migrations/001_initial.ts` |
| M15 | Workers | `src/workers/` | worker entry points + typed request/response protocol (FR-24 information boundary) | M08 [R], M05 [R], M09 [R], M10 [R], M11 [R] | `workers/protocol.ts`, `workers/ai.worker.ts`, `workers/mapgen.worker.ts` |
| M16 | Bridge clients | `src/app/bridge/` | main-thread worker clients | M15 [R] | `bridge/ai-client.ts`, `bridge/mapgen-client.ts` |
| M17 | Board renderer | `src/app/board/` | canvas scene graph, layers, camera, hit-test, input, playback projection/transport, accessible tree | M12 [R] | `board/BoardCanvas.tsx`, `board/scene.ts`, `board/layers/*.ts`, `board/input/*.ts`, `board/playback/*.ts`, `board/camera.ts`, `board/hit-test.ts` |
| M18 | Screens | `src/app/screens/` | the 11 routed screens (boot, build/collection, composer, codex, match setup, deploy/move/attack/playback/result modes, match shell, result) | M12 [R] | `screens/boot/Boot.tsx`, `screens/build/**`, `screens/codex/Codex.tsx`, `screens/setup/MatchSetup.tsx`, `screens/match/*.tsx`, `screens/result/ResultScreen.tsx`, `route-registry.tsx` |
| M19 | App components | `src/app/components/` | shared UI kit, build components, match panels, setup components, result summary | M12 [R] | `components/shared/*`, `components/build/*`, `components/match/*`, `components/setup/*`, `components/result/*` |
| M20 | App stores | `src/app/store/` | zustand slices (core flow/navigation/prefs/collection/result-summary; build composer/collection/setup; match store/plot-draft/ai-phase/ai-deployment/ai-config) | M12 [R], M15 [R] (`store/build/setup-model.ts` imports `workers/protocol`), M13 [R] (collection store) | `store/core/*`, `store/build/*`, `store/match/*` |
| M21 | App entry | `src/app/main.tsx`, `src/app/styles.css`, `src/vite-env.d.ts` | mount, global styles | M02 [R], M18 [R] | `app/main.tsx`, `app/styles.css` |
| M22 | Harness | `harness/`, `tests/harness/` | Node CLI + FR-11 playability / FR-23 behavior / FR-31 costing / FR-29 determinism batteries, report formats, seeds | M-support: `tests/harness/support` [R] → M12 [R] | `harness/cli.ts`, `tests/harness/support/*.ts`, `tests/harness/*.test.ts` |
| M23 | Engine tests | `tests/engine/`, `tests/fixtures/` | engine unit tests + fixtures (determinism, purity, codec round-trip, per-module) | M12 [R] | `tests/engine/**`, `tests/fixtures/**` |
| M24 | App tests | `tests/app/`, `tests/workers/`, `tests/setup/` | app/worker/platform/setup unit tests | M12 [R], M13 [R], M15 [R] | `tests/app/**`, `tests/workers/protocol.test.ts`, `tests/setup/eslint-boundary.test.ts` |
| M25 | E2E | `tests/e2e/` | Playwright specs (build, setup, match loop, playback, production boot) | M02+M18 [R] (serves `dist/` via preview) | `tests/e2e/**`, `tests/e2e/match/support/real-match.ts` |
| M26 | CI | `.github/workflows/ci.yml` | all gates (typecheck, lint, unit, 4 batteries, cross-browser, build checks, release baseline) | — | `ci.yml` |

## 5. Conventions

- **Naming:** modules and key exports carry `M-NN` doc comments mirroring this registry.
  Files `kebab-case.ts`, React components `PascalCase.tsx`. Catalog entries carry stable
  numeric `code`s (never renumbered — codec wire identity) plus string ids.
- **Error handling:** engine returns discriminated results, never throws for expected
  failure (`Result<T, E>` shapes: `CatalogError[]`, `Violation[]` with `rule` id, four
  `DecodeError` kinds, `RepositoryError`, `MatchLogError`). Defect conditions throw
  (`MaxRegenExceededError`). User-visible rejections always name the rule/kind.
- **Logging:** none in the engine (purity). Harness reports JSON + human output;
  errors surface in-product; no telemetry (NFR-8).
- **Docs:** module headers cite architecture.md sections; verification baselines live in
  `docs/verification/*.md` with exact reproduction commands.
- **Tests:** engine tests in `tests/engine/<module>/`, app in `tests/app/<area>/`,
  harness self-tests in `tests/harness/`, E2E in `tests/e2e/`. Purity test:
  `tests/engine/match/purity.test.ts`; boundary lint self-test:
  `tests/setup/eslint-boundary.test.ts`.

## 6. Verification Commands

| Purpose | Command |
|---|---|
| Install | `npm ci` |
| Typecheck | `npm run typecheck` |
| Lint (incl. purity zones) | `npm run lint` |
| Unit (everything except e2e) | `npm run test:unit` |
| Determinism battery | `npm run test:determinism` · `npm run harness -- determinism --seed release --seeds 8 --json` |
| Playability battery | `npm run test:playability` · `npm run harness -- playability --seed release --seeds 12 --json` |
| Behavior battery | `npm run test:behavior` · `npm run harness -- behavior --seed release --seeds 4 --json` |
| Costing battery | `npm run test:costing` · `npm run harness -- costing --seed release --seeds 4 --json` |
| Aggregated baseline | `npm run harness -- all --seed release --seeds 4 --json` |
| Production build | `npm run build` (typecheck ×2 + vite build → `dist/`) |
| E2E (serves `dist/` preview) | `npm run test:e2e` (honours `PORT`, `E2E_ARTIFACT_ROOT`) |
| Dev server | `npm run dev` (127.0.0.1:5173, non-strict) |

## 7. Git

| Field | Value |
|---|---|
| Default branch | `main` |
| Commit style | `<type>(<scope>): <subject>` — scope is session id or feature slug; checkpoints described in subject/body (existing history precedent). |
| Checkpoint rule | Coder commits its own lease with an explicit `git add -- <pathspec>` at every checkpoint; tree must build/typecheck/lint at every checkpoint. |
| Never | `git reset --hard`; commits touching other sessions' leases; commits of `STATE.md`/`MASTER.md`/`arch/` by Coder. |

## 8. Session Defaults

- Checkpoints per session: **2–6**, each independently committable.
- Every session reads `PROGRAM-CONFIG.md` + `STATE.md` + its prompt before touching code.
- Interim stubs must fail closed and be explicitly unready; no fabricated successes.
- Sessions touching the data layer read `specs/database.md` + `src/migrations/` but never
  write them (DB re-entry only).

## 9. Custom Rules

- **R1 — Engine purity:** `src/engine/**` imports only `src/engine/**`. No React, DOM,
  `src/app`, `src/platform`, `src/workers`, or npm packages. Enforced by
  `no-restricted-paths` zones + `tests/setup/eslint-boundary.test.ts`; CI-blocking.
- **R2 — No runtime network:** no `fetch`/`WebSocket`/beacon anywhere in shipped code;
  CSP `connect-src 'none'` at build; no external URL in `dist/` (build gate).
- **R3 — No raster gameplay assets** in `dist/` (NFR-9; build-asserted in CI).
- **R4 — No magic rule numbers** in `src/engine/match`, `src/engine/map`, `src/engine/ai`:
  every rule-affecting constant comes from `Tunables` (`data/tunables.json`); literals
  0/1 excepted.
- **R5 — MatchState is plain data:** no class instances, no `Map`/`Set` of objects, no
  functions; entity collections are arrays sorted by stable integer id.
- **R6 — Resolution draws no randomness:** `engine/match` movement/attack/trace code
  never imports `engine/rng`; AI randomness only via named streams
  (`stream(root, "ai." + squad + ".r" + round)`).
- **R7 — AI is node-bounded, never time-bounded**; search budget is a tunable.
- **R8 — No `dangerouslySetInnerHTML`;** user-authored text (roster names) only, always
  React-escaped.
- **R9 — Every rejection names its rule** (FR-2/FR-7/FR-30 family): `Violation.rule`,
  `DecodeError.kind`, `CatalogError.kind`.
- **R10 — Author artifacts are read-only** to every build session: `specs/**`,
  `mocks/**`, `src/migrations/**`. Changes route back to Spec/Designer/DB (Author re-entry).
- **R11 — Consumers import the engine via the facade** (`src/engine` / `src/engine/index`).
  Adding a facade export is an intentional API change; deep app-to-engine internal paths
  are not allowed.
- **R12 — Determinism gates on change:** any edit to `src/engine/**` or `data/**`
  requires the determinism battery locally; CI runs all four batteries regardless.

## 10. Verification Baseline Pointers

Current, evidence-backed baselines are recorded per run in STATE.md (Verification
Baseline section). Known inherited results as of plan HEAD:

- All four batteries pass (see `docs/verification/{determinism,playability,behavior,costing}-baseline.md`... note: determinism summary lives in `docs/verification/release-baseline.md`; playability/behavior/costing have their own files).
- **Known hazard (open):** dense-grid archetype acceptance ~95% (p95 regen ~50 attempts)
  vs `MIN_POCKET` validator ceiling — planned fix in map generators or gate; blocks only
  tightening `minAcceptanceRate` to 1.0, not release.
- **Known informational gaps (open):** behavior battery CALLED_SHOT_RATE / POSTURE_RATE /
  TRACE_DISCIPLINE / SNOWBALL_RATE are information-only at current sample sizes; TIER_ORDERING
  needs `--seeds 24` to be production-tight; DOMINANCE_CEILING hard-fails only at ≥10
  completed matches. The `releaseAiWeights.beamWidth` weight is not yet consumed by any tier.
- **Worktree anomaly at plan HEAD:** `public/mocks/**`, `public/specs/**`,
  `program/__bootstrap__/demiurge.yaml`, `program/mocks/**`, `program/specs/**` are staged
  deletions of files still present in HEAD (duplicate/legacy copies made redundant by
  `program/signal-loss/`); `program/signal-loss/img-source/*.png` and `program/signal-loss/demiurge.yaml`
  are untracked. Do not silently commit these; surface to the user first.

## 11. Author Sources

| Source | Path | Consumers |
|---|---|---|
| Idea / Requirements / Architecture | `program/signal-loss/specs/idea.md`, `requirements.md`, `architecture.md` | All sessions (read-only) |
| Design (UI-Coder Rule 1 source) | `program/signal-loss/specs/design.md` + `program/signal-loss/mocks/*.html` (00-boot … 10-rules, index) | UI sessions |
| Data (schema source) | `program/signal-loss/specs/database.md` + `src/migrations/*` | Any session touching the data layer |

> `program/mocks/**` and `program/specs/**` are legacy duplicates of the
> `program/signal-loss/` copies and are staged for deletion in the worktree; treat
> `program/signal-loss/` as the single source of truth.

## 12. Module Detail Files

Under the 10-module threshold for per-module `arch/` generation **by engine module
count** (13 engine modules ≥ 10): generate `arch/M{NN}-<module>.md` detail files lazily —
when a session needs a module's public API/structure beyond the facade doc comments,
Planner/Orchestrator may add the file at that point; none are required at plan time.