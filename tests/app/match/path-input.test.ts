/**
 * Pure path-input tests: append / drop / simplify / clamp.
 */

import { describe, expect, it } from "vitest";
import {
  appendWaypoint,
  clampPathToAllowance,
  dropLastWaypoint,
  pathLengthFx,
  simplifyPath,
} from "../../../src/app/board/input";
import type { Fx, Vec2 } from "../../../src/engine";

function v(x: number, y: number): Vec2 {
  return { x: x as Fx, y: y as Fx };
}

describe("path-input — waypoint editing", () => {
  it("appendWaypoint deduplicates consecutive identical points", () => {
    const p = [v(0, 0), v(1, 1)];
    const next = appendWaypoint(p, v(1, 1));
    expect(next).toBe(p);
  });
  it("dropLastWaypoint removes exactly one vertex", () => {
    expect(dropLastWaypoint([v(0, 0), v(1, 1)])).toHaveLength(1);
    expect(dropLastWaypoint([])).toHaveLength(0);
  });
});

describe("path-input — length", () => {
  it("returns 0 for degenerate paths", () => {
    expect(pathLengthFx([])).toBe(0);
    expect(pathLengthFx([v(0, 0)])).toBe(0);
  });
  it("returns 5 for a (0,0) → (3,4) segment", () => {
    expect(pathLengthFx([v(0, 0), v(3, 4)])).toBe(5);
  });
});

describe("path-input — clampPathToAllowance", () => {
  it("returns an equivalent path when under allowance", () => {
    const p = [v(0, 0), v(3, 4)];
    const out = clampPathToAllowance(p, 10);
    expect(out).toHaveLength(p.length);
    for (let i = 0; i < p.length; i = i + 1) {
      expect(out[i]?.x as number).toBe(p[i]!.x as number);
      expect(out[i]?.y as number).toBe(p[i]!.y as number);
    }
  });
  it("truncates the last segment at the allowance point", () => {
    const p = [v(0, 0), v(10, 0)];
    const out = clampPathToAllowance(p, 6);
    expect(out).toHaveLength(2);
    const last = out[1]!;
    expect(last.x as number).toBe(6);
    expect(last.y as number).toBe(0);
  });
  it("drops segments past the allowance entirely", () => {
    const p = [v(0, 0), v(5, 0), v(10, 0)];
    const out = clampPathToAllowance(p, 4);
    expect(out).toHaveLength(2);
    expect(out[1]?.x as number).toBe(4);
  });
});

describe("path-input — simplifyPath (RDP)", () => {
  it("keeps a nearly-straight path unchanged", () => {
    const p = [v(0, 0), v(1, 0), v(2, 0), v(3, 0)];
    const simple = simplifyPath(p, 1);
    expect(simple).toHaveLength(2);
    expect(simple[0]?.x as number).toBe(0);
    expect(simple[1]?.x as number).toBe(3);
  });
  it("keeps deviating vertices past epsilon", () => {
    const p = [v(0, 0), v(2, 3), v(4, 0)];
    const simple = simplifyPath(p, 1);
    expect(simple).toHaveLength(3);
  });
});
