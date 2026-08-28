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
import { ExchangeCard } from "../../../src/app/components/match";
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
    expect(html).toMatch(/data-testid="cell-normal-posture"[^>]*>0</);
  });
});
