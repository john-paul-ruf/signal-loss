import * as React from "react";
import { useMatchStore, matchSelectors } from "../store/match";
import type { ConstructId, PublicState, Vec2 } from "../../engine";
import type { Camera } from "./camera";
import { boundsAabb, fitCamera, snapPointerToFx } from "./camera";
import {
  buildBoardScene,
  buildConstructScene,
  extractShotLines,
} from "./scene";
import { paintTerrain } from "./layers/terrain-layer";
import { paintField } from "./layers/field-layer";
import { paintOverlay } from "./layers/overlay-layer";
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
export interface BoardCanvasProps {
  /**
   * The interaction receiver — called when the pointer moves or a
   * click lands on the overlay canvas. The receiver's job is to
   * translate `(worldPoint, event)` into the mode-specific action
   * (deployment placement, path append, target selection, …).
   *
   * If omitted the board renders read-only.
   */
  readonly onPointerAction?: (kind: PointerActionKind, world: Vec2, event: React.PointerEvent<HTMLCanvasElement>) => void;
}

export type PointerActionKind = "move" | "click" | "double-click" | "leave";

export function BoardCanvas(props: BoardCanvasProps): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const engineRevision = useMatchStore((s) => s.engineRevision);
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

  // Terrain redraws only on map/trace-step change → depends on
  // engineRevision AND round.
  React.useEffect(() => {
    if (pv === null || catalog === null) return;
    const canvas = terrainRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    resizeCanvas(canvas, camera);
    const scene = buildBoardScene(pv, catalog, camera).terrain;
    paintTerrain(ctx, scene, camera);
  }, [pv, catalog, camera, engine?.round, engineRevision]);

  // Field redraws when engine state changes.
  React.useEffect(() => {
    if (pv === null || catalog === null) return;
    const canvas = fieldRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    resizeCanvas(canvas, camera);
    const scenes = buildConstructScene(pv, catalog);
    paintField(ctx, scenes, camera, { highContrast: present.highContrastSquads });
  }, [pv, catalog, camera, engineRevision, present.highContrastSquads]);

  // Overlay redraws on pointer + selection + playback cursor.
  React.useEffect(() => {
    if (pv === null || catalog === null) return;
    const canvas = overlayRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    resizeCanvas(canvas, camera);
    const scenes = buildConstructScene(pv, catalog);
    const selection = selectionSlice.selectedConstructId;
    const selectionSc =
      selection === null
        ? null
        : scenes.find((s) => s.id === selection) ?? null;
    // Draft path is set by the mode via the store; we read it here.
    const draftPath = readDraftPath(selection, pv);
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
                reachFx: selectionSc.rangeFx,
              },
        hoveredWaypoint: selectionSlice.hoveredWaypoint,
        path: draftPath.path,
        pathLengthFx: draftPath.length,
        allowanceFx: draftPath.allowance,
        overAllowance: draftPath.length > draftPath.allowance,
        shots: extractShotLines(playback.events.slice(0, playback.cursor), scenes),
      },
      camera,
    );
  }, [
    pv,
    catalog,
    camera,
    selectionSlice.selectedConstructId,
    selectionSlice.hoveredWaypoint,
    playback.events,
    playback.cursor,
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
        props.onPointerAction(kind, world, event);
      },
    [props, camera],
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
        onClick={(e) => {
          // Convert to a synthetic pointer event so the receiver gets the
          // same shape.
          onPointer("click")(e as unknown as React.PointerEvent<HTMLCanvasElement>);
          // Also select the construct under the pointer if any.
          const rect = overlayRef.current?.getBoundingClientRect();
          if (rect === undefined || pv === null || catalog === null) return;
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const scenes = buildConstructScene(pv, catalog);
          const cid = pickConstruct(camera, pv.constructs, px, py, largestFootprintFx(scenes));
          if (cid !== null) {
            // Selection is best-effort — modes may override this.
            void cid;
          }
        }}
        onDoubleClick={(e) => onPointer("double-click")(e as unknown as React.PointerEvent<HTMLCanvasElement>)}
      />
      <AccessibleBoardTree />
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

function readDraftPath(
  selection: ConstructId | null,
  pv: PublicState,
): { path: readonly Vec2[]; length: number; allowance: number } {
  // Placeholder: draft path handling lives in Checkpoint 3's movement
  // mode; the overlay renderer accepts an empty path here.
  void selection;
  void pv;
  return { path: [], length: 0, allowance: 0 };
}

function largestFootprintFx(scenes: readonly { footprintFx: number }[]): number {
  let max = 4;
  for (const s of scenes) if (s.footprintFx > max) max = s.footprintFx;
  return max;
}
