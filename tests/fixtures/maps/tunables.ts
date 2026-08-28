/**
 * Small test-scale Tunables. BOARD_SIZE is set to 40 board units so
 * generators produce a manageable number of walls per attempt (the
 * production BOARD_SIZE is much larger; Session 06 owns the release
 * value). All fields present and range-satisfying so the resulting
 * value can be passed to `loadCatalog` variants for validation tests.
 */

import type { Tunables } from "../../../src/engine/catalog/index";
import { fxFromInt } from "../../../src/engine/fx/index";

export const testTunables: Tunables = {
  MAX_SQUAD: 10,
  TRACE_BASE: 2,
  TRACE_STEP: 2,
  TRACE_FIRST_ROUND: 4,
  TRACE_INTERVAL: 2,
  MAX_EXPECTED_ROUNDS: 24,
  MIN_POCKET: 1024 * 1024,
  MAX_OPEN_AREA: 0.6,
  MIN_QUADRANT_COVER: 0.3,
  MIN_SPAWN_SEP: fxFromInt(16),
  MIN_SPAWN_COVER: 1,
  SPAWN_COVER_RADIUS: fxFromInt(6),
  MAX_SPAWN_SIGHTLINES: 4,
  CHOKE_WIDTH: fxFromInt(2),
  CHOKE_FRACTION: 0.5,
  MAX_REGEN_ATTEMPTS: 20,
  EXPLOIT_CEILING: 0.6,
  NOVEL_ROSTER_TOLERANCE: 0.1,
  TRACE_DEATH_CEILING: 0.5,
  DOMINANCE_CEILING: 0.65,
  SNOWBALL_ROUND: 8,
  MOVE_SUBSTEPS: 64,
  BOARD_SIZE: fxFromInt(40),
  RANGE_MIN: fxFromInt(2),
  RANGE_MAX: fxFromInt(30),
};
