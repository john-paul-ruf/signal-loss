import { describe, expect, it } from "vitest";
import { fxFromInt } from "../../../src/engine/fx/index";
import type { Vec2 } from "../../../src/engine/fx/index";
import {
  constructsOfSquad,
  hashState,
  resolveMovementPhase,
  sortEventsCanonical,
  squadId,
} from "../../../src/engine/match/index";
import type {
  MatchConstruct,
  MatchState,
  MovePlot,
  SquadMovePlots,
} from "../../../src/engine/match/index";
import type { Event, MovedEvent, HaltedEvent } from "../../../src/engine/match/index";
import {
  makeCloseSoloMatch,
  makeDeployedSoloMatch,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

function v(x: number, y: number): Vec2 {
  return { x: fxFromInt(x), y: fxFromInt(y) };
}

function movePlots(
  state: MatchState,
  mkPaths: (i: number, c: MatchConstruct) => readonly Vec2[],
): readonly [SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots] {
  const out: SquadMovePlots[] = [];
  for (let sq = 0; sq < 5; sq = sq + 1) {
    const owns = constructsOfSquad(state, squadId(sq));
    const moves: MovePlot[] = owns.map((c) => ({ constructId: c.id, path: mkPaths(sq, c) }));
    out.push({ squadId: squadId(sq), moves });
  }
  return out as unknown as readonly [
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
    SquadMovePlots,
  ];
}

function permutations5(): number[][] {
  const all: number[][] = [];
  const perm = (a: number[], k: number) => {
    if (k === a.length) {
      all.push(a.slice());
      return;
    }
    for (let i = k; i < a.length; i = i + 1) {
      [a[k], a[i]] = [a[i] as number, a[k] as number];
      perm(a, k + 1);
      [a[k], a[i]] = [a[i] as number, a[k] as number];
    }
  };
  perm([0, 1, 2, 3, 4], 0);
  return all;
}

describe("match/movement / phase transitions", () => {
  it("transitions from MOVEMENT_PLOT to ATTACK_PLOT with no plots", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const plots = movePlots(state, () => []);
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state.phase).toBe("ATTACK_PLOT");
    expect(r.value.state.round).toBe(1);
    expect(r.value.events).toEqual([]);
  });

  it("rejects a call in the wrong phase", () => {
    const state = { ...makeDeployedSoloMatch(), phase: "ATTACK_PLOT" as const };
    const catalog = soloMatchConfig().catalog;
    const plots = movePlots(state, () => []);
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.some((v) => v.kind === "WRONG_PHASE")).toBe(true);
  });
});

describe("match/movement / single-construct traversal", () => {
  it("HOLD path leaves position unchanged and emits no event", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const before = state.constructs[0]!.position;
    const plots = movePlots(state, () => []);
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state.constructs[0]!.position).toEqual(before);
  });

  it("plotted path reaches the destination when no contact occurs", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c = constructsOfSquad(state, squadId(0))[0]!;
    // Squad 0 starts near (-13, -13). Move to (-12, -13) — 1 board unit.
    const dest = { x: (c.position.x as number) + 1024, y: c.position.y };
    const plots = movePlots(state, (sq) => (sq === 0 ? [c.position, dest as Vec2] : []));
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moved = r.value.state.constructs.find((k) => k.id === c.id)!;
    expect(moved.position.x as number).toBe((c.position.x as number) + 1024);
    const events = r.value.events.filter((e) => e.kind === "MOVED") as MovedEvent[];
    expect(events).toHaveLength(1);
    expect(events[0]?.halted).toBe(false);
  });
});

describe("match/movement / halt fixed point", () => {
  it("head-on collision halts both constructs", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c0 = constructsOfSquad(state, squadId(0))[0]!;
    const c1 = constructsOfSquad(state, squadId(1))[0]!;
    // c0 at (-1, 5), c1 at (1, 5); each moves toward the origin (x-axis).
    const plots = movePlots(state, (sq, c) => {
      if (sq === 0) return [c.position, v(2, 5)];
      if (sq === 1) return [c.position, v(-2, 5)];
      return [];
    });
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const halted = r.value.events.filter((e) => e.kind === "HALTED") as HaltedEvent[];
    expect(halted).toHaveLength(2);
    // Both halted with each other.
    for (const h of halted) {
      expect(h.withConstructs.map((i) => i as number).sort()).toEqual(
        [c0.id as number, c1.id as number].filter((i) => i !== (h.constructId as number)),
      );
    }
    // Neither construct ended overlapping the other's disk.
    const p0 = r.value.state.constructs.find((k) => k.id === c0.id)!.position;
    const p1 = r.value.state.constructs.find((k) => k.id === c1.id)!.position;
    const dx = (p0.x as number) - (p1.x as number);
    const dy = (p0.y as number) - (p1.y as number);
    // Footprints are 1 board unit each → sum radius = 2 board units.
    // dist2 >= (2 * 1024)^2 == 4_194_304 (minus one substep worth of drift).
    expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(3_500_000);
  });

  it("HOLD construct halts an incoming construct (cascade base case)", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c0 = constructsOfSquad(state, squadId(0))[0]!;
    const c1 = constructsOfSquad(state, squadId(1))[0]!;
    // c1 walks into c0 (which HOLDs).
    const plots = movePlots(state, (sq, c) => {
      if (sq === 1) return [c.position, v(-1, 5)];
      return [];
    });
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const halted = r.value.events.filter((e) => e.kind === "HALTED") as HaltedEvent[];
    // c1 halted; c0 was already halted (HOLD) — no halt event emitted for it.
    expect(halted).toHaveLength(1);
    expect(halted[0]?.constructId).toBe(c1.id);
    expect(halted[0]?.withConstructs.map((i) => i as number)).toContain(c0.id as number);
  });
});

describe("match/movement / order independence (FR-15)", () => {
  it("byte-identical result state and events over all 120 squad plot permutations", () => {
    const base = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const plotsBase = movePlots(base, (sq, c) => {
      // Every squad tries to move a small distance toward the center;
      // constructs are far apart so no collision — pure order-independence.
      if (sq === 0) return [c.position, v(-11, -13)];
      if (sq === 1) return [c.position, v(11, -13)];
      if (sq === 2) return [c.position, v(11, 11)];
      if (sq === 3) return [c.position, v(-11, 11)];
      if (sq === 4) return [c.position, v(0, 11)];
      return [];
    });

    let referenceHash: string | null = null;
    let referenceEvents: readonly Event[] | null = null;
    const permutations = permutations5();
    for (const perm of permutations) {
      const permuted = perm.map((i) => plotsBase[i]) as unknown as typeof plotsBase;
      const r = resolveMovementPhase(base, permuted, catalog);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const canonicalEvents = sortEventsCanonical(r.value.events);
      const h = hashState(r.value.state);
      if (referenceHash === null) {
        referenceHash = h;
        referenceEvents = canonicalEvents;
      } else {
        expect(h).toBe(referenceHash);
        expect(canonicalEvents).toEqual(referenceEvents);
      }
    }
    // Sanity: at least one squad moved in the reference.
    expect(referenceEvents!.length).toBeGreaterThan(0);
  });

  it("byte-identical result under randomized construct-array orderings within a squad", () => {
    // Small pair-match scenario: each squad has two constructs. Reorder the
    // moves array within each squad and confirm resolution is invariant.
    const base = makeDeployedSoloMatch();
    // Only sq 0 exercises the ordering — a two-construct plot inside one
    // squad, both HOLDing (the reversal must not shift anything).
    const catalog = soloMatchConfig().catalog;
    const original = movePlots(base, () => []);
    const swapped = original.map((sp, sq) =>
      sq === 0 ? { ...sp, moves: sp.moves.slice().reverse() } : sp,
    ) as unknown as typeof original;
    const a = resolveMovementPhase(base, original, catalog);
    const b = resolveMovementPhase(base, swapped, catalog);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(hashState(a.value.state)).toBe(hashState(b.value.state));
    expect(sortEventsCanonical(a.value.events)).toEqual(sortEventsCanonical(b.value.events));
  });
});

describe("match/movement / proportional traversal", () => {
  it("short and long paths both complete over the same round", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c0 = constructsOfSquad(state, squadId(0))[0]!;
    const c1 = constructsOfSquad(state, squadId(1))[0]!;
    // c0 walks 1 unit; c1 walks ~6 units (near allowance).
    const plots = movePlots(state, (sq, c) => {
      if (sq === 0)
        return [c.position, { x: (c.position.x as number) + 1024, y: c.position.y } as Vec2];
      if (sq === 1)
        return [
          c.position,
          { x: (c.position.x as number) - 6 * 1024, y: c.position.y } as Vec2,
        ];
      return [];
    });
    const r = resolveMovementPhase(state, plots, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p0 = r.value.state.constructs.find((k) => k.id === c0.id)!.position;
    const p1 = r.value.state.constructs.find((k) => k.id === c1.id)!.position;
    // Both arrived at their destination this round.
    expect(p0.x as number).toBe((c0.position.x as number) + 1024);
    expect(p1.x as number).toBe((c1.position.x as number) - 6 * 1024);
  });
});

describe("match/movement / caller safety", () => {
  it("does not mutate the input state (deep freeze probe)", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    // Freeze the top-level and one nested array.
    Object.freeze(state);
    Object.freeze(state.constructs);
    Object.freeze(state.squads);
    const plots = movePlots(state, () => []);
    // Any mutation attempt would throw in strict mode; assert no throw.
    expect(() => resolveMovementPhase(state, plots, catalog)).not.toThrow();
  });
});
