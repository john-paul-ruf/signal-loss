import { describe, expect, it } from "vitest";
import { fxFromInt, type Fx, type Vec2 } from "../../../src/engine/fx/index";
import { buildTraceSchedule } from "../../../src/engine/map/trace";
import { polygonContains } from "../../../src/engine/map/types";

function v(unitX: number, unitY: number): Vec2 {
  return { x: fxFromInt(unitX), y: fxFromInt(unitY) };
}

const bounds: readonly Vec2[] = [
  v(-16, -16),
  v(16, -16),
  v(16, 16),
  v(-16, 16),
];

const baseInput = {
  boundsMin: v(-16, -16),
  boundsMax: v(16, 16),
  center: v(0, 0),
  firstRound: 4,
  interval: 2,
  maxRound: 24,
  traceBase: 2,
  traceStep: 2,
  shrinkPerStep: fxFromInt(2),
  minHalfExtent: fxFromInt(2),
};

describe("map/trace / buildTraceSchedule", () => {
  it("emits contractions at ascending rounds separated by interval", () => {
    const schedule = buildTraceSchedule(baseInput);
    expect(schedule.length).toBeGreaterThan(0);
    let last = baseInput.firstRound - baseInput.interval;
    for (let i = 0; i < schedule.length; i = i + 1) {
      const step = schedule[i];
      expect(step).toBeDefined();
      if (step === undefined) continue;
      expect(step.round).toBe(last + baseInput.interval);
      last = step.round;
    }
  });

  it("escalates damage by traceBase + traceStep × i", () => {
    const schedule = buildTraceSchedule(baseInput);
    for (let i = 0; i < schedule.length; i = i + 1) {
      expect(schedule[i]?.damage).toBe(baseInput.traceBase + baseInput.traceStep * i);
    }
  });

  it("produces monotonically nested safe regions", () => {
    const schedule = buildTraceSchedule(baseInput);
    for (let i = 1; i < schedule.length; i = i + 1) {
      const prev = schedule[i - 1];
      const cur = schedule[i];
      expect(prev).toBeDefined();
      expect(cur).toBeDefined();
      if (prev === undefined || cur === undefined) continue;
      expect(polygonContains(prev.safeRegion, cur.safeRegion)).toBe(true);
    }
  });

  it("keeps the first safe region inside bounds", () => {
    const schedule = buildTraceSchedule(baseInput);
    expect(schedule.length).toBeGreaterThan(0);
    const first = schedule[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(polygonContains(bounds, first.safeRegion)).toBe(true);
    }
  });

  it("terminates when the safe region would drop below minHalfExtent", () => {
    // Two shrink steps of 6 fit under minHalfExtent of 4 — expect exactly two steps.
    const schedule = buildTraceSchedule({
      ...baseInput,
      shrinkPerStep: fxFromInt(6),
      minHalfExtent: fxFromInt(4),
    });
    expect(schedule.length).toBe(2);
  });

  it("returns an empty array when the very first region cannot fit", () => {
    const schedule = buildTraceSchedule({
      ...baseInput,
      minHalfExtent: (fxFromInt(20) as number) as Fx,
    });
    expect(schedule).toEqual([]);
  });

  it("throws on interval or firstRound below 1", () => {
    expect(() => buildTraceSchedule({ ...baseInput, interval: 0 })).toThrow(/interval/);
    expect(() => buildTraceSchedule({ ...baseInput, firstRound: 0 })).toThrow(/firstRound/);
  });

  it("throws on non-positive shrink or half-extent", () => {
    expect(() => buildTraceSchedule({ ...baseInput, shrinkPerStep: fxFromInt(0) })).toThrow(/> 0/);
  });
});
