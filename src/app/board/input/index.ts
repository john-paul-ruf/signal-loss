/**
 * Board input helpers — path editing, reach computation, keybinding
 * translation. Every function is pure and callable without the DOM.
 */

export {
  appendWaypoint,
  clampPathToAllowance,
  dropLastWaypoint,
  pathLengthFx,
  simplifyPath,
} from "./path-input";

export { reachOutlineOf } from "./reach";
