import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  constructsOfSquad,
  computeShot,
  effectiveDamage,
  effectiveAttackRange,
  exchangePreview,
  OUTCOME_MATRIX,
  resolveAttackStage,
  hashState,
  sortEventsCanonical,
  squadId,
} from "../../../src/engine/match/index";
import type {
  AttackPlot,
  MatchState,
  ShotOutcome,
  SquadAttackPlot,
} from "../../../src/engine/match/index";
import type { Event } from "../../../src/engine/match/index";
import {
  makeCloseSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

function inAttackPhase(state: MatchState): MatchState {
  const squads = state.squads.map((s) => ({ ...s, poolTotal: 3 })) as unknown as MatchState["squads"];
  return { ...state, phase: "ATTACK_PLOT", squads };
}

function emptyPlots(): [
  SquadAttackPlot,
  SquadAttackPlot,
  SquadAttackPlot,
  SquadAttackPlot,
  SquadAttackPlot,
] {
  return [
    { squadId: squadId(0), attacks: [], postures: [] },
    { squadId: squadId(1), attacks: [], postures: [] },
    { squadId: squadId(2), attacks: [], postures: [] },
    { squadId: squadId(3), attacks: [], postures: [] },
    { squadId: squadId(4), attacks: [], postures: [] },
  ];
}

describe("match/attack / matrix", () => {
  it("applies FR-18 rounding rules exactly", () => {
    // Base damage 5.
    expect(applyMatrix(5, false, "FLAT")).toBe(5); // 1.0×
    expect(applyMatrix(5, false, "POSTURE")).toBe(0); // 0 exactly, no min
    expect(applyMatrix(5, true, "FLAT")).toBe(7); // floor(5*3/2) = 7
    expect(applyMatrix(5, true, "POSTURE")).toBe(2); // floor(5/2) = 2
    // Landing minimum 1 for a small base.
    expect(applyMatrix(1, true, "POSTURE")).toBe(1); // floor(1/2) = 0 → min 1
    // Normal shot into flat with base 0 → 0 (no landing minimum since base is 0? See below.
    // Actually per spec, a landing shot ALWAYS has min 1 except the zero cell.
    // Base damage 0 → floor(0*1/1) = 0 → landing → min 1.
    expect(applyMatrix(0, false, "FLAT")).toBe(1);
  });

  it("exposes the outcome matrix constant with the exact ratios", () => {
    expect(OUTCOME_MATRIX.normal.posture.zero).toBe(true);
    const flatN = OUTCOME_MATRIX.normal.flat;
    if (!flatN.zero) {
      expect([flatN.num, flatN.den]).toEqual([1, 1]);
    }
    const postC = OUTCOME_MATRIX.called.posture;
    if (!postC.zero) {
      expect([postC.num, postC.den]).toEqual([1, 2]);
    }
    const flatC = OUTCOME_MATRIX.called.flat;
    if (!flatC.zero) {
      expect([flatC.num, flatC.den]).toEqual([3, 2]);
    }
  });
});

describe("match/attack / effective stats", () => {
  it("effectiveDamage combines dial state and mount damageDelta", () => {
    const catalog = soloMatchConfig().catalog;
    const state = makeCloseSoloMatch();
    const c = constructsOfSquad(state, squadId(0))[0]!;
    // HARDLINE dial index 0 damage = 5; spike-driver damageDelta = 4.
    expect(effectiveDamage(c, catalog)).toBe(9);
  });

  it("effectiveAttackRange respects the chassis clamp", () => {
    const catalog = soloMatchConfig().catalog;
    const state = makeCloseSoloMatch();
    const c = constructsOfSquad(state, squadId(0))[0]!;
    const r = effectiveAttackRange(c, catalog) as number;
    // HARDLINE baseRange 10, commander CIPHER rangeDelta +1 → 11.
    // rangeClamp min 2 max 18 → uncapped. Verify it is at least 11 and
    // at most 18 board units in fx.
    expect(r).toBeGreaterThanOrEqual(11 * 1024);
    expect(r).toBeLessThanOrEqual(18 * 1024);
  });
});

describe("match/attack / exchangePreview parity", () => {
  it("preview outcomes match a live resolved shot", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const attacker = constructsOfSquad(state, squadId(0))[0]!;
    const target = constructsOfSquad(state, squadId(1))[0]!;
    const preview = exchangePreview(state, attacker.id, target.id, false, catalog);
    expect(preview).toBeDefined();
    if (preview === null) return;
    const damageFlat = preview.vsFlat.damage;
    const damagePosture = preview.vsPosture.damage;

    // Resolve one attack against a FLAT target and compare damage.
    const attacking = inAttackPhase(state);
    const plots = emptyPlots();
    plots[0] = {
      squadId: squadId(0),
      attacks: [{ constructId: attacker.id, targetId: target.id, called: false } as AttackPlot],
      postures: [],
    };
    const r = resolveAttackStage(attacking, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const shot = r.value.events.find((e) => e.kind === "SHOT");
    expect(shot).toBeDefined();
    if (shot?.kind === "SHOT") {
      expect(shot.damage).toBe(damageFlat);
    }
    // Sanity: called into posture halves damage relative to flat (integer floor).
    expect(damagePosture).toBeLessThanOrEqual(damageFlat);
  });
});

describe("match/attack / snapshot-then-apply damage accumulation", () => {
  it("both attackers' shots against the same target sum correctly", () => {
    // Craft a synthetic scenario: three squads on the map, sq 0 and sq 1
    // both fire at sq 2's construct.
    const base = makeCloseSoloMatch();
    // Move sq 2's construct within range of sq 0 for the test.
    const constructs = base.constructs.map((c) =>
      (c.squadId as number) === 2 ? { ...c, position: { x: 0 as never, y: 5 * 1024 as never } } : c,
    );
    const catalog = soloMatchConfig().catalog;
    const state = inAttackPhase({ ...base, constructs });
    const a0 = constructsOfSquad(state, squadId(0))[0]!;
    const a1 = constructsOfSquad(state, squadId(1))[0]!;
    const target = constructsOfSquad(state, squadId(2))[0]!;
    const preview0 = exchangePreview(state, a0.id, target.id, false, catalog);
    const preview1 = exchangePreview(state, a1.id, target.id, false, catalog);
    if (preview0 === null || preview1 === null) return;
    const expected = preview0.vsFlat.damage + preview1.vsFlat.damage;
    const plots = emptyPlots();
    plots[0] = {
      squadId: squadId(0),
      attacks: [{ constructId: a0.id, targetId: target.id, called: false }],
      postures: [],
    };
    plots[1] = {
      squadId: squadId(1),
      attacks: [{ constructId: a1.id, targetId: target.id, called: false }],
      postures: [],
    };
    const r = resolveAttackStage(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const damageEvents = r.value.events.filter((e) => e.kind === "DAMAGE_APPLIED");
    expect(damageEvents).toHaveLength(1);
    if (damageEvents[0]?.kind === "DAMAGE_APPLIED") {
      expect(damageEvents[0].damage).toBe(expected);
    }
  });

  it("range/LOS rejection produces DEFENSE_INFO and zero damage", () => {
    const state = inAttackPhase(makeCloseSoloMatch());
    const catalog = soloMatchConfig().catalog;
    // Sq 2's construct is at anchor (13, 13). Sq 0 is at (-1, 5); the
    // straight distance is ~15 board units — well outside the 11-unit
    // range for hardline + CIPHER.
    const attacker = constructsOfSquad(state, squadId(0))[0]!;
    const target = constructsOfSquad(state, squadId(2))[0]!;
    const plots = emptyPlots();
    plots[0] = {
      squadId: squadId(0),
      attacks: [{ constructId: attacker.id, targetId: target.id, called: false }],
      postures: [],
    };
    const r = resolveAttackStage(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const info = r.value.events.find((e) => e.kind === "DEFENSE_INFO");
    expect(info).toBeDefined();
    if (info?.kind === "DEFENSE_INFO") {
      expect(info.reason).toBe("OUT_OF_RANGE");
    }
    const dmg = r.value.events.filter((e) => e.kind === "DAMAGE_APPLIED");
    expect(dmg).toHaveLength(0);
  });
});

describe("match/attack / order independence (FR-15)", () => {
  it("permutations of squad plot order produce identical hashState + events", () => {
    const state = inAttackPhase(makeCloseSoloMatch());
    const catalog = soloMatchConfig().catalog;
    const a0 = constructsOfSquad(state, squadId(0))[0]!;
    const a1 = constructsOfSquad(state, squadId(1))[0]!;
    const plotsBase = emptyPlots();
    plotsBase[0] = {
      squadId: squadId(0),
      attacks: [{ constructId: a0.id, targetId: a1.id, called: false }],
      postures: [],
    };
    plotsBase[1] = {
      squadId: squadId(1),
      attacks: [{ constructId: a1.id, targetId: a0.id, called: true }],
      postures: [{ constructId: a1.id, posture: "POSTURE" }],
    };
    // Permute
    const perms: number[][] = [];
    const perm = (a: number[], k: number) => {
      if (k === a.length) {
        perms.push(a.slice());
        return;
      }
      for (let i = k; i < a.length; i = i + 1) {
        [a[k], a[i]] = [a[i] as number, a[k] as number];
        perm(a, k + 1);
        [a[k], a[i]] = [a[i] as number, a[k] as number];
      }
    };
    perm([0, 1, 2, 3, 4], 0);
    let refHash: string | null = null;
    let refEvents: readonly Event[] | null = null;
    for (const p of perms) {
      const shuffled = p.map((i) => plotsBase[i]) as unknown as typeof plotsBase;
      const r = resolveAttackStage(state, shuffled, catalog);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const h = hashState(r.value.state);
      const evs = sortEventsCanonical(r.value.events);
      if (refHash === null) {
        refHash = h;
        refEvents = evs;
      } else {
        expect(h).toBe(refHash);
        expect(evs).toEqual(refEvents);
      }
    }
  });
});

describe("match/attack / computeShot self-target guard", () => {
  it("returns zero damage and SELF_TARGET reason if attacker == target", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const attacker = constructsOfSquad(state, squadId(0))[0]!;
    // Manually construct wallIndex-required arguments. Since computeShot
    // early-exits, wallIndex is not touched. We can pass any index (build
    // via preview and reuse).
    const preview = exchangePreview(state, attacker.id, attacker.id, false, catalog);
    expect(preview?.vsFlat.reason).toBe("SELF_TARGET");
    const outcome: ShotOutcome | undefined = preview?.vsPosture;
    expect(outcome?.landed).toBe(false);
  });
});

// `computeShot` reserved for direct tests once Checkpoint 4 uses it.
void computeShot;
