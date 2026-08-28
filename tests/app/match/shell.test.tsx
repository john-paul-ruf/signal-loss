// @vitest-environment node
/**
 * Persistent-match-shell smoke tests. We render with `renderToStaticMarkup`
 * (no jsdom in devDependencies yet), which is enough to prove:
 *   - every semantic landmark exists
 *   - the "NO TIMER — COMMIT WHEN READY" hint is present in plotting phases
 *   - phase/round header renders
 *   - trace timeline lists every schedule step
 *
 * Interactive keyboard behaviour is covered by the Checkpoint 6 e2e suite.
 */

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
void React; // JSX transform requires it
import {
  createMatchStore,
  MatchStoreProvider,
} from "../../../src/app/store/match";
import { MatchShell } from "../../../src/app/components/match";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import type { SavedRosterV1 } from "../../../src/platform/index";

function bootedShell(): { html: string; store: ReturnType<typeof createMatchStore> } {
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
      seed: "s08-shell",
      archetypeCode: null,
      aiTierId: "t1",
    },
    testCatalog(),
    buildSimpleMap("s08-shell"),
  );
  const html = renderToStaticMarkup(
    <MatchStoreProvider store={store}>
      <MatchShell boardSlot={<div data-testid="board-slot">board</div>} />
    </MatchStoreProvider>,
  );
  return { html, store };
}

describe("MatchShell — persistent chrome", () => {
  it("renders the match main landmark", () => {
    const { html } = bootedShell();
    expect(html).toContain('role="main"');
    expect(html).toContain('aria-label="Match"');
  });

  it("renders the round + phase header (FR-13)", () => {
    const { html } = bootedShell();
    expect(html).toContain('data-testid="round"');
    expect(html).toContain('data-testid="phase"');
    expect(html).toContain("PHASE: DEPLOYMENT");
  });

  it("renders the trace timeline and lists the schedule", () => {
    const { html } = bootedShell();
    expect(html).toContain('aria-label="Trace schedule');
    expect(html).toContain("Contraction 1:");
  });

  it("renders the pool ledger with the formula and PROJECTED tag", () => {
    const { html } = bootedShell();
    expect(html).toContain('data-testid="pool-formula"');
    expect(html).toContain("1 base +");
    expect(html).toContain("PROJECTED");
  });

  it("renders the squad rail and command bar", () => {
    const { html } = bootedShell();
    expect(html).toContain('aria-label="Own constructs"');
    expect(html).toContain('data-testid="commit-deployment"');
  });

  it("renders the board slot content", () => {
    const { html } = bootedShell();
    expect(html).toContain('data-testid="board-slot"');
  });

  it("shows NO TIMER — COMMIT WHEN READY during deployment", () => {
    const { html } = bootedShell();
    expect(html).toContain("NO TIMER — COMMIT WHEN READY");
  });
});
