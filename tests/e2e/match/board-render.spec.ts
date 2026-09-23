/**
 * Board render — terrain legibility probe (CAP-02 / CA-02, SESSION-02).
 *
 * The fog defect: `drawGridTicks` stroked one line pair per 10 fx against a
 * 65,536-fx board fitted to ~480 CSS px of canvas height — ≈0.07 px between
 * lines, thousands of sub-pixel strokes flooding the canvas. The planner
 * probe sampled a 300×300 patch of the production terrain canvas and
 * measured 8 distinct 16-step colors at 68.4% lit pixels — a wash, not
 * topology. The fix paints a screen-space adaptive grid (2560 fx ≈ 17.8 px
 * minor spacing at the fitted scale, every 5th line major).
 *
 * This spec re-runs the proven planner-probe technique in chromium: sample
 * the terrain canvas through `getImageData` and assert the pixel-level
 * success criteria CA-02 prescribes. Headless chromium's chromium project
 * runs Desktop Chrome at devicePixelRatio 1, so canvas device pixels equal
 * CSS pixels; the probe still derives the live ratio and samples in device
 * pixels, so the geometry assertion stays meaningful if that ever changes.
 *
 * Full-page screenshots land in gitignored
 * `program/signal-loss/img-source/s02-terrain-<phase>.png` for the human
 * mock-parity eyeball against mock 06.
 */

import { expect, test } from "@playwright/test";
import {
  FORBIDDEN,
  MOVE_TARGET,
  SPAWN_POINTS,
  clickWorld,
  collectRuntimeFailures,
  generateAndDeploy,
} from "./support/real-match";

const IMG_SOURCE = "program/signal-loss/img-source";

test.describe("board render — terrain grid legibility (canvas pixel probe)", () => {
  test("terrain canvas measures as topology, not a sub-pixel fog", async ({ page }) => {
    test.setTimeout(180_000);
    const failures = collectRuntimeFailures(page);

    // The real journey to MOVEMENT_PLOT and PLAYBACK — the same steps as
    // `enterMovementWithPositivePlot`, paused before the movement commit so
    // each phase's screenshot can be captured for human review.
    await generateAndDeploy(page);
    const board = page.getByTestId("board-canvas");
    for (const point of SPAWN_POINTS) await clickWorld(board, point);
    const begin = page.getByTestId("commit-deployment");
    await expect(begin).toBeEnabled({ timeout: 30_000 });
    await begin.click();
    await expect(page.getByTestId("mode-movement")).toBeVisible({ timeout: 30_000 });
    await clickWorld(board, SPAWN_POINTS[0]!);
    await clickWorld(board, MOVE_TARGET);
    const commit = page.getByTestId("commit-movement");
    await expect(commit).toBeEnabled({ timeout: 30_000 });
    await page.screenshot({ path: `${IMG_SOURCE}/s02-terrain-movement-plot.png`, fullPage: true });

    await commit.click();
    await page.getByRole("dialog", { name: "COMMIT MOVEMENT" })
      .getByRole("button", { name: "COMMIT MOVEMENT", exact: true }).click();
    await expect(page.getByTestId("mode-playback")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${IMG_SOURCE}/s02-terrain-playback.png`, fullPage: true });

    // Terrain repaints in a post-commit effect; let one frame land before
    // sampling so the probe reads the settled paint.
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    }));

    const probe = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "[data-testid='board-canvas'] .board-canvas__layer--terrain",
      );
      if (canvas === null) throw new Error("terrain canvas not found");
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("terrain 2d context unavailable");

      // Device pixels per CSS pixel (1 on headless Desktop Chrome).
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      const w = Math.floor(Math.min(300 * dpr, canvas.width));
      const h = Math.floor(Math.min(300 * dpr, canvas.height));
      const img = ctx.getImageData(0, 0, w, h);
      const px = img.data;
      const total = img.width * img.height;

      const step16 = (v: number): number => Math.round(v / 17);

      // Distinct 16-step colors + lit ratio + wall-bucket presence. The
      // terrain canvas is transparent void with strokes on top, so "lit"
      // means any paint (alpha > 0) — the fog flood measured 68.4%.
      const buckets = new Set<number>();
      let lit = 0;
      let wall = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] as number;
        const g = (px[i + 1] as number);
        const b = (px[i + 2] as number);
        const a = (px[i + 3] as number);
        if (a > 0) lit += 1;
        buckets.add((step16(r) << 12) | (step16(g) << 8) | (step16(b) << 4) | step16(a));
        // Walls and the bounds polygon stroke #2A3946 = (42,57,70); in
        // 16-step buckets that hue is r=2, g=3, b=4 regardless of the
        // coverage alpha, because getImageData is not premultiplied.
        if (a >= 64 && step16(r) === 2 && step16(g) === 3 && step16(b) === 4) wall += 1;
      }

      // Scanline geometry: along a horizontal row, a grid line crossing is
      // a run of adjacent-pixel luminance deltas (|Δ| ≥ 2/255). Runs ≤ 3 px
      // apart are one line's anti-aliasing. On a clean row the detected
      // lines must sit ≥ 10 px apart — the fog flood's detected lines sat
      // ≈0.07 px apart and cannot pass this.
      const lum = (i: number): number =>
        0.2126 * (px[i] as number) + 0.7152 * (px[i + 1] as number) + 0.0722 * (px[i + 2] as number);
      const rows: { y: number; clusters: number; minGap: number }[] = [];
      for (const y of [40, 80, 120, 160, 200, 240, 280]) {
        if (y >= img.height) continue;
        const transitions: number[] = [];
        let prev = lum(y * img.width * 4);
        for (let x = 1; x < img.width; x += 1) {
          const l = lum((y * img.width + x) * 4);
          if (Math.abs(l - prev) >= 2) transitions.push(x);
          prev = l;
        }
        const clusters: number[] = [];
        let last = -10;
        for (const x of transitions) {
          if (x - last <= 3) {
            last = x;
            continue;
          }
          clusters.push(x);
          last = x;
        }
        let minGap = -1;
        for (let k = 1; k < clusters.length; k += 1) {
          const gap = (clusters[k] as number) - (clusters[k - 1] as number);
          if (minGap < 0 || gap < minGap) minGap = gap;
        }
        rows.push({ y, clusters: clusters.length, minGap });
      }

      return { dpr, distinctColors: buckets.size, litRatio: lit / total, wallPixels: wall, rows };
    });

    // Measured values for the State Update (planner baseline: 8 colors,
    // 68.4% lit, 0.07 px line spacing).
    console.info("CA-02 terrain probe:", JSON.stringify(probe));

    // Fog baseline (planner probe, production bundle): 8 distinct colors.
    expect(probe.distinctColors, "distinct 16-step colors in the 300×300 terrain patch")
      .toBeGreaterThanOrEqual(12);
    expect(probe.litRatio, "lit-pixel ratio of the terrain patch (fog measured 0.684)")
      .toBeLessThan(0.9);
    const measuring = probe.rows.find((r) => r.clusters >= 3 && r.minGap >= 10);
    expect(measuring, `grid lines ≥ 10 px apart on a scanline; scanline report: ${JSON.stringify(probe.rows)}`)
      .toBeDefined();
    expect(probe.wallPixels, "#2A3946 wall/bounds pixels in the patch").toBeGreaterThanOrEqual(1);

    expect(
      failures.filter((text) => FORBIDDEN.some((needle) => text.includes(needle))),
      failures.join("\n"),
    ).toEqual([]);
  });
});