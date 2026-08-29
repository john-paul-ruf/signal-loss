import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPreview } from "../../../src/app/components/setup/MapPreview";
import type { MapResult } from "../../../src/engine";
import { buildSimpleMap } from "../../fixtures/maps/simple";

/** A complete MapResult whose bounds straddle zero (-16..16 board units). */
const centeredResult: MapResult = {
  map: buildSimpleMap(),
  rejectedReports: [],
};

function readViewBox(html: string): readonly number[] {
  const match = /viewBox="([^"]+)"/.exec(html);
  if (match === null || match[1] === undefined)
    throw new Error("no viewBox rendered");
  return match[1].split(" ").map((n) => Number(n));
}

describe("setup MapPreview", () => {
  it("keeps the empty-state label and generate instruction", () => {
    const html = renderToStaticMarkup(<MapPreview result={null} />);
    expect(html).toContain("GENERATED MAP — PREVIEW");
    expect(html).toContain("GENERATE A SETUP TO REVIEW TERRAIN, SPAWNS, AND TRACE.");
  });

  it("no longer renders the clipped 0 0 100 100 viewport for a centered map", () => {
    const html = renderToStaticMarkup(<MapPreview result={centeredResult} />);
    expect(html).not.toContain('viewBox="0 0 100 100"');
  });

  it("derives a viewport enclosing the full negative-to-positive bounds", () => {
    const html = renderToStaticMarkup(<MapPreview result={centeredResult} />);
    const [minX, minY, width, height] = readViewBox(html);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    // The fixture bounds span -16..16 on both axes; the viewport must contain them.
    expect(minX).toBeLessThanOrEqual(-16);
    expect(minY).toBeLessThanOrEqual(-16);
    expect((minX as number) + (width as number)).toBeGreaterThanOrEqual(16);
    expect((minY as number) + (height as number)).toBeGreaterThanOrEqual(16);
  });

  it("preserves wall, spawn, and summary markup", () => {
    const html = renderToStaticMarkup(<MapPreview result={centeredResult} />);
    expect(html).toContain("WALLS · 5 SPAWNS");
    expect(html).toContain('stroke="var(--color-ink-3)"'); // wall segments
    expect(html).toContain('stroke="var(--color-sys)"'); // spawn regions
    // Five spawn polygons remain, so the fit does not hide geometry.
    const spawnPolygons = html.split('stroke="var(--color-sys)"').length - 1;
    expect(spawnPolygons).toBe(5);
  });
});
