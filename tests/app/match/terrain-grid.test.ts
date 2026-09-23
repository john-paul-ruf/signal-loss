/**
 * Terrain grid step — CA-02 headless proof (SESSION-02).
 *
 * Pure math, no canvas: the step selection the adaptive grid paint uses,
 * its monotonicity, the minimum on-screen spacing guarantee across a
 * swept range of viewport scales, and the major-line predicate. The
 * probe scale (65,536-fx board fitted into ~632 CSS px → 0.006958 px/fx
 * → 2560 fx step ≈ 17.8 px minor spacing) is asserted directly — that
 * scale is where the 10 fx fixed step measured 68.4% lit pixels at 8
 * distinct colors (the fog defect).
 */

import { describe, expect, it } from "vitest";
import {
  GRID_BASE_FX,
  MAJOR_EVERY,
  MIN_GRID_SPACING_PX,
  gridStepForScale,
  isMajorGridLine,
} from "../../../src/app/board/layers/terrain-layer";

describe("gridStepForScale — CA-02 step formula (10fx × 2^k, ≥ 12px on screen)", () => {
  it("yields 2560 fx at the probe scale 0.006958 px/fx → ≈17.8 px minor spacing", () => {
    expect(gridStepForScale(0.006958)).toBe(2560);
  });

  it("returns the base step once spacing clears the minimum", () => {
    // At scale 1.2 a 10 fx line is 12 px on screen — no coarsening.
    expect(gridStepForScale(1.2)).toBe(GRID_BASE_FX);
    expect(gridStepForScale(10)).toBe(GRID_BASE_FX);
  });

  it("coarsens to the next power of two only when needed", () => {
    // 640 × 0.02 = 12.8 ≥ 12 already; 320 × 0.02 = 6.4 < 12 → double.
    expect(gridStepForScale(0.02)).toBe(640);
    // 1280 × 0.005 = 6.4 < 12 → double; 2560 × 0.005 = 12.8 ≥ 12 → stop.
    expect(gridStepForScale(0.005)).toBe(2560);
  });

  it("is monotonic non-decreasing as the camera zooms out (scale 10 → 0.001)", () => {
    // Zooming out shrinks px-per-fx, so the step coarsens; zooming in
    // refines it. The formula is therefore non-decreasing over DESCENDING
    // scale — over ascending scale it is non-increasing (the prompt's
    // example list phrased the direction over ascending scale, which its
    // own probe-scale example contradicts; the CA-02 formula governs).
    let previous = GRID_BASE_FX;
    for (let scale = 10; scale >= 0.001; scale = scale / 1.1) {
      const step = gridStepForScale(scale);
      expect(step).toBeGreaterThanOrEqual(previous);
      expect(step % GRID_BASE_FX).toBe(0);
      previous = step;
    }
  });

  it("keeps step × scale ≥ MIN_GRID_SPACING_PX over a swept range", () => {
    for (let scale = 0.001; scale <= 10; scale = scale * 1.1) {
      expect(gridStepForScale(scale) * scale).toBeGreaterThanOrEqual(
        MIN_GRID_SPACING_PX,
      );
    }
  });

  it("steps just below the minimum coarsen exactly once", () => {
    // One doubling below the threshold is enough — no overshoot.
    const edge = MIN_GRID_SPACING_PX / GRID_BASE_FX; // scale where 10 fx = 12 px
    expect(gridStepForScale(edge * 0.999)).toBe(GRID_BASE_FX * 2);
    expect(gridStepForScale(edge)).toBe(GRID_BASE_FX);
  });
});

describe("isMajorGridLine — CA-02 major every MAJOR_EVERY-th line", () => {
  const step = gridStepForScale(0.006958); // 2560
  const majorPeriod = step * MAJOR_EVERY; // 12800

  it("marks multiples of step × MAJOR_EVERY as major", () => {
    expect(isMajorGridLine(0, step)).toBe(true);
    expect(isMajorGridLine(majorPeriod, step)).toBe(true);
    expect(isMajorGridLine(-majorPeriod, step)).toBe(true);
    expect(isMajorGridLine(2 * majorPeriod, step)).toBe(true);
    expect(isMajorGridLine(-2 * majorPeriod, step)).toBe(true);
  });

  it("keeps ±2560 · 1 minor at the probe step", () => {
    expect(isMajorGridLine(step, step)).toBe(false);
    expect(isMajorGridLine(-step, step)).toBe(false);
    expect(isMajorGridLine(majorPeriod - step, step)).toBe(false);
  });

  it("is exact on integer world coordinates (no float slop)", () => {
    // Integer coords mod an integer period are exact — spot-check the
    // neighborhood of a major line for off-by-one drift.
    expect(isMajorGridLine(majorPeriod - 1, step)).toBe(false);
    expect(isMajorGridLine(majorPeriod + 1, step)).toBe(false);
  });
});