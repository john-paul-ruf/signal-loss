import { FX_ONE, type MapResult, type Vec2 } from "../../../engine";

interface PreviewViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/** Board-unit padding so the boundary stroke is never clipped at the SVG edge. */
const PREVIEW_MARGIN = 2;

/**
 * Derive an SVG view box, in board units, that encloses the complete centered
 * map. The engine centers `bounds` on the world origin, so the extents span
 * negative and positive coordinates; those are valid SVG coordinates and are
 * kept verbatim — the map itself is never translated or clamped.
 */
function previewViewBox(bounds: readonly Vec2[]): PreviewViewBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of bounds) {
    const x = p.x / FX_ONE;
    const y = p.y / FX_ONE;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    minX: minX - PREVIEW_MARGIN,
    minY: minY - PREVIEW_MARGIN,
    width: maxX - minX + 2 * PREVIEW_MARGIN,
    height: maxY - minY + 2 * PREVIEW_MARGIN,
  };
}

export function MapPreview({
  result,
}: {
  readonly result: MapResult | null;
}): React.ReactElement {
  if (result === null)
    return (
      <section aria-labelledby="map-preview">
        <h2 id="map-preview" className="sl-label">
          GENERATED MAP — PREVIEW
        </h2>
        <p className="mt-3 border border-line p-6 font-mono text-xs text-ink-3">
          GENERATE A SETUP TO REVIEW TERRAIN, SPAWNS, AND TRACE.
        </p>
      </section>
    );
  const { map, rejectedReports } = result;
  const points = (v: readonly Vec2[]) =>
    v.map((p) => `${p.x / FX_ONE},${p.y / FX_ONE}`).join(" ");
  const vb = previewViewBox(map.bounds);
  return (
    <section aria-labelledby="map-preview">
      <div className="flex justify-between">
        <h2 id="map-preview" className="sl-label">
          GENERATED MAP — PREVIEW
        </h2>
        <span className="font-mono text-[11px] text-ink-3">
          {map.archetypeId} · ATTEMPT {map.acceptedAttempt}
        </span>
      </div>
      <svg
        aria-label="Generated map preview"
        viewBox={`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="mt-2 w-full border border-line bg-void"
      >
        <polygon
          points={points(map.bounds)}
          fill="none"
          stroke="var(--color-line-2)"
          strokeWidth=".5"
        />
        {map.walls.map((w) => (
          <line
            key={w.id}
            x1={w.a.x / FX_ONE}
            y1={w.a.y / FX_ONE}
            x2={w.b.x / FX_ONE}
            y2={w.b.y / FX_ONE}
            stroke="var(--color-ink-3)"
            strokeWidth=".8"
          />
        ))}
        {map.spawns.map((s) => (
          <polygon
            key={s.squadIndex}
            points={points(s.polygon)}
            fill="none"
            stroke="var(--color-sys)"
            strokeWidth=".6"
          />
        ))}
      </svg>
      <p className="sl-help">
        {map.walls.length} WALLS · 5 SPAWNS · {map.traceSchedule.length} TRACE
        STEPS · {rejectedReports.length} REJECTED ATTEMPTS
      </p>
    </section>
  );
}
