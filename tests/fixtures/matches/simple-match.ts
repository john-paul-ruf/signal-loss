/**
 * A minimal deterministic match fixture used across engine/match and
 * engine/view tests. Composes the shipped catalog fixture, the simple
 * hand-authored map, and five legal single-construct rosters.
 *
 * DELIBERATE PLACEHOLDER: values chosen to exercise rule paths, NOT to be
 * balanced content. Session 06 owns the release catalog.
 */

import type { Catalog } from "../../../src/engine/catalog/index";
import { loadCatalog } from "../../../src/engine/catalog/index";
import type { Roster } from "../../../src/engine/build/index";
import type { MatchConfig, MatchState, Placement } from "../../../src/engine/match/index";
import {
  applyDeployments,
  createMatch,
  squadId,
} from "../../../src/engine/match/index";
import { validMinimalBundle } from "../catalog/valid-minimal";
import { buildSimpleMap } from "../maps/simple";

/** Load the minimal shipped test catalog. Throws if the fixture regresses. */
export function testCatalog(): Catalog {
  const result = loadCatalog(validMinimalBundle);
  if (!result.ok) {
    throw new Error(
      `test catalog fixture failed to load: ${JSON.stringify(result.error.slice(0, 3))}`,
    );
  }
  return result.value;
}

/**
 * A single-construct roster using the HARDLINE chassis (code 10) with
 * commander CIPHER (code 1) and a spike-driver on hardpoint 0. Costs
 * 12 (chassis) + 5 (commander) + 5 (mount) = 22 → fits every budget.
 */
export function soloRoster(): Roster {
  return {
    constructs: [
      {
        chassisCode: 10 as never,
        commanderCode: 1 as never,
        mounts: [{ hardpointIndex: 0, mountCode: 22 as never }],
      },
    ],
  };
}

/**
 * A two-construct roster: the commander + a bare hardline. Costs
 * 12 + 5 + 12 = 29 → fits budgets ≥ 50.
 */
export function pairRoster(): Roster {
  return {
    constructs: [
      {
        chassisCode: 10 as never,
        commanderCode: 1 as never,
        mounts: [],
      },
      {
        chassisCode: 10 as never,
        commanderCode: null,
        mounts: [],
      },
    ],
  };
}

/**
 * A five-solo-squad config at the smallest legal budget the fixture
 * supports. Every squad has one solo. Suitable for FR-13 / FR-15 tests.
 */
export function soloMatchConfig(): MatchConfig {
  const catalog = testCatalog();
  return {
    seed: "match-solo",
    budget: 25 as never,
    aiTier: 1,
    catalog,
    map: buildSimpleMap("match-solo"),
    rosters: [
      soloRoster(),
      soloRoster(),
      soloRoster(),
      soloRoster(),
      soloRoster(),
    ],
  };
}

/**
 * A five-pair-squad config for tests that need multiple constructs per
 * squad. Budget = 50; every squad has one commander + one bare hardline.
 */
export function pairMatchConfig(): MatchConfig {
  const catalog = testCatalog();
  return {
    seed: "match-pair",
    budget: 50 as never,
    aiTier: 1,
    catalog,
    map: buildSimpleMap("match-pair"),
    rosters: [
      pairRoster(),
      pairRoster(),
      pairRoster(),
      pairRoster(),
      pairRoster(),
    ],
  };
}

/**
 * Deploy each squad's single construct to the geometric center of its
 * spawn region. Returns the (necessarily legal) placements tuple. Only
 * valid for `soloMatchConfig` — each squad has exactly one construct.
 */
export function soloCenterPlacements(state: MatchState): readonly [
  readonly Placement[],
  readonly Placement[],
  readonly Placement[],
  readonly Placement[],
  readonly Placement[],
] {
  const result: Placement[][] = [];
  for (let sq = 0; sq < 5; sq = sq + 1) {
    const region = state.map.spawns[sq];
    if (region === undefined) {
      result.push([]);
      continue;
    }
    result.push([{ rosterIndex: 0, position: region.anchor }]);
  }
  return result as unknown as readonly [
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
    readonly Placement[],
  ];
}

/**
 * Build a solo match, deploy every squad to spawn anchors, and return
 * the resulting MOVEMENT_PLOT round-1 state. Fails loudly on any
 * violation — meant for tests that assume valid setup.
 */
export function makeDeployedSoloMatch(): MatchState {
  const config = soloMatchConfig();
  const created = createMatch(config);
  if (!created.ok) {
    throw new Error(`createMatch failed: ${JSON.stringify(created.error.slice(0, 3))}`);
  }
  const deployed = applyDeployments(
    created.value,
    soloCenterPlacements(created.value),
    config.catalog,
  );
  if (!deployed.ok) {
    throw new Error(`applyDeployments failed: ${JSON.stringify(deployed.error.slice(0, 3))}`);
  }
  return deployed.value;
}

/** Suppress unused-symbol lint until the pair helper is wired up. */
export const _reserved = { squadId };
