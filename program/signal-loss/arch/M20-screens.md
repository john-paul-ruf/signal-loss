# M20 — Screens

> **Path:** `./src/app/screens/`
> **Imports from:** M12, M14, M17–M19
> **Status:** boot / codex / collection shipped in SESSION-07 checkpoints 1–2; match modes shipped in SESSION-08. Composer (`#/composer`), setup (`#/setup`), and standalone result (`#/result`) remain pending a fresh SESSION-07 retry.

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

- `#/composer` — keyboard-complete construct composer (design.md §5.2 locked map: Tab regions, arrows in lists, Enter mount/select, Backspace unmount, C commander, / search). Reuses `DialStatGrid` for the commander before / after delta overlay and `applyCommanderType` from the engine. Linked from boot and the collection nav.
- `#/setup` — needs the typed mapgen worker client at `./src/app/bridge/mapgen-client.ts` (worker entry `./src/workers/mapgen.worker.ts`, protocol `./src/workers/protocol.ts`) and must write `MatchLaunchConfig` (extended with `aiRosters`) to the core flow store on DEPLOY.
- `#/result` — standalone hydration + actions; must subscribe to (or replace) the match store's `signal-loss:match-result` DOM `CustomEvent` handoff. Roster hydration keyed by `rosterId` when the result screen mounts (the current `ResultMode` emits an empty `constructs` array under the roster shape).

## Internal Structure

| Area | Path |
|---|---|
| Entry / build | `./src/app/screens/boot/`, `./src/app/screens/build/`, `./src/app/screens/codex/` |
| Setup / result | `./src/app/screens/setup/`, `./src/app/screens/result/` — pending SESSION-07 retry |
| Composer | `./src/app/screens/composer/` — pending SESSION-07 retry |
| Match | `./src/app/screens/match/` |

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
