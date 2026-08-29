/**
 * Board facade — the single import path any mode uses.
 */

export { BoardCanvas } from "./BoardCanvas";
export type { BoardCanvasProps, PointerActionKind } from "./BoardCanvas";

export {
  fitCamera,
  boundsAabb,
  worldToScreenX,
  worldToScreenY,
  screenToWorldX,
  screenToWorldY,
  snapPointerToFx,
  worldDistanceOnScreen,
  type Camera,
  type Viewport,
  type WorldBounds,
} from "./camera";

export {
  buildTerrainScene,
  buildConstructScene,
  buildBoardScene,
  extractShotLines,
  measureLabel,
  type BoardScene,
  type ConstructScene,
  type OverlayScene,
  type TerrainScene,
} from "./scene";

export {
  pickConstruct,
  pickExactConstructAt,
  pointInPolygonScreen,
} from "./hit-test";

export {
  visualFor,
  highContrastLightness,
  separabilityTriples,
  type SquadVisual,
  type PatternKey,
} from "./squad-visual";

export { AccessibleBoardTree } from "./accessible-tree";
export {
  projectPlaybackFrame,
  type PlaybackFrame,
  type PlaybackPath,
} from "./playback";
