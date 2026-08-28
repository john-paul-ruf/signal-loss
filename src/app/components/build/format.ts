/**
 * Display formatting for build-zone surfaces. All rule-affecting values are
 * integer fixed-point in the engine (FX_ONE = 1024). These helpers convert to
 * human-readable strings for rendering only — the app layer, not the engine,
 * so float division here is fine and never re-enters a rule path.
 *
 * design.md §1.5: every number is mono; every value shown equals the value
 * used in resolution (FR-1), so these helpers never round differently from
 * the engine — they only present.
 */

import {
  FX_ONE,
  fxAdd,
  fxClamp,
  type Chassis,
  type DialState,
} from "../../../engine/index";

/** Fixed-point board units → a decimal string (default one place). */
export function fxUnits(value: number, decimals = 1): string {
  return (value / FX_ONE).toFixed(decimals);
}

/** A signed integer modifier as a display string (`+2`, `0`, `−1`). */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/**
 * The effective attack range at a dial state: chassis base range plus the
 * dial's range modifier, clamped to the chassis' declared bounds — the same
 * composition resolution uses for a mount-free construct (FR-1).
 */
export function dialStateRange(chassis: Chassis, state: DialState): number {
  return fxClamp(
    fxAdd(chassis.baseRange, state.rangeModifier),
    chassis.rangeClamp.min,
    chassis.rangeClamp.max,
  );
}

/**
 * Movement allowance at the chassis' opening dial state (the "healthy" move
 * shown on a chassis card / codex row). Every chassis validates to a non-empty
 * dial; the fallback keeps the accessor total without a non-null assertion.
 */
export function baseMovement(chassis: Chassis): number {
  const first = chassis.dial[0];
  return first === undefined ? 0 : first.movementAllowance;
}
