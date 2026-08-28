/**
 * Playback tests: event-card exhaustiveness + no engine mutation
 * during cursor advance + skip == full advance final state.
 */

import { describe, expect, it } from "vitest";
import { toCard, beatDurationMs, everyKindCovered } from "../../../src/app/board/playback";
import type { Event } from "../../../src/engine";
import {
  createMatchStore,
  visibleEvents,
} from "../../../src/app/store/match";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import type { SavedRosterV1 } from "../../../src/platform/index";
import { squadId } from "../../../src/engine";

function makeEvent(kind: Event["kind"]): Event {
  switch (kind) {
    case "DEPLOYMENT_REVEAL":
      return { kind, round: 1, placements: [] };
    case "POOL_REFILL":
      return {
        kind,
        round: 1,
        squadId: squadId(0),
        total: 4,
        base: 1,
        commanderBase: 1,
        aliveCount: 6,
        rDivisor: 3,
        unitTerm: 2,
        commanderLost: false,
      };
    case "MOVED":
      return {
        kind,
        round: 1,
        constructId: 0 as never,
        from: { x: 0 as never, y: 0 as never },
        stopPosition: { x: 1 as never, y: 0 as never },
        pathDistance: 1,
        plottedLength: 1,
        halted: false,
      };
    case "HALTED":
      return {
        kind,
        round: 1,
        constructId: 0 as never,
        stopPosition: { x: 0 as never, y: 0 as never },
        withConstructs: [],
        reason: "CONTACT",
        atSubstep: 1,
      };
    case "POSTURE_REVEAL":
      return { kind, round: 1, constructId: 0 as never, posture: "FLAT", squadId: squadId(0) };
    case "SHOT":
      return {
        kind,
        round: 1,
        attackerId: 0 as never,
        targetId: 1 as never,
        called: false,
        landed: true,
        damage: 3,
        targetPosture: "FLAT",
        baseDamage: 3,
      };
    case "DEFENSE_INFO":
      return { kind, round: 1, attackerId: 0 as never, targetId: 1 as never, reason: "NO_LOS" };
    case "DAMAGE_APPLIED":
      return { kind, round: 1, targetId: 1 as never, damage: 3 };
    case "DIAL_ADVANCED":
      return { kind, round: 1, constructId: 0 as never, from: 0, to: 1 };
    case "TRACE_DAMAGE":
      return { kind, round: 1, constructId: 0 as never, damage: 2, stepIndex: 0, safeRegionRound: 1 };
    case "DESTROYED":
      return {
        kind,
        round: 1,
        constructId: 0 as never,
        squadId: squadId(0),
        cause: "ATTACK",
        wasCommander: false,
      };
    case "ELIMINATED":
      return { kind, round: 1, squadId: squadId(0), placement: 5 };
    case "MATCH_COMPLETE":
      return { kind, round: 1, winner: squadId(1), reason: "HUMAN_ELIMINATED" };
  }
}

const ALL_KINDS: readonly Event["kind"][] = [
  "DEPLOYMENT_REVEAL",
  "POOL_REFILL",
  "MOVED",
  "HALTED",
  "POSTURE_REVEAL",
  "SHOT",
  "DEFENSE_INFO",
  "DAMAGE_APPLIED",
  "DIAL_ADVANCED",
  "TRACE_DAMAGE",
  "DESTROYED",
  "ELIMINATED",
  "MATCH_COMPLETE",
];

describe("event-cards — coverage", () => {
  it("every engine event kind has a card", () => {
    for (const kind of ALL_KINDS) {
      const card = toCard(makeEvent(kind), 0);
      expect(card.kind).toBe(kind);
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.detail.length).toBeGreaterThan(0);
    }
    // Compile-time coverage guard.
    for (const kind of ALL_KINDS) expect(everyKindCovered(kind)).toBe(1);
  });

  it("beatDurationMs is positive and speed-scaled", () => {
    for (const kind of ALL_KINDS) {
      const base = beatDurationMs(makeEvent(kind), 1);
      const fast = beatDurationMs(makeEvent(kind), 4);
      expect(base).toBeGreaterThan(0);
      expect(fast).toBeLessThanOrEqual(base);
    }
  });
});

describe("playback cursor — no engine mutation", () => {
  it("advance / skip do not touch engine state", () => {
    const store = createMatchStore();
    const saved: SavedRosterV1 = {
      id: "roster:1",
      name: "t",
      budget: 25,
      constructs: soloRoster().constructs.map((c) => ({ ...c, mounts: c.mounts.slice() })),
    } as SavedRosterV1;
    store.getState().boot(
      { rosterId: "roster:1", roster: saved, budget: 25, seed: "s08-pb", archetypeCode: null, aiTierId: "t1" },
      testCatalog(),
      buildSimpleMap("s08-pb"),
    );
    const engine = store.getState().engine!;
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const anchor = engine.map.spawns[sq]?.anchor;
      if (anchor === undefined) throw new Error("spawn");
      if (sq === 0) store.getState().setDeploymentDraft(0, anchor);
      else store.getState().markAiReadyDeploy(squadId(sq), [{ rosterIndex: 0, position: anchor }]);
    }
    store.getState().applyDeployment();
    const before = store.getState().engine!;
    // Advance the playback cursor entirely.
    for (let i = 0; i < store.getState().playback.events.length; i = i + 1) {
      store.getState().playbackAdvance();
    }
    const after = store.getState().engine!;
    // Engine identity preserved.
    expect(after).toBe(before);
    // visibleEvents equals the full events buffer.
    expect(visibleEvents(store.getState().playback).length).toBe(store.getState().playback.events.length);
    // Skip and re-verify.
    store.getState().playbackSkip();
    expect(store.getState().engine).toBe(before);
  });
});
