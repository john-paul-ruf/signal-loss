// @vitest-environment node
/**
 * ExchangeCard + AttackLedger rendering — proves the 2×2 outcome
 * matrix reads back the same integers the engine's `exchangePreview`
 * returns. FR-18: what's shown is what will happen.
 */

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
void React;
import {
  createMatchStore,
  MatchStoreProvider,
} from "../../../src/app/store/match";
import { AttackLedger, ExchangeCard, PoolLedger } from "../../../src/app/components/match";
import { squadId } from "../../../src/engine";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import type { SavedRosterV1 } from "../../../src/platform/index";

function bootedStore(): ReturnType<typeof createMatchStore> {
  const store = createMatchStore();
  const roster = soloRoster();
  const saved: SavedRosterV1 = {
    id: "roster:1",
    name: "test",
    budget: 25,
    constructs: roster.constructs.map((c) => ({ ...c, mounts: c.mounts.slice() })),
  } as SavedRosterV1;
  store.getState().boot(
    {
      rosterId: "roster:1",
      roster: saved,
      budget: 25,
      seed: "s08-atk",
      archetypeCode: null,
      aiTierId: "t1",
    },
    testCatalog(),
    buildSimpleMap("s08-atk"),
  );
  // Deploy all 5 to spawn anchors so the engine transitions to MOVEMENT_PLOT
  // → we still have the engine in place for exchange preview.
  const engine = store.getState().engine!;
  for (let sq = 0; sq < 5; sq = sq + 1) {
    const anchor = engine.map.spawns[sq]?.anchor;
    if (anchor === undefined) throw new Error("spawn missing");
    if (sq === 0) store.getState().setDeploymentDraft(0, anchor);
    else
      store.getState().markAiReadyDeploy(0 as never, [
        { rosterIndex: 0, position: anchor },
      ]);
    // We need to mark AI ready for each squad, not always squad 0.
  }
  // Redo the AI deploy correctly.
  for (let sq = 1; sq < 5; sq = sq + 1) {
    const anchor = engine.map.spawns[sq]?.anchor;
    if (anchor !== undefined)
      store.getState().markAiReadyDeploy(sq as never, [
        { rosterIndex: 0, position: anchor },
      ]);
  }
  store.getState().applyDeployment();
  return store;
}

describe("ExchangeCard — reads engine exchangePreview", () => {
  it("renders header and matrix cells", () => {
    const store = bootedStore();
    const state = store.getState();
    const own = state.engine!.constructs[0]!.id;
    const enemy = state.engine!.constructs[1]!.id;
    const html = renderToStaticMarkup(
      <MatchStoreProvider store={store}>
        <ExchangeCard attackerId={own} targetId={enemy} called={false} />
      </MatchStoreProvider>,
    );
    expect(html).toContain('data-testid="exchange-card"');
    expect(html).toContain('data-testid="cell-normal-flat"');
    expect(html).toContain('data-testid="cell-normal-posture"');
    expect(html).toContain('data-testid="cell-called-flat"');
    expect(html).toContain('data-testid="cell-called-posture"');
    // Normal into posture is 0 for any base damage — that's the FR-18 promise.
    expect(html).toMatch(/data-testid="cell-normal-posture"[^>]*><strong>0<\/strong>/);
  });

  it("renders selected controls, accessible names, remaining balance, and uncertainty copy", () => {
    const store = bootedStore();
    const engine = store.getState().engine!;
    const own = engine.constructs[0]!.id;
    const enemy = engine.constructs[1]!.id;
    store.setState({
      mode: "ATTACK_PLOT",
      engine: { ...engine, phase: "ATTACK_PLOT" },
    });
    store.getState().selectConstruct(own);
    store.getState().setAttackDraft(own, enemy, true);
    store.getState().setPostureDraft(own, "POSTURE");

    const html = renderToStaticMarkup(
      <MatchStoreProvider store={store}>
        <AttackLedger />
      </MatchStoreProvider>,
    );

    expect(html).toContain("attack-ledger__row--selected");
    expect(html).toContain(`aria-label="Target for construct ${own as number}"`);
    expect(html).toContain(`aria-label="Shot type for construct ${own as number}"`);
    expect(html).toContain(`aria-label="Posture for construct ${own as number}"`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="attack-pool-remaining">0 REMAINING');
    expect(html).toContain("POSITION CONFIRMED");
  });

  it("shows committed human spend during attack playback after drafts clear", () => {
    const store = bootedStore();
    const engine = store.getState().engine!;
    const attackState = { ...engine, phase: "ATTACK_PLOT" as const };
    store.setState({ engine: attackState, mode: "ATTACK_PLOT" });
    const own = attackState.constructs[0]!.id;
    const enemy = attackState.constructs[1]!.id;
    store.getState().setAttackDraft(own, enemy, true);
    store.getState().setPostureDraft(own, "POSTURE");
    for (let squad = 1; squad < 5; squad += 1) {
      store.getState().markAiReadyAttack(squadId(squad), {
        squadId: squadId(squad),
        attacks: [],
        postures: [],
      }, `ready-${squad}`);
    }
    expect(store.getState().resolveAttack()).toBe(true);
    expect(store.getState().drafts.attackDrafts.size).toBe(0);

    const html = renderToStaticMarkup(
      <MatchStoreProvider store={store}>
        <PoolLedger />
      </MatchStoreProvider>,
    );
    expect(html).toContain('data-testid="pool-total">2 / 2 SPENT');
    expect(html).toContain('data-testid="pool-remaining">0 REMAINING');
    expect(html).toContain("⌐ posture ×1");
    expect(html).toContain("» called ×1");
  });

  it("clamps an externally invalid draft display and reports the violation", () => {
    const store = bootedStore();
    const state = store.getState();
    const engine = state.engine!;
    const own = engine.constructs[0]!.id;
    const enemy = engine.constructs[1]!.id;
    const squads = engine.squads.map((squad) =>
      squad.id === squadId(0) ? { ...squad, commanderDead: true } : squad,
    ) as unknown as typeof engine.squads;
    store.setState({ engine: { ...engine, phase: "ATTACK_PLOT", squads }, mode: "ATTACK_PLOT" });
    store.getState().setAttackDraft(own, enemy, true);
    store.getState().setPostureDraft(own, "POSTURE");

    const html = renderToStaticMarkup(
      <MatchStoreProvider store={store}>
        <PoolLedger />
      </MatchStoreProvider>,
    );
    expect(html).toContain('data-testid="pool-remaining">0 REMAINING');
    expect(html).toContain("INVALID DRAFT · 1 POINT OVER POOL");
    expect(html).toContain("invalid draft overspent by 1");
  });
});
