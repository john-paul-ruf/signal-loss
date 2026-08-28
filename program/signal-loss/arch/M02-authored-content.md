# M02 — Authored content

> **Path:** `./data/`
> **Imports from:** —
> **Status:** planned for full v1

## Public API
- Validated chassis, mount, commander, prebuilt, tunable, and map-archetype records
- Stable numeric wire codes and deterministic catalog hashes
- Release tuning values consumed identically by browser, workers, and harness

## Internal Structure

| Area | Path |
|---|---|
| Catalogs | `./data/catalog.chassis.json, ./data/catalog.mounts.json, ./data/catalog.commanders.json` |
| Prebuilts | `./data/catalog.prebuilts.json` |
| Rules | `./data/tunables.json` |
| Maps | `./data/map.archetypes.json` |

## Conventions and Invariants
- Never reuse or renumber a published numeric code.
- All requirement tunables are data; no shadow constants in logic.
- Mock values are illustrative only; battery results determine release values.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-06 -->

## SESSION-06 arch delta — release content, headless batteries, and CI

### M02 (data/) — release catalog shipped

Files authored under `./data/`:

- `catalog.chassis.json` — 4 hardpoint types (primary/auxiliary/defensive/utility) + 7 chassis covering all three curve families (degrade: HARDLINE/BASTION/JUGGERNAUT; spike: SURGE/PHANTOM; inversion: CASCADE/MIRAGE). Every chassis has stable numeric codes (10..16) and rangeClamp bounds; every resolutionRange is validated to lie inside its own clamp.
- `catalog.mounts.json` — 11 mounts across all 5 families (ice: ice-wall/ice-barrier; daemon: daemon-lash/daemon-swarm; spike: spike-driver/spike-maul; spoofer: spoofer-mesh/spoofer-echo; wipe: wipe-charge/wipe-purge/wipe-strobe). Stable codes 20..30.
- `catalog.commanders.json` — 4 commander types: CIPHER (movement, base 1), SYSOP (defense, base 1), BULWARK (integrity, base 1, extraDialStates=2), OVERCLOCK (fragile high-pool, base 2). Stable codes 1..4.
- `catalog.prebuilts.json` — 8 legal prebuilts, one per budget (25/50/75/100/125/150/175/200). Every chassis, every mount family, every commander type appears somewhere across the set; every prebuilt validates through `validateCatalogPrebuilts`.
- `tunables.json` — all 25 requirement tunables. Board size 64×64 (`BOARD_SIZE = 65_536` fx); `MOVE_SUBSTEPS = 64`; `MAX_REGEN_ATTEMPTS = 100` (at validator ceiling); other values chosen to be permissive initial ranges pending later tuning.
- `map.archetypes.json` — 7 declared archetypes; ranges intentionally wide so gate rejections are captured by the FR-11 checks, not by ARCHETYPE_RANGE bounds.

Coverage invariants tested at load time by `./tests/harness/content.test.ts` (17 tests, all pass): every curve family present, every mount family present, every commander doctrine present, every required archetype id present, `MOVE_SUBSTEPS === 64`, `RANGE_MIN ≤ RANGE_MAX`, resolutionRange inside clamp for every chassis.

