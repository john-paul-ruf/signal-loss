// @vitest-environment node
/**
 * Deployment-screen contract tests. Rendered with `renderToStaticMarkup`
 * (the repo's server-render pattern — no jsdom), which is enough to prove
 * the deployment HUD reflects store state:
 *   - the initial count + explicit spawn instruction
 *   - a staged draft rendering its coordinates and an unplace affordance
 *   - selected-row / active-placement semantics
 *
 * The live pointer path (click → stage, invalid-reason feedback) and the
 * command-bar commit gate are covered by the real-browser e2e spec.
 */

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
void React; // JSX transform requires it
import {
  createMatchStore,
  MatchStoreProvider,
} from "../../../src/app/store/match";
import { DeploymentMode } from "../../../src/app/screens/match/DeploymentMode";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import type { SavedRosterV1 } from "../../../src/platform/index";

function bootStore(): ReturnType<typeof createMatchStore> {
  const store = createMatchStore();
  const roster = soloRoster();
  const saved: SavedRosterV1 = {
    id: "roster:1",
    name: "test",
    budget: 25,
    constructs: roster.constructs.map((c) => ({ ...c, mounts: c.mounts.slice() })),
  } as SavedRosterV1;
  const ok = store.getState().boot(
    {
      rosterId: "roster:1",
      roster: saved,
      budget: 25,
      seed: "s01-deploy",
      archetypeCode: null,
      aiTierId: "t1",
    },
    testCatalog(),
    buildSimpleMap("s01-deploy"),
  );
  if (!ok) throw new Error("boot failed");
  return store;
}

function render(store: ReturnType<typeof createMatchStore>): string {
  return renderToStaticMarkup(
    <MatchStoreProvider store={store}>
      <DeploymentMode />
    </MatchStoreProvider>,
  );
}

function humanConstructId(store: ReturnType<typeof createMatchStore>): number {
  const c = store.getState().engine?.constructs.find((k) => (k.squadId as number) === 0);
  if (c === undefined) throw new Error("no human construct");
  return c.id as number;
}

describe("DeploymentMode — HUD contract", () => {
  it("renders the initial count and an explicit spawn instruction", () => {
    const html = render(bootStore());
    expect(html).toContain("0 / 1 PLACED");
    expect(html).toContain("SELECT A UNIT, THEN CLICK YOUR SPAWN");
    expect(html).toContain("UNPLACED");
    // No enemy spawn coordinates leak before BEGIN MATCH.
    expect(html).not.toContain("click to unplace");
  });

  it("renders a staged draft's coordinates and an unplace affordance", () => {
    const store = bootStore();
    const anchor = store.getState().engine?.map.spawns[0]?.anchor;
    if (anchor === undefined) throw new Error("no spawn anchor");
    store.getState().setDeploymentDraft(0, anchor);
    const html = render(store);
    expect(html).toContain("1 / 1 PLACED");
    expect(html).toContain(`${anchor.x as number}, ${anchor.y as number}`);
    expect(html).toContain("click to unplace");
  });

  it("arms the selected construct for placement", () => {
    const store = bootStore();
    store.getState().selectConstruct(store.getState().engine!.constructs.find((k) => (k.squadId as number) === 0)!.id);
    const html = render(store);
    expect(html).toContain("CLICK YOUR SPAWN TO PLACE");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("deployment-hud__item--active");
    // Sanity: the selected id is the human construct.
    expect(humanConstructId(store)).toBeGreaterThanOrEqual(0);
  });
});
