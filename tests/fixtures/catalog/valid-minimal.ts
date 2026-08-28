/**
 * A minimal but internally consistent RawCatalogBundle used to exercise
 * loadCatalog's success path and to serve as a base for negative fixtures
 * that mutate one field at a time.
 *
 * DELIBERATE PLACEHOLDER: these values are chosen to satisfy the schema, NOT
 * to be balanced. Session 06 owns the release catalog under `./data/`. The
 * values here are illustrative only — treat them as arithmetic scaffolding
 * (design.md §9b).
 */

import type { RawCatalogBundle } from "../../../src/engine/catalog/schema";

// FX_ONE = 1024. Board units below are in fx (fx = board_unit * 1024).
const U = (units: number): number => units * 1024;

const hardpointTypes = [
  { id: "primary", code: 1, name: "Primary" },
  { id: "auxiliary", code: 2, name: "Auxiliary" },
  { id: "defensive", code: 3, name: "Defensive" },
  { id: "utility", code: 4, name: "Utility" },
];

// Chassis: three, covering degrade / spike / inversion curve families.
const chassisDegrade = {
  id: "hardline",
  code: 10,
  name: "HARDLINE",
  cost: 12,
  footprint: U(1),
  hardpoints: [
    { typeId: "primary" },
    { typeId: "primary" },
    { typeId: "defensive" },
  ],
  baseRange: U(10),
  rangeClamp: { min: U(2), max: U(18) },
  resolutionRange: U(12),
  curveFamily: "degrade",
  dial: [
    { index: 0, movementAllowance: U(6), damage: 5, rangeModifier: 0, defenseModifier: 1 },
    { index: 1, movementAllowance: U(5), damage: 4, rangeModifier: 0, defenseModifier: 1 },
    { index: 2, movementAllowance: U(4), damage: 3, rangeModifier: 0, defenseModifier: 0 },
    { index: 3, movementAllowance: U(3), damage: 2, rangeModifier: 0, defenseModifier: 0 },
  ],
};

const chassisSpike = {
  id: "surge",
  code: 11,
  name: "SURGE",
  cost: 14,
  footprint: U(1),
  hardpoints: [
    { typeId: "primary" },
    { typeId: "utility" },
  ],
  baseRange: U(8),
  rangeClamp: { min: U(2), max: U(14) },
  resolutionRange: U(10),
  curveFamily: "spike",
  dial: [
    { index: 0, movementAllowance: U(5), damage: 3, rangeModifier: 0, defenseModifier: 0 },
    { index: 1, movementAllowance: U(6), damage: 5, rangeModifier: 0, defenseModifier: 0 },
    { index: 2, movementAllowance: U(7), damage: 7, rangeModifier: 0, defenseModifier: 0 },
  ],
};

const chassisInversion = {
  id: "cascade",
  code: 12,
  name: "CASCADE",
  cost: 16,
  footprint: U(1),
  hardpoints: [
    { typeId: "primary" },
    { typeId: "auxiliary" },
  ],
  baseRange: U(9),
  rangeClamp: { min: U(2), max: U(16) },
  resolutionRange: U(11),
  curveFamily: "inversion",
  dial: [
    { index: 0, movementAllowance: U(6), damage: 3, rangeModifier: 0, defenseModifier: 0 },
    { index: 1, movementAllowance: U(5), damage: 5, rangeModifier: 0, defenseModifier: 0 },
    { index: 2, movementAllowance: U(3), damage: 7, rangeModifier: 0, defenseModifier: 0 },
  ],
};

const mounts = [
  { id: "ice-wall", code: 20, name: "ICE WALL", cost: 4, family: "ice", requiredHardpointType: "defensive", damageDelta: 0, rangeDelta: 0 },
  { id: "daemon-lash", code: 21, name: "DAEMON LASH", cost: 6, family: "daemon", requiredHardpointType: "primary", damageDelta: 3, rangeDelta: U(1) },
  { id: "spike-driver", code: 22, name: "SPIKE DRIVER", cost: 5, family: "spike", requiredHardpointType: "primary", damageDelta: 4, rangeDelta: 0 },
  { id: "spoofer-mesh", code: 23, name: "SPOOFER MESH", cost: 3, family: "spoofer", requiredHardpointType: "utility", damageDelta: 0, rangeDelta: 0 },
  { id: "wipe-charge", code: 24, name: "WIPE CHARGE", cost: 7, family: "wipe", requiredHardpointType: "auxiliary", damageDelta: 6, rangeDelta: -U(2) },
];

const commanders = [
  {
    id: "cipher",
    code: 1,
    name: "CIPHER",
    cost: 5,
    commanderBase: 1,
    rLadder: [3, 4, 6, 8],
    modifications: { extraDialStates: 0, movementDelta: 0, damageDelta: 0, rangeDelta: U(1), defenseDelta: 1 },
  },
  {
    id: "sysop",
    code: 2,
    name: "SYSOP",
    cost: 6,
    commanderBase: 1,
    rLadder: [3, 5, 7, 8],
    modifications: { extraDialStates: 1, movementDelta: 0, damageDelta: 0, rangeDelta: 0, defenseDelta: 2 },
  },
  {
    id: "bulwark",
    code: 3,
    name: "BULWARK",
    cost: 8,
    commanderBase: 1,
    rLadder: [3, 3, 5, 8],
    modifications: { extraDialStates: 2, movementDelta: -U(1), damageDelta: 0, rangeDelta: 0, defenseDelta: 3 },
  },
  {
    id: "overclock",
    code: 4,
    name: "OVERCLOCK",
    cost: 10,
    commanderBase: 2,
    rLadder: [3, 5, 6, 7, 8],
    modifications: { extraDialStates: 0, movementDelta: U(1), damageDelta: 1, rangeDelta: 0, defenseDelta: -1 },
  },
];

const prebuilts = [
  {
    id: "starter-25",
    name: "STARTER 25",
    budget: 25,
    constructs: [
      {
        chassisCode: 10,
        commanderCode: 1,
        mounts: [
          { hardpointIndex: 0, mountCode: 22 },
        ],
      },
    ],
  },
];

const tunables = {
  MAX_SQUAD: 10,
  TRACE_BASE: 2,
  TRACE_STEP: 2,
  TRACE_FIRST_ROUND: 4,
  TRACE_INTERVAL: 2,
  MAX_EXPECTED_ROUNDS: 24,
  MIN_POCKET: 1_048_576,
  MAX_OPEN_AREA: 0.15,
  MIN_QUADRANT_COVER: 0.5,
  MIN_SPAWN_SEP: U(800),
  MIN_SPAWN_COVER: 3,
  SPAWN_COVER_RADIUS: U(6),
  MAX_SPAWN_SIGHTLINES: 1,
  CHOKE_WIDTH: U(2),
  CHOKE_FRACTION: 0.25,
  MAX_REGEN_ATTEMPTS: 20,
  EXPLOIT_CEILING: 0.6,
  NOVEL_ROSTER_TOLERANCE: 0.1,
  TRACE_DEATH_CEILING: 0.5,
  DOMINANCE_CEILING: 0.65,
  SNOWBALL_ROUND: 8,
  MOVE_SUBSTEPS: 64,
  BOARD_SIZE: U(2000),
  RANGE_MIN: U(2),
  RANGE_MAX: U(30),
};

const mapArchetypes = [
  { id: "dense-grid", code: 1, name: "DENSE GRID", wallDensity: { min: 0.2, max: 0.4 }, meanSightlineLength: { min: U(4), max: U(10) }, openAreaFraction: { min: 0.1, max: 0.3 }, parameters: { spacing: 3 } },
  { id: "long-avenues", code: 2, name: "LONG AVENUES", wallDensity: { min: 0.1, max: 0.25 }, meanSightlineLength: { min: U(12), max: U(24) }, openAreaFraction: { min: 0.3, max: 0.55 }, parameters: { avenueWidth: 4 } },
  { id: "open-scatter", code: 3, name: "OPEN SCATTER", wallDensity: { min: 0.05, max: 0.15 }, meanSightlineLength: { min: U(10), max: U(20) }, openAreaFraction: { min: 0.5, max: 0.8 }, parameters: { scatter: 1 } },
  { id: "maze", code: 4, name: "MAZE", wallDensity: { min: 0.3, max: 0.5 }, meanSightlineLength: { min: U(3), max: U(8) }, openAreaFraction: { min: 0.1, max: 0.25 }, parameters: { branchFactor: 2 } },
  { id: "arena", code: 5, name: "ARENA", wallDensity: { min: 0.1, max: 0.25 }, meanSightlineLength: { min: U(6), max: U(16) }, openAreaFraction: { min: 0.4, max: 0.7 }, parameters: { rimWalls: 1 } },
  { id: "asymmetric-ruins", code: 6, name: "ASYMMETRIC RUINS", wallDensity: { min: 0.15, max: 0.35 }, meanSightlineLength: { min: U(5), max: U(12) }, openAreaFraction: { min: 0.25, max: 0.55 }, parameters: { skew: 2 } },
  { id: "hazard-field", code: 7, name: "HAZARD FIELD", wallDensity: { min: 0.1, max: 0.25 }, meanSightlineLength: { min: U(6), max: U(14) }, openAreaFraction: { min: 0.3, max: 0.6 }, parameters: { hazards: 5 } },
];

/**
 * A base bundle that loads without errors. Tests clone-and-mutate it to
 * produce invalid variants.
 */
export const validMinimalBundle: RawCatalogBundle = {
  hardpointTypes,
  chassis: [chassisDegrade, chassisSpike, chassisInversion],
  mounts,
  commanders,
  prebuilts,
  tunables,
  mapArchetypes,
};

/**
 * A deep clone of the bundle — every mutation-based test starts here so
 * fixtures never leak across tests.
 */
export function cloneValidBundle(): RawCatalogBundle {
  return JSON.parse(JSON.stringify(validMinimalBundle)) as RawCatalogBundle;
}
