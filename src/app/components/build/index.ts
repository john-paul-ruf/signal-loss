/**
 * Build-zone component facade. Boot, codex, collection, and composer screens
 * import their shared display primitives from here (dial pips, dial grid,
 * curve chart, hardpoint badges) plus the display-formatting helpers.
 */

export { CommanderDeltaGrid, type CommanderDeltaGridProps } from "./CommanderDeltaGrid";
export { CurveChart, type CurveChartProps } from "./CurveChart";
export { DialPips, type DialPipsProps } from "./DialPips";
export { DialStatGrid, type DialStatGridProps } from "./DialStatGrid";
export { HardpointBadges, type HardpointBadgesProps } from "./HardpointBadges";
export { baseMovement, dialStateRange, fxUnits, signed } from "./format";
