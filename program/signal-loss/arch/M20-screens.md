# M20 — Screens

> **Path:** `./src/app/screens/`
> **Imports from:** M12, M14, M17–M19
> **Status:** boot / codex / collection shipped and verified in SESSION-07 checkpoints 1–2; match modes shipped and verified in SESSION-08. A SESSION-07 retry (`ed7b664`) landed unverified composer files at checkpoint 3's location, but the worker returned no parseable handoff, so checkpoint 3 is **not** complete — see Pending routes. The `#/setup` route is now owned by the `match-setup-route` cycle: its route module (`match-setup-route` SESSION-04) was not launched and its launch-contract dependency (`match-setup-route` SESSION-03) was blocked, so `#/setup` remains unstarted even though its M17 dependencies now exist. Standalone result (`#/result`) remains unstarted, pending a further SESSION-07 retry.

## Public API

Every screen self-registers through `M21`'s route discovery by exporting a `route` constant from `./src/app/screens/**/route.tsx`.

### Boot / codex / collection — SESSION-07 checkpoints 1–2

- `screens/boot/` → route `#/` (id `boot`): real catalog counts / hashes, storage probe, app version. Below 1280×720 the desktop statement replaces the entry navigation (NFR-4) instead of reflowing.
- `screens/codex/` → route `#/codex` (id `codex`): sortable chassis / mount tables with `aria-sort` + keyboard sort + stable-ID tiebreak (`sort.ts`), expandable dial disclosure, curve charts, commander table, permanent FR-1 contract line.
- `screens/build/` → route `#/build` (id `build-collection`): three-region collection (pinned read-only prebuilts with DUPLICATE-TO-EDIT fork, saved rosters, detail with budget meter / legality banner / share block / persistent import panel), armed delete, storage banners (unavailable / quota / stale / version / corrupt with armed reset + raw copy).

### Match modes — SESSION-08

- `screens/match/route.tsx` — id `"match"`, path `"#/match"`.
- `MatchScreen` creates a `MatchStore` instance per mount, provides context, and switches modes.
- `DeploymentMode` — board + spawn-region click placement, HUD progress + reason.
- `MovementMode` — board + waypoint clicks / HOLD (H) / Backspace / Esc / 1-9 select; engine `legalMovePlot` is authority.
- `AttackMode` — board + `AttackLedger` with inline `ExchangeCard`s; pointer picks nearest enemy as target.
- `PlaybackMode` — full-motion or reduced-motion cards (arrow keys); event-only.
- `ResultMode` — derives `MatchResultPayload` and dispatches `signal-loss:match-result` event for the flow store.

### Pending routes

- `#/composer` — keyboard-complete construct composer (design.md §5.2 locked map: Tab regions, arrows in lists, Enter mount/select, Backspace unmount, C commander, / search). Reuses `DialStatGrid` for the commander before / after delta overlay and `applyCommanderType` from the engine. Linked from boot and the collection nav. **Residual, unverified:** a SESSION-07 retry landed `Composer.tsx` / `ComposerView.tsx` / `route.tsx` at `./src/app/screens/build/composer/` (commit `ed7b664`), plus a `CollectionView` "edit" button wired to `requestComposerEdit` + `navigate("#/composer")`, but the worker that produced them returned no parseable handoff — no checkpoint declared, no typecheck/lint/test result reported for this retry. Treat this code as an unverified starting point for the next retry, not a shipped checkpoint.
- `#/setup` — its M17 dependencies now exist: the typed mapgen worker client (`./src/app/bridge/mapgen-client.ts`, over worker entry `./src/workers/mapgen.worker.ts` / protocol `./src/workers/protocol.ts`) and the headless preparation service (`./src/app/store/build/setup-model.ts`) shipped in `match-setup-route` SESSION-02. The route module itself is unstarted — owned by `match-setup-route` SESSION-04, which was not launched this cycle. On DEPLOY it must write an extended `MatchLaunchConfig` (with `aiRosters`) to the core flow store, but that launch-field extension is owned by `match-setup-route` SESSION-03, which was blocked at 0 checkpoints, so SESSION-04's target contract does not yet exist.
- `#/result` — standalone hydration + actions; must subscribe to (or replace) the match store's `signal-loss:match-result` DOM `CustomEvent` handoff. Roster hydration keyed by `rosterId` when the result screen mounts (the current `ResultMode` emits an empty `constructs` array under the roster shape). Fully unstarted.

## Internal Structure

| Area | Path | Status |
|---|---|---|
| Entry / build | `./src/app/screens/boot/`, `./src/app/screens/build/`, `./src/app/screens/codex/` | shipped, verified |
| Composer | `./src/app/screens/build/composer/` (`Composer.tsx`, `ComposerView.tsx`, `route.tsx`) | residual, unverified — pending SESSION-07 retry |
| Setup / result | `./src/app/screens/setup/`, `./src/app/screens/result/` | unstarted — `#/setup` owned by `match-setup-route` SESSION-04 (not launched; blocked behind SESSION-03); `#/result` pending SESSION-07 retry |
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
| 2026-08-28 | `match-setup-route` cycle: no screen shipped under M20. The `#/setup` route's dependencies (mapgen client + preparation service) landed in M17 via `match-setup-route` SESSION-02; the launch-contract extension (SESSION-03) was blocked at 0 checkpoints and the routed setup screen (SESSION-04) was not launched, so `#/setup` remains unstarted. |
