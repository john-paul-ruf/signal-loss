# M20 — Screens

> **Path:** `./src/app/screens/`
> **Imports from:** M12, M14, M17–M19
> **Status:** boot / codex / collection shipped and verified in SESSION-07 checkpoints 1–2; match modes shipped and verified in SESSION-08. A SESSION-07 retry (`ed7b664`) landed unverified composer files at checkpoint 3's location, but the worker returned no parseable handoff, so checkpoint 3 is **not** complete — see Pending routes. `match-setup-route` SESSION-03 extended match consumption and SESSION-04 shipped and verified the self-registering `#/setup` route. Standalone result (`#/result`) remains unstarted, pending a further SESSION-07 retry.

## Public API

Every screen self-registers through `M21`'s route discovery by exporting a `route` constant from `./src/app/screens/**/route.tsx`.

### Boot / codex / collection — SESSION-07 checkpoints 1–2

- `screens/boot/` → route `#/` (id `boot`): real catalog counts / hashes, storage probe, app version. Below 1280×720 the desktop statement replaces the entry navigation (NFR-4) instead of reflowing.
- `screens/codex/` → route `#/codex` (id `codex`): sortable chassis / mount tables with `aria-sort` + keyboard sort + stable-ID tiebreak (`sort.ts`), expandable dial disclosure, curve charts, commander table, permanent FR-1 contract line.
- `screens/build/` → route `#/build` (id `build-collection`): three-region collection (pinned read-only prebuilts with DUPLICATE-TO-EDIT fork, saved rosters, detail with budget meter / legality banner / share block / persistent import panel), armed delete, storage banners (unavailable / quota / stale / version / corrupt with armed reset + raw copy).

### Match modes — SESSION-08

- `screens/match/route.tsx` — id `"match"`, path `"#/match"`.
- `MatchScreen` creates a `MatchStore` instance per mount, consumes the shared flow-store launch payload once after resolving the catalog, and switches modes. An absent or rejected payload renders a `#/setup` recovery link rather than a playable fallback. `fix-match-start` SESSION-01 mounts a match-lifetime `AiDeploymentController` inside the provider: on the `DEPLOYMENT` phase it spins one `createAiClient({ poolSize: 4, factory: browserAiWorker })` and one `startAiDeployment` run keyed on engine revision + mode, disposing the client on phase change / unmount (StrictMode-safe).
- `DeploymentMode` — board + spawn-region click placement (selected-construct or next-unplaced target), reposition/unplace editing, live rejection reasons (`OUT OF SPAWN REGION` / `SPOT OCCUPIED BY ANOTHER CONSTRUCT`), HUD progress, and a render-only `DeploymentBoardState` handoff to `BoardCanvas` (`fix-deployment-placement` SESSION-01 made the existing interaction discoverable and complete without an engine, map-generation, or match-state change). `fix-match-start` SESSION-02 routed live placement legality through the new `./src/app/screens/match/deployment-placement.ts` adapter (`classifyDeploymentPlacement` → engine `legalDeployment()`, ignoring only `PARTIAL_DEPLOYMENT` during incremental staging), so a near-but-not-equal footprint overlap is now rejected before `BEGIN MATCH`, not only an exact duplicate.
- `MovementMode` — board + waypoint clicks / HOLD (H) / Backspace / Esc / 1-9 select; engine `legalMovePlot` is authority.
- `AttackMode` — board + `AttackLedger` with inline `ExchangeCard`s; pointer picks nearest enemy as target.
- `PlaybackMode` — full-motion or reduced-motion cards (arrow keys); event-only.
- `ResultMode` — derives `MatchResultPayload` and dispatches `signal-loss:match-result` event for the flow store.

### Setup route — `match-setup-route` SESSION-04

- `screens/setup/route.tsx` self-registers id `"match-setup"` at `#/setup`; `MatchSetup` mounts the collection binding, owns its setup worker clients, and disposes them on unmount.
- The screen requires a legal saved/prebuilt human roster and concrete visible seed before generation. It renders the accepted map and four generated AI rosters, then writes `CompleteMatchLaunchConfig` to the shared FlowStore before navigating to `#/match`.
- Direct `#/setup` regression passed in Chromium, Firefox, and WebKit; no route-registry edit was required.

### Pending routes

- `#/composer` — keyboard-complete construct composer (design.md §5.2 locked map: Tab regions, arrows in lists, Enter mount/select, Backspace unmount, C commander, / search). Reuses `DialStatGrid` for the commander before / after delta overlay and `applyCommanderType` from the engine. Linked from boot and the collection nav. **Residual, unverified:** a SESSION-07 retry landed `Composer.tsx` / `ComposerView.tsx` / `route.tsx` at `./src/app/screens/build/composer/` (commit `ed7b664`), plus a `CollectionView` "edit" button wired to `requestComposerEdit` + `navigate("#/composer")`, but the worker that produced them returned no parseable handoff — no checkpoint declared, no typecheck/lint/test result reported for this retry. Treat this code as an unverified starting point for the next retry, not a shipped checkpoint.
- `#/result` — standalone hydration + actions; must subscribe to (or replace) the match store's `signal-loss:match-result` DOM `CustomEvent` handoff. Roster hydration keyed by `rosterId` when the result screen mounts (the current `ResultMode` emits an empty `constructs` array under the roster shape). Fully unstarted.

## Internal Structure

| Area | Path | Status |
|---|---|---|
| Entry / build | `./src/app/screens/boot/`, `./src/app/screens/build/`, `./src/app/screens/codex/` | shipped, verified |
| Composer | `./src/app/screens/build/composer/` (`Composer.tsx`, `ComposerView.tsx`, `route.tsx`) | residual, unverified — pending SESSION-07 retry |
| Setup | `./src/app/screens/setup/` | shipped and verified by `match-setup-route` SESSION-04 |
| Result | `./src/app/screens/result/` | unstarted — pending SESSION-07 retry |
| Match | `./src/app/screens/match/` | shipped, verified |

## Conventions and Invariants

- Each route self-registers through route discovery; do not edit the bootstrap registry (see M21).
- Screens 05–08 and rules share one persistent match shell (see M19 `MatchShell`).
- Under 1280×720 show the desktop requirement instead of degrading the layout.
- **Playback is event-only.** No screen reads a wall clock during playback; every beat is a discrete engine `Event` (see M17, M18 conventions).
- **Rules drawer (FR-27)** opens with `?` or `F1` from every match mode; closes with `Escape`. Focus restores to the opener on close.
- **Result handoff** is a DOM `CustomEvent` dispatched from `ResultMode`; the core flow store subscribes. Session 07's standalone result screen can either subscribe or replace it with a direct store injection.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |
| 2026-08-28 | SESSION-07 checkpoints 1–2 shipped boot (`#/`), codex (`#/codex`), and collection (`#/build`). Composer / setup / standalone result remain pending checkpoints 3–5. |
| 2026-08-28 | SESSION-08 shipped `./src/app/screens/match/**` — the five match modes and the `MatchScreen` provider — with `signal-loss:match-result` DOM `CustomEvent` handoff to the core flow store. |
| 2026-08-28 | SESSION-07 retry 1 (targeting checkpoint 3) returned no parseable handoff; Jikijitsu committed the in-lease residual `ed7b664`, which includes `./src/app/screens/build/composer/**`. Recorded here as unverified residual, not a completed checkpoint. Setup / standalone result are still fully unstarted. |
| 2026-08-28 | `match-setup-route` SESSION-03 retry updated `MatchScreen` to consume the complete transient launch once and expose a missing-launch recovery path. SESSION-04 then shipped `./src/app/screens/setup/**`: the self-registering `#/setup` route, deterministic preparation/review flow, and deployment handoff to `#/match`; direct-route regression passed across all three Playwright browsers. |
| 2026-08-28 | `fix-deployment-placement` SESSION-01 repaired `DeploymentMode`'s human deployment interaction at the board/screen boundary: derived human-spawn affordance, selected-or-next-unplaced placement, reposition/unplace, live rejection reasons, and a render-only `DeploymentBoardState` view-model passed to `BoardCanvas`. No engine, map-generation, or match-state change; the full `MOVEMENT_PLOT` transition still awaits out-of-lease in-match AI deployment orchestration (M15/M17). |
| 2026-08-29 | `fix-match-start` SESSION-01 mounted a match-lifetime `AiDeploymentController` in `MatchScreen`: on `DEPLOYMENT` it runs one per-squad `startAiDeployment` over a `browserAiWorker` client keyed on engine revision + mode, disposed on phase change / unmount. This supplies the in-match AI deployment orchestration the row above noted was still out-of-lease, completing the real `DEPLOYMENT → MOVEMENT_PLOT` transition. |
| 2026-08-29 | `fix-match-start` SESSION-02 routed `DeploymentMode` live placement legality through the new `./src/app/screens/match/deployment-placement.ts` (`classifyDeploymentPlacement` → engine `legalDeployment()`, ignoring only `PARTIAL_DEPLOYMENT`), so near-but-not-equal footprint overlaps are rejected before `BEGIN MATCH` instead of only exact duplicates. |

<!-- SESSION-01 -->
## M20 — Screens delta

- `MatchScreen` owns one match-lifetime AI controller for deployment, movement, and attack. Every `MOVEMENT_PLOT` and `ATTACK_PLOT` committed phase identity starts four worker decisions; phase change/unmount cancels and disposes the prior family before the next setup, while AI slot writes do not restart a run.
