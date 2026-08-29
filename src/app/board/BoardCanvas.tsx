import * as React from "react";
import { useMatchStore, matchSelectors } from "../store/match";
import type { Catalog, ConstructId, MatchState, Vec2 } from "../../engine";
import { currentDialState } from "../../engine";
import type { Camera } from "./camera";
import { boundsAabb, fitCamera, snapPointerToFx } from "./camera";
import {
  buildBoardScene,
  buildConstructScene,
  extractShotLines,
} from "./scene";
import { projectPlaybackFrame } from "./playback";
import { pathLengthFx } from "./input";
import { paintTerrain } from "./layers/terrain-layer";
import { paintField } from "./layers/field-layer";
import { paintOverlay, type OverlayDeploymentOptions } from "./layers/overlay-layer";
import { pickConstruct } from "./hit-test";
import { AccessibleBoardTree } from "./accessible-tree";
import "./board.css";

/**
 * The React board — mounts three stacked <canvas> elements sharing one
 * camera transform. Redraws are gated per layer:
 *   - terrain: on map / trace step change
 *   - field:   on engine revision change (positions, dial, destruction)
 *   - overlay: on selection / hover / playback cursor change
 *
 * The accessible tree renders alongside — no keyboard-only user has to
 * find a hit target on canvas.
 */
/**
 * Render-only deployment presentation. The board reads this to mark the
 * observer's spawn, draw staged draft markers, and preview the hovered
 * placement. It NEVER carries a value into `MatchState`, `PublicState`,
 * engine events, or AI worker requests — draft positions stay in the
 * match store's `HumanDraftState`. Absent for movement / attack / playback.
 */
export interface DeploymentBoardState {
  readonly humanSquadIndex: number;
  readonly placements: readonly {
    readonly rosterIndex: number;
    readonly constructId: ConstructId;
    readonly position: Vec2;
  }[];
  readonly activeRosterIndex: number | null;
  readonly hover: {
    readonly position: Vec2;
    readonly valid: boolean;
  } | null;
}

export interface BoardCanvasProps {
  /**
   * The interaction receiver — called when the pointer moves or a
   * click lands on the overlay canvas. The receiver gets the snapped
   * world point, the raw DOM event, and the board hit computed from
   * that same pointer position (`constructId` null when the pointer is
   * over empty terrain, or for `leave`). Its job is to translate that
   * into the mode-specific action (deployment placement, path append,
   * selection, inspection, …) — the board never assigns meaning to a
   * hit itself.
   *
   * If omitted the board renders read-only.
   */
  readonly onPointerAction?: (
    kind: PointerActionKind,
    world: Vec2,
    event: React.PointerEvent<HTMLCanvasElement>,
    hit: { readonly constructId: ConstructId | null },
  ) => void;
  /**
   * Optional deployment presentation. When present the terrain layer marks
   * the observer's spawn and the overlay draws staged markers + a hover
   * preview. Absent / null for every non-deployment caller (inert).
   */
  readonly deployment?: DeploymentBoardState | null;
  /** Presentation-only progress of the active playback beat, from 0 through 1. */
  readonly playbackProgress?: number;
}

export type PointerActionKind = "move" | "click" | "double-click" | "leave";

export function BoardCanvas(props: BoardCanvasProps): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const engineRevision = useMatchStore((s) => s.engineRevision);
  const mode = useMatchStore((s) => s.mode);
  const moveDrafts = useMatchStore((s) => s.drafts.moveDrafts);
  const selectionSlice = useMatchStore((s) => s.selection);
  const playback = useMatchStore((s) => s.playback);
  const present = useMatchStore(matchSelectors.selectPresent);

  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const terrainRef = React.useRef<HTMLCanvasElement | null>(null);
  const fieldRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLCanvasElement | null>(null);
  const [viewportSize, setViewportSize] = React.useState<{ w: number; h: number }>({ w: 800, h: 600 });

  // ResizeObserver to keep the camera fit to the canvas box.
  React.useEffect(() => {
    const wrap = wrapperRef.current;
    if (wrap === null) return undefined;
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box === undefined) return;
      setViewportSize({ w: Math.floor(box.width), h: Math.floor(box.height) });
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const pv = useMatchStore(matchSelectors.selectHumanPublicView);
  const playbackFrame = React.useMemo(() => {
    if (
      catalog === null ||
      playback.beforeSnapshot === null ||
      playback.stageKind === null
    ) return null;
    return projectPlaybackFrame(
      playback.beforeSnapshot,
      catalog,
      playback.beforeSnapshot.squads[0].id,
      playback.events,
      playback.cursor,
      props.playbackProgress ?? 0,
    );
  }, [catalog, playback, props.playbackProgress]);

  const camera = React.useMemo<Camera>(() => {
    if (pv === null) {
      return fitCamera(
        { min: { x: 0 as never, y: 0 as never }, max: { x: 32 as never, y: 32 as never } },
        { width: viewportSize.w, height: viewportSize.h, devicePixelRatio: 1 },
      );
    }
    const bounds = boundsAabb(pv.map.bounds);
    return fitCamera(bounds, {
      width: viewportSize.w,
      height: viewportSize.h,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    });
  }, [pv, viewportSize.w, viewportSize.h]);

  const deployment = props.deployment ?? null;
  const deploymentActive = deployment !== null;
  const deploymentHumanSquadIndex = deployment?.humanSquadIndex ?? null;

  // Terrain redraws only on map/trace-step change → depends on
  // engineRevision AND round. Deployment toggling repaints the spawn
  // affordance, but a pointer-only hover change does not (that is overlay).
  React.useEffect(() => {
    if (pv === null || catalog === null) return;
    const canvas = terrainRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    resizeCanvas(canvas, camera);
    const scene = buildBoardScene(pv, catalog, camera).terrain;
    paintTerrain(
      ctx,
      scene,
      camera,
      deploymentHumanSquadIndex === null
        ? null
        : { humanSquadIndex: deploymentHumanSquadIndex },
    );
  }, [pv, catalog, camera, engine?.round, engineRevision, deploymentActive, deploymentHumanSquadIndex]);

  // Field redraws when engine state changes.
  React.useEffect(() => {
    if (pv === null || catalog === null) return;
    const canvas = fieldRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    resizeCanvas(canvas, camera);
    const scenes = playbackFrame?.constructs ?? buildConstructScene(pv, catalog);
    paintField(ctx, scenes, camera, { highContrast: present.highContrastSquads });
  }, [pv, catalog, camera, engineRevision, present.highContrastSquads, playbackFrame]);

  // Overlay redraws on pointer + selection + playback cursor.
  React.useEffect(() => {
    if (pv === null || catalog === null) return;
    const canvas = overlayRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    resizeCanvas(canvas, camera);
    const scenes = playbackFrame?.constructs ?? buildConstructScene(pv, catalog);
    const selection = selectionSlice.selectedConstructId;
    const selectionSc =
      selection === null
        ? null
        : scenes.find((s) => s.id === selection) ?? null;
    // Draft path + movement allowance are derived from store + engine
    // truth; the mode edits the draft via the store, the board reads it.
    const draftPath = readDraftPath(selection, engine, catalog, moveDrafts);
    // In MOVEMENT_PLOT the selection ring's reach is the construct's
    // movement allowance; every other mode keeps the attack-range ring.
    const reachFx =
      selectionSc === null
        ? 0
        : mode === "MOVEMENT_PLOT"
          ? draftPath.allowance
          : selectionSc.rangeFx;
    const deploymentOptions: OverlayDeploymentOptions | null =
      deployment === null
        ? null
        : {
            placements: deployment.placements.map((p) => ({
              rosterIndex: p.rosterIndex,
              label: String(p.rosterIndex + 1).padStart(2, "0"),
              position: p.position,
              active: p.rosterIndex === deployment.activeRosterIndex,
            })),
            hover: deployment.hover,
          };
    paintOverlay(
      ctx,
      {
        selectionRing:
          selectionSc === null
            ? null
            : {
                cid: selectionSc.id,
                position: selectionSc.position,
                footprintFx: selectionSc.footprintFx,
                reachFx,
              },
        hoveredWaypoint: selectionSlice.hoveredWaypoint,
        path: draftPath.path,
        pathLengthFx: draftPath.length,
        allowanceFx: draftPath.allowance,
        overAllowance: draftPath.length > draftPath.allowance,
        shots: playbackFrame?.shots ?? extractShotLines(playback.events.slice(0, playback.cursor), scenes),
        playbackPaths: playbackFrame?.paths ?? [],
      },
      camera,
      deploymentOptions,
    );
  }, [
    pv,
    catalog,
    engine,
    mode,
    moveDrafts,
    camera,
    selectionSlice.selectedConstructId,
    selectionSlice.hoveredWaypoint,
    playback.events,
    playback.cursor,
    playbackFrame,
    deployment,
  ]);

  const onPointer = React.useCallback(
    (kind: PointerActionKind) =>
      (event: React.PointerEvent<HTMLCanvasElement>): void => {
        if (props.onPointerAction === undefined) return;
        const rect = overlayRef.current?.getBoundingClientRect();
        if (rect === undefined) return;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const world = snapPointerToFx(camera, x, y);
        // Resolve the construct under the pointer from the SAME event, so
        // the mode receives snapped-world + hit together. `leave` carries
        // no position, so no hit is computed.
        let constructId: ConstructId | null = null;
        if (kind !== "leave" && pv !== null && catalog !== null) {
          const scenes = buildConstructScene(pv, catalog);
          constructId = pickConstruct(camera, pv.constructs, x, y, largestFootprintFx(scenes));
        }
        props.onPointerAction(kind, world, event, { constructId });
      },
    [props, camera, pv, catalog],
  );

  return (
    <div className="board-canvas" ref={wrapperRef} data-testid="board-canvas">
      <canvas
        ref={terrainRef}
        className="board-canvas__layer board-canvas__layer--terrain"
        aria-hidden="true"
      />
      <canvas
        ref={fieldRef}
        className="board-canvas__layer board-canvas__layer--field"
        aria-hidden="true"
      />
      <canvas
        ref={overlayRef}
        className="board-canvas__layer board-canvas__layer--overlay"
        aria-hidden="true"
        onPointerMove={onPointer("move")}
        onPointerLeave={onPointer("leave")}
        onClick={(e) => onPointer("click")(e as unknown as React.PointerEvent<HTMLCanvasElement>)}
        onDoubleClick={(e) => onPointer("double-click")(e as unknown as React.PointerEvent<HTMLCanvasElement>)}
      />
      <AccessibleBoardTree playbackFrame={playbackFrame} />
    </div>
  );
}

function resizeCanvas(canvas: HTMLCanvasElement, cam: Camera): void {
  const dpr = cam.viewport.devicePixelRatio;
  const targetW = Math.floor(cam.viewport.width * dpr);
  const targetH = Math.floor(cam.viewport.height * dpr);
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;
  canvas.style.width = `${cam.viewport.width}px`;
  canvas.style.height = `${cam.viewport.height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/**
 * Derive the selected construct's movement overlay facts from store +
 * engine truth: the engine-normalized draft path from `moveDrafts`, its
 * exact fx length, and the construct's current movement allowance. No
 * value is written back — this is a pure read for the overlay painter.
 */
function readDraftPath(
  selection: ConstructId | null,
  engine: MatchState | null,
  catalog: Catalog | null,
  moveDrafts: ReadonlyMap<number, readonly Vec2[]>,
): { path: readonly Vec2[]; length: number; allowance: number } {
  if (selection === null || engine === null || catalog === null) {
    return { path: [], length: 0, allowance: 0 };
  }
  const construct = engine.constructs.find((c) => c.id === selection);
  if (construct === undefined) return { path: [], length: 0, allowance: 0 };
  const dial = currentDialState(construct, catalog);
  const allowance = dial === undefined ? 0 : (dial.movementAllowance as number);
  const draft = moveDrafts.get(selection as number) ?? [];
  const path = draft.length >= 2 ? draft : [];
  return { path, length: pathLengthFx(path), allowance };
}

function largestFootprintFx(scenes: readonly { footprintFx: number }[]): number {
  let max = 4;
  for (const s of scenes) if (s.footprintFx > max) max = s.footprintFx;
  return max;
}
