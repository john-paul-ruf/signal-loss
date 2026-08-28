# Forge Configuration — SIGNAL LOSS

> **Status:** authoritative for Forge, Mu, and Jikijitsu
> **Created:** 2026-08-28
> **Program slug:** `signal-loss`
> **Repository root:** `./`
> **Program metadata root:** `./program/signal-loss/`

## Program

| Field | Value |
|---|---|
| Display name | **SIGNAL LOSS** |
| Slug | `signal-loss` |
| Product | Deterministic, simultaneous-turn, five-squad browser skirmish tactics game |
| Delivery scope | Full v1; no feature cuts from `./specs/requirements.md` |
| Runtime topology | One pure engine, two clients (browser and Node harness), zero services |
| Hosting | Static bundle only |
| Supported input | Desktop mouse + keyboard, minimum 1280×720 |

## Stack

| Concern | Decision |
|---|---|
| Language | TypeScript 5.7 with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` |
| Runtime | ES2022 in current desktop browsers and Node 22 |
| UI | React 19 |
| Board | Layered Canvas 2D scene with HTML accessibility mirror |
| Styling | Tailwind CSS v4, CSS-first theme |
| State | Zustand 5 vanilla stores with React bindings |
| Engine dependencies | None at runtime |
| Authored content | Validated JSON under `./data/` |
| Persistence | Versioned `localStorage` root through a `CollectionRepository` port |
| Workers | Web Workers for AI and map generation |
| Package manager | npm with committed `./package-lock.json` |
| Build | Vite 6 |
| Unit / engine tests | Vitest 3 |
| Browser tests | Playwright plus `@axe-core/playwright` |
| Headless harness | Node 22 + `tsx`, CLI under `./harness/` |
| Offline | `vite-plugin-pwa` / Workbox precache |
| Fonts | Self-hosted `@fontsource/chakra-petch` and `@fontsource/ibm-plex-mono` |
| CI | GitHub Actions |

## Architecture

- **Pattern:** pure functional engine with ports/adapters at the browser boundary. The engine is a library; the React app, workers, and Node harness are consumers.
- **Dependency flow:** every cross-boundary dependency points into `./src/engine/`; the engine never imports the app, platform, DOM, Node, React, or an npm package.
- **Dependency injection:** explicit typed function parameters and ports. Do not add a DI container. `Catalog`, `Tunables`, seeded `Rng`, public projections, and repositories are passed in.
- **Rule state:** immutable, plain, structurally cloneable `MatchState`; sorted arrays and stable integer IDs; snapshot-then-apply resolution.
- **UI state:** small Zustand vanilla stores partitioned by navigation, collection/preferences, build/setup, and match concerns. Use selectors to isolate 60fps board work.
- **Persistence state:** one strict, versioned, atomically replaced JSON document at `signal-loss:state`.
- **Information boundary:** AI workers receive `PublicState`, never `MatchState` or uncommitted human plots.
- **Determinism:** integer fixed-point geometry (`FX_ONE = 1024`), PCG32 named streams, canonical serialization, explicit total ordering, no clocks, and no unseeded randomness in rule paths.
- **Rendering:** three Canvas layers (terrain, field, overlay); all panels and accessible equivalents are semantic HTML.
- **Entry points:** `./src/app/main.tsx`, `./src/workers/ai.worker.ts`, `./src/workers/mapgen.worker.ts`, and `./harness/cli.ts`.
- **Engine public surface:** `./src/engine/index.ts`.

### Hard Boundary

`./src/engine/**` may import only from `./src/engine/**`. Nothing there may import the DOM, React, `./src/app/`, `./src/platform/`, or any npm package. Resolution modules do not import the RNG.

## Module Registry

Stable IDs are ordered by dependency depth. IDs are never renumbered, reused, or reassigned.

| ID | Module | Path | Owns | Imports From | Key Files |
|---|---|---|---|---|---|
| M01 | Toolchain and CI | root configs + `./.github/workflows/` | Exact config paths listed by sessions | — | `./package.json`, `./vite.config.ts`, `./eslint.config.js`, `./.github/workflows/ci.yml` |
| M02 | Authored content | `./data/` | `./data/*.json` | — | `./data/catalog.chassis.json`, `./data/tunables.json` |
| M03 | Fixed-point math | `./src/engine/fx/` | `./src/engine/fx/**` | — | `./src/engine/fx/index.ts`, `./src/engine/fx/geometry.ts` |
| M04 | Seeded RNG | `./src/engine/rng/` | `./src/engine/rng/**` | M03 | `./src/engine/rng/index.ts` |
| M05 | Catalog | `./src/engine/catalog/` | `./src/engine/catalog/**` | M03 | `./src/engine/catalog/schema.ts`, `./src/engine/catalog/validate.ts` |
| M06 | Build rules | `./src/engine/build/` | `./src/engine/build/**` | M03, M05 | `./src/engine/build/model.ts`, `./src/engine/build/validate.ts` |
| M07 | Share codec | `./src/engine/codec/` | `./src/engine/codec/**` | M05, M06 | `./src/engine/codec/index.ts`, `./src/engine/codec/bitstream.ts` |
| M08 | Map generation | `./src/engine/map/` | `./src/engine/map/**` | M02, M03, M04, M05 | `./src/engine/map/generate.ts`, `./src/engine/map/gate.ts` |
| M09 | Match resolution | `./src/engine/match/` | `./src/engine/match/**` | M03, M05, M06, M08 | `./src/engine/match/state.ts`, `./src/engine/match/resolve-round.ts` |
| M10 | Public projection | `./src/engine/view/` | `./src/engine/view/**` | M03, M09 | `./src/engine/view/public-state.ts`, `./src/engine/view/resolution-loss.ts` |
| M11 | AI | `./src/engine/ai/` | `./src/engine/ai/**` | M03, M04, M06, M08, M10 | `./src/engine/ai/evaluate.ts`, `./src/engine/ai/policy.ts` |
| M12 | Engine facade | `./src/engine/index.ts` | `./src/engine/index.ts` | M03–M11 | `./src/engine/index.ts` |
| M13 | Persistence schema | `./src/migrations/` | **DB only; never a Mu lease** | — | `./src/migrations/001_initial.ts` |
| M14 | Platform adapters | `./src/platform/` | `./src/platform/**` | M06, M13 | `./src/platform/storage/collection-repository.ts`, `./src/platform/capability.ts` |
| M15 | Worker entries | `./src/workers/` | `./src/workers/**` | M08, M10, M11 | `./src/workers/ai.worker.ts`, `./src/workers/mapgen.worker.ts` |
| M16 | Headless harness | `./harness/` | `./harness/**` | M12 | `./harness/cli.ts`, `./harness/determinism.ts`, `./harness/behavior.ts` |
| M17 | App state and bridge | `./src/app/store/`, `./src/app/bridge/` | Precise subdirectories listed by sessions | M12, M14, M15 | `./src/app/store/core/`, `./src/app/store/match/`, `./src/app/bridge/` |
| M18 | Board renderer | `./src/app/board/` | `./src/app/board/**` | M10, M17 | `./src/app/board/scene.ts`, `./src/app/board/layers/` |
| M19 | UI components | `./src/app/components/` | Precise subdirectories listed by sessions | M12, M17 | `./src/app/components/shared/`, `./src/app/components/build/`, `./src/app/components/match/` |
| M20 | Screens | `./src/app/screens/` | Precise screen subdirectories listed by sessions | M12, M14, M17–M19 | `./src/app/screens/boot/`, `./src/app/screens/build/`, `./src/app/screens/match/` |
| M21 | App bootstrap and styles | exact app-shell files | Exact files listed by Session 01 | M20 through route discovery | `./index.html`, `./src/app/main.tsx`, `./src/app/route-registry.tsx`, `./src/app/styles.css` |
| M22 | Verification tests | `./tests/` | Precise test subdirectories listed by sessions | Modules under test | `./tests/engine/`, `./tests/app/`, `./tests/e2e/`, `./tests/harness/` |

Per-module contracts live in `./program/signal-loss/arch/MNN-*.md`.

## Conventions

### Naming and Layout

- **Files:** kebab-case except React components, which use PascalCase filenames. Worker entry files end in `.worker.ts`.
- **Types:** PascalCase; functions and values camelCase; data IDs kebab-case; stable numeric catalog codes never change or get reused.
- **Tests:** mirror module ownership under `./tests/`; use `*.test.ts`, `*.test.tsx`, and `*.spec.ts` for Playwright.
- **Barrels:** one `index.ts` per engine module. Only `./src/engine/index.ts` is the cross-boundary public facade.
- **Imports:** use explicit module boundaries; no deep app-to-engine internals after M12 exists.

### Error Handling

- Use discriminated `Result` unions for expected failures. Never signal malformed content, illegality, storage failure, or codec failure with `null` or an untyped thrown string.
- Every rules rejection includes its FR identifier and a human-readable message.
- Catalog load is all-or-nothing. Codec import and persistence never silently repair.
- Defect conditions may throw typed errors after preserving the last committed state.

### Deterministic Logic

- Rule-affecting positions and distances are branded integer fixed-point values.
- Ban `Math.random`, clock reads, locale formatting, unordered resolution iteration, and implementation-defined floating operations inside `./src/engine/**`.
- Every sort used by rules has an explicit total comparator ending with a stable-ID tiebreak.
- No magic rule numbers in match, map, or AI logic; read `Tunables` or catalog data.
- Preserve plain-data state across worker and replay boundaries; no class instances, object-identity maps, or functions in `MatchState`, `PublicState`, plots, events, or logs.

### UI and Accessibility

- Implement the exact tokens and interaction hierarchy from `./specs/design.md`; treat `./mocks/*.html` as visual source, not authoritative catalog content.
- All numeric truth uses IBM Plex Mono; labels use Chakra Petch.
- Never convey squad, posture, damage, trace, or legality by color alone.
- Canvas information has a focusable semantic DOM equivalent.
- Reduced-motion playback uses complete stepped event cards, not merely disabled CSS animation.
- Never use `dangerouslySetInnerHTML`; render user names through React escaping.
- No raster sprites or animation frames. SVG icons, CSS, Canvas vectors, glow, hatch, and motion only.

### Logging and Documentation

- Engine functions perform no logging. Return typed reports and complete `Event[]` values.
- Worker and harness diagnostics are structured and deterministic; `--json` is machine-readable.
- Browser errors are presented in-product. No telemetry, analytics, beacons, remote error reporting, or runtime network calls.
- Public APIs and non-obvious invariants receive concise TSDoc. Do not add commentary that restates the code.

## Verification Commands

Run from the repository root unless a session narrows the target.

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:determinism
npm run test:playability
npm run test:behavior
npm run test:costing
npm run test:e2e
npm run build
```

Additional gates:

- **Cross-runtime determinism:** Node, Chromium, Firefox, and WebKit hashes match.
- **Performance:** 50-construct full round under 100 ms; map generation plus gate under 2 s; plotting at 60 fps; first load under 3 s at 10 Mbit.
- **Accessibility:** axe checks per screen, token contrast tests, keyboard-only build flow, reduced-motion parity, and five-squad palette simulation.
- **Offline/privacy:** service-worker repeat load succeeds offline and CSP includes `connect-src 'none'`.
- **Art:** production output contains no raster gameplay assets.

## Git Configuration

| Field | Value |
|---|---|
| Branch | `main` |
| Remote | `origin` |
| Checkpoint policy | Mu commits every declared checkpoint itself |
| Commit scope | `git add -- <session Owns pathspecs only>` |
| Commit style | `feat(SNN): <checkpoint outcome>` or `test(SNN): <checkpoint outcome>` |
| Forbidden in Mu commits | `./program/signal-loss/prompts/**`, `./program/signal-loss/arch/**`, `./src/migrations/**`, and any path outside the active lease |
| Recovery | Inspect `git log --oneline -- <lease paths>`; never use `git reset --hard` |

## Session Defaults

- **Checkpoint range:** 2–6; each checkpoint must typecheck and pass its mechanically relevant tests.
- **Ports:** Jikijitsu assigns a distinct port in the Orchestration Envelope. Solo default is `5173`.
- **Write discipline:** read each target before modifying; write only `Owns`; treat `Reads` as immutable.
- **Test ownership:** place tests under the session-specific subpath declared in `Owns` so concurrent sessions never share a test directory.
- **Browser artifacts:** use a session-specific directory under `/tmp`, never a shared workspace output path.
- **Completion:** no TODOs, orphaned modules, fake success data, disabled acceptance tests, or silent fallbacks.

## Custom Rules

1. `./src/migrations/001_initial.ts` and every future file under `./src/migrations/` are permanently DB-owned. Schema changes go back to DB as new forward migrations.
2. `./specs/**` and `./mocks/**` are Genesis sources and read-only during Mu sessions.
3. Intent is the only hidden information. Do not expose any uncommitted human plot to AI or UI projections.
4. Resolution uses no RNG. AI and procedural generation may use only named seeded streams.
5. Trace overlays immutable terrain; movement uses 64 fixed substeps and an order-independent halt fixed point.
6. Simultaneous-elimination order is: start-of-round integrity, start-of-round living count, total match damage, then stable squad index.
7. Resolution range is chassis base plus mount modifiers, clamped as catalog data defines.
8. Content in `./mocks/**` is illustrative. Session 06 owns the release catalog and must validate/tune it with the shipping batteries.
9. The application makes no runtime network request. Static assets, fonts, catalog data, and service worker are bundled.
10. Do not modify source code, install packages, or execute sessions while acting as Forge; Forge produces only the plan artifacts under `./program/signal-loss/`.

## Genesis Sources

| Role | Source | Authority |
|---|---|---|
| Idea | `./specs/idea.md` | Product intent, audience, non-goals |
| Requirements | `./specs/requirements.md` | Full v1 acceptance contract |
| Design | `./specs/design.md` + `./mocks/*.html` | Enso Stroke 1 visual and interaction source |
| Architecture | `./specs/architecture.md` | Stack, module boundaries, deterministic design, resolved architectural decisions |
| Data | `./specs/database.md` | Persistence contract for every session touching storage |
| Permanent schema | `./src/migrations/001_initial.ts` | DB-owned v1 persistence types and validator; read-only to Mu |

## Detected Conflicts and Constraints

- The repository is implementation-empty except for the DB-owned migration; all application, engine, content, harness, tests, and tooling files are new.
- The mocks use CDN Tailwind and Google Fonts only as prototypes. Production must replace both with built/self-hosted assets.
- Mock catalog values are explicitly unauthored. Release JSON is created and tuned in Session 06 rather than copied as a balance claim.
- Full v1 is larger than a typical feature. Session boundaries follow file ownership, with the build-zone and match UI split only because their combined visual working set exceeds one context window.
