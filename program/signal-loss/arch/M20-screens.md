# M20 — Screens

> **Path:** `./src/app/screens/`
> **Imports from:** M12, M14, M17–M19
> **Status:** planned for full v1

## Public API
- Route modules for boot, build collection/composer, codex, setup, result, and match modes
- Screen-level flow orchestration using engine/store/component APIs

## Internal Structure

| Area | Path |
|---|---|
| Entry/build | `./src/app/screens/boot/, ./src/app/screens/build/, ./src/app/screens/codex/` |
| Setup/result | `./src/app/screens/setup/, ./src/app/screens/result/` |
| Match | `./src/app/screens/match/` |

## Conventions and Invariants
- Each route self-registers through route discovery; do not edit the bootstrap registry.
- Screens 05–08 and rules share one persistent match shell.
- Under 1280×720 show the desktop requirement instead of degrading the layout.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-07 -->

### SESSION-07 arch delta — build-zone surfaces (checkpoints 1–2 of 5 landed)

Session 07 is partially delivered: checkpoints 1 (boot + codex) and 2 (collection
#### M20 (screens) — self-registering routes

- `screens/boot/` → route `#/` (id `boot`): real catalog counts/hashes, storage
  probe, app version; below 1280×720 the desktop statement replaces the entry
  navigation (NFR-4) instead of reflowing.
- `screens/codex/` → route `#/codex` (id `codex`): sortable chassis/mount tables
  with `aria-sort` + keyboard sort + stable-ID tiebreak (`sort.ts`), expandable
  dial disclosure, curve charts, commander table, permanent FR-1 contract line.
- `screens/build/` → route `#/build` (id `build-collection`): three-region
  collection (pinned read-only prebuilts with DUPLICATE-TO-EDIT fork, saved
  rosters, detail with budget meter / legality banner / share block / persistent
  import panel), armed delete, storage banners (unavailable/quota/stale/version/
  corrupt with armed reset + raw copy).

#### Cross-session notes for Session 08 integration

- The composer route is expected at `#/composer` (linked from boot & collection
  nav) — pending checkpoint 3. Setup `#/setup` and result `#/result` pending 4–5.
- Shared `sl-*` components (`Banner`, `Button`, …) from `components/shared` ship
  **without a stylesheet** — they are structurally/aria correct but visually
  unstyled. Build-zone screens use `Banner` for its live-region semantics and
  supply their own Tailwind layout. A shared `components/shared` CSS is a
  Session-02-lease follow-up both UI halves need for full visual parity.
