import { describe, expect, it } from "vitest";
import { fxFromInt } from "../../../src/engine/fx/index";
import type { Vec2 } from "../../../src/engine/fx/index";
import {
  constructsOfSquad,
  legalAttackPlot,
  legalMovePlot,
  squadId,
} from "../../../src/engine/match/index";
import type { ConstructId } from "../../../src/engine/match/index";
import {
  makeDeployedSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

function v(x: number, y: number): Vec2 {
  return { x: fxFromInt(x), y: fxFromInt(y) };
}

describe("match/plot / legalMovePlot", () => {
  it("accepts an empty path (HOLD) and preserves fields", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c = constructsOfSquad(state, squadId(0))[0]!;
    const result = legalMovePlot(state, c.id, [], catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toEqual([]);
    expect(result.value.constructId).toBe(c.id);
  });

  it("prepends the current position if the caller omits it", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c = constructsOfSquad(state, squadId(0))[0]!;
    // One tiny step in +x (well within movement allowance).
    const step = { x: (c.position.x as number) + 1024, y: c.position.y };
    const result = legalMovePlot(state, c.id, [step as Vec2], catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path[0]).toEqual(c.position);
    expect(result.value.path[1]).toEqual(step);
  });

  it("rejects a path over the movement allowance", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c = constructsOfSquad(state, squadId(0))[0]!;
    // A path across the whole board is definitely over allowance.
    const far = v(100, 100);
    const result = legalMovePlot(state, c.id, [c.position, far], catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.some((v) => v.kind === "OVER_MOVEMENT_ALLOWANCE")).toBe(true);
  });

  it("rejects a construct that does not exist", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const result = legalMovePlot(state, 9999 as ConstructId, [], catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.some((v) => v.kind === "UNKNOWN_CONSTRUCT")).toBe(true);
  });

  it("does not mutate the caller's path array", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c = constructsOfSquad(state, squadId(0))[0]!;
    const step = { x: (c.position.x as number) + 512, y: c.position.y };
    const original: Vec2[] = [step as Vec2];
    const originalCopy = original.map((p) => ({ ...p }));
    legalMovePlot(state, c.id, original, catalog);
    expect(original).toEqual(originalCopy);
  });
});

describe("match/plot / legalAttackPlot", () => {
  it("returns WRONG_PHASE outside ATTACK_PLOT phase", () => {
    const state = makeDeployedSoloMatch(); // phase = MOVEMENT_PLOT
    const errors = legalAttackPlot(state, squadId(0), {
      squadId: squadId(0),
      attacks: [],
      postures: [],
    });
    expect(errors.some((v) => v.kind === "WRONG_PHASE")).toBe(true);
  });

  it("rejects attacks whose attacker is not owned by the calling squad", () => {
    const state = { ...makeDeployedSoloMatch(), phase: "ATTACK_PLOT" as const };
    // Grant a small pool so overspend does not obscure.
    const squads = state.squads.map((s, i) => (i === 0 ? { ...s, poolTotal: 3 } : s)) as unknown as typeof state.squads;
    const forcedState = { ...state, squads };
    const foreign = constructsOfSquad(forcedState, squadId(1))[0]!;
    const target = constructsOfSquad(forcedState, squadId(1))[0]!;
    const errors = legalAttackPlot(forcedState, squadId(0), {
      squadId: squadId(0),
      attacks: [{ constructId: foreign.id, targetId: target.id, called: false }],
      postures: [],
    });
    expect(errors.some((v) => v.kind === "ATTACKER_NOT_OWNED")).toBe(true);
  });

  it("reports pool overspend with FR-16", () => {
    const base = makeDeployedSoloMatch();
    const state = {
      ...base,
      phase: "ATTACK_PLOT" as const,
      squads: base.squads.map((s, i) => (i === 0 ? { ...s, poolTotal: 0 } : s)) as unknown as typeof base.squads,
    };
    const attacker = constructsOfSquad(state, squadId(0))[0]!;
    const target = constructsOfSquad(state, squadId(1))[0]!;
    const errors = legalAttackPlot(state, squadId(0), {
      squadId: squadId(0),
      attacks: [{ constructId: attacker.id, targetId: target.id, called: true }],
      postures: [{ constructId: attacker.id, posture: "POSTURE" }],
    });
    const overspend = errors.find((v) => v.kind === "POOL_OVERSPEND");
    expect(overspend).toBeDefined();
    expect(overspend?.rule).toBe("FR-16");
  });
});
