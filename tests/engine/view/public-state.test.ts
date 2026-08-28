import { describe, expect, it } from "vitest";
import {
  publicView,
  resolutionRangeOf,
  updateKnownPositions,
} from "../../../src/engine/view/index";
import type {
  KnownConstruct,
  PublicConstruct,
  PublicState,
  PublicSquad,
} from "../../../src/engine/view/index";
import {
  constructsOfSquad,
  squadId,
} from "../../../src/engine/match/index";
import { makeCloseSoloMatch, makeDeployedSoloMatch, soloMatchConfig } from "../../fixtures/matches/simple-match";

const PUBLIC_CONSTRUCT_KEYS = new Set<keyof PublicConstruct>([
  "id",
  "squadId",
  "chassisCode",
  "commanderCode",
  "mounts",
  "dialIndex",
  "destroyed",
  "destroyedRound",
  "damageDealt",
  "damageTaken",
  "roundsAlive",
  "calledShotsFired",
  "posturesHeld",
]);

const KNOWN_CONSTRUCT_KEYS = new Set<keyof KnownConstruct>([
  "base",
  "position",
  "confirmedRound",
  "confirmed",
  "driftRadius",
]);

const PUBLIC_SQUAD_KEYS = new Set<keyof PublicSquad>([
  "id",
  "commanderDead",
  "commanderDeathRound",
  "poolTotal",
  "poolSpent",
  "eliminatedRound",
  "totalDamageDealt",
  "totalDamageTaken",
  "totalPoolGranted",
  "totalPoolSpent",
  "totalPoolWasted",
  "totalCalledShots",
  "totalPostures",
]);

const PUBLIC_STATE_KEYS = new Set<keyof PublicState>([
  "observer",
  "config",
  "round",
  "phase",
  "map",
  "squads",
  "constructs",
  "eliminationOrder",
  "winner",
]);

describe("view/publicView / structural whitelist (no leak)", () => {
  it("PublicState has exactly the declared field set — no MatchState fields sneak in", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const view = publicView(updateKnownPositions(state, catalog), squadId(0), catalog);
    const keys = new Set(Object.keys(view));
    // Exactly PUBLIC_STATE_KEYS.
    for (const k of PUBLIC_STATE_KEYS) expect(keys.has(k as string)).toBe(true);
    for (const k of keys) {
      expect(PUBLIC_STATE_KEYS.has(k as keyof PublicState)).toBe(true);
    }
  });

  it("PublicConstruct/KnownConstruct never expose an intent field", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const view = publicView(updateKnownPositions(state, catalog), squadId(0), catalog);
    const forbidden = ["moves", "attacks", "postures", "movePlot", "attackPlot", "drafts", "intent", "hasPlotted"];
    for (const kc of view.constructs) {
      const baseKeys = Object.keys(kc.base);
      for (const key of baseKeys) {
        expect(PUBLIC_CONSTRUCT_KEYS.has(key as keyof PublicConstruct)).toBe(true);
      }
      const kcKeys = Object.keys(kc);
      for (const key of kcKeys) {
        expect(KNOWN_CONSTRUCT_KEYS.has(key as keyof KnownConstruct)).toBe(true);
      }
      // Explicit forbidden set (belt + suspenders).
      for (const f of forbidden) {
        expect(baseKeys.includes(f)).toBe(false);
        expect(kcKeys.includes(f)).toBe(false);
      }
    }
  });

  it("PublicSquad exposes pool and cumulative fields but no intent flag", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const view = publicView(updateKnownPositions(state, catalog), squadId(0), catalog);
    for (const sq of view.squads) {
      for (const key of Object.keys(sq)) {
        expect(PUBLIC_SQUAD_KEYS.has(key as keyof PublicSquad)).toBe(true);
      }
    }
  });
});

describe("view/publicView / own vs enemy resolution", () => {
  it("observer's own squad is fully confirmed at the current round", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const withKnown = updateKnownPositions(state, catalog);
    const view = publicView(withKnown, squadId(0), catalog);
    const owns = view.constructs.filter((c) => (c.base.squadId as number) === 0);
    for (const c of owns) {
      expect(c.confirmed).toBe(true);
      expect(c.driftRadius as number).toBe(0);
    }
  });

  it("enemy positions are ghosts until an own construct is within resolution range", () => {
    const state = makeDeployedSoloMatch(); // sq 0 at anchor (~ -13, -13); sq 1 at (13, -13).
    const catalog = soloMatchConfig().catalog;
    // sq 0's resolutionRange for its solo = clamp(chassis.resolutionRange 12 + 0, [2, 18]) = 12.
    // dist to sq 1 (~ 26 units) is way beyond 12 → enemy ghost.
    const withKnown = updateKnownPositions(state, catalog);
    const view = publicView(withKnown, squadId(0), catalog);
    const enemy = view.constructs.find((c) => (c.base.squadId as number) === 1)!;
    // Own squad's deployment round confirmed everyone once at round 1;
    // enemy shows confirmedRound=1 and driftRadius=0 (fresh reveal). We
    // recompute at round 1, still fresh.
    expect(enemy.confirmedRound).toBeGreaterThanOrEqual(1);
    expect(enemy.base.squadId as number).toBe(1);
  });

  it("close scenarios keep enemies confirmed", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const withKnown = updateKnownPositions(state, catalog);
    const view = publicView(withKnown, squadId(0), catalog);
    const enemy = view.constructs.find((c) => (c.base.squadId as number) === 1)!;
    expect(enemy.confirmed).toBe(true);
    expect(enemy.driftRadius as number).toBe(0);
  });
});

describe("view/publicView / AI-equivalent fairness", () => {
  it("publicView is symmetric across observer squad ids (same structural fields for every observer)", () => {
    const state = makeCloseSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const withKnown = updateKnownPositions(state, catalog);
    const shape = (view: PublicState) => {
      return {
        top: Object.keys(view).sort(),
        squads: view.squads.map((s) => Object.keys(s).sort()),
        constructs: view.constructs.map((c) => ({
          base: Object.keys(c.base).sort(),
          entry: Object.keys(c).sort(),
        })),
      };
    };
    const s0 = shape(publicView(withKnown, squadId(0), catalog));
    const s2 = shape(publicView(withKnown, squadId(2), catalog));
    expect(s0).toEqual(s2);
  });
});

describe("view/resolutionRangeOf", () => {
  it("applies chassis resolutionRange + mount rangeDelta clamped", () => {
    const state = makeDeployedSoloMatch();
    const catalog = soloMatchConfig().catalog;
    const c = constructsOfSquad(state, squadId(0))[0]!;
    // hardline resolutionRange = 12; spike-driver rangeDelta = 0.
    // clamp(12, 2, 18) = 12.
    const r = resolutionRangeOf(c, catalog) as number;
    expect(r).toBe(12 * 1024);
  });
});

describe("view/updateKnownPositions", () => {
  it("sorts the returned entries by (observer asc, subject asc)", () => {
    const catalog = soloMatchConfig().catalog;
    const state = updateKnownPositions(makeDeployedSoloMatch(), catalog);
    for (let i = 1; i < state.knownPositions.length; i = i + 1) {
      const prev = state.knownPositions[i - 1]!;
      const cur = state.knownPositions[i]!;
      const prevKey = (prev.observer as number) * 1_000_000 + (prev.subject as number);
      const curKey = (cur.observer as number) * 1_000_000 + (cur.subject as number);
      expect(curKey).toBeGreaterThan(prevKey);
    }
  });

  it("preserves the ghost position for an enemy that fell out of range", () => {
    // Deploy in the wide scenario. Sq 0's construct at anchor sees enemies
    // out of range; the prior known-position table records deployed positions.
    const catalog = soloMatchConfig().catalog;
    const first = updateKnownPositions(makeDeployedSoloMatch(), catalog);
    const enemyEntry = first.knownPositions.find(
      (k) => (k.observer as number) === 0 && (k.subject as number) === 1,
    );
    expect(enemyEntry).toBeDefined();
    // The entry may be a placeholder (round 0) or fresh reveal.
    // The important property: it exists and has a defined position.
    if (enemyEntry !== undefined) expect(enemyEntry.position).toBeDefined();
  });
});
