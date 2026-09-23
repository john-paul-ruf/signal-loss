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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

describe("MatchShell — CA-01 height chain", () => {
  /**
   * Required proof shape (replan R-01): this file runs under
   * `@vitest-environment node` via renderToStaticMarkup — no jsdom, so
   * computed styles are NOT available. The style rules are asserted by
   * reading the stylesheet text from disk; structure comes from the render.
   * Scrollability itself (scrollHeight > clientHeight) is proved at
   * checkpoint 3 in the e2e suite.
   */
  const cssPath = fileURLToPath(
    new URL("../../../src/app/components/match/match-shell.css", import.meta.url),
  );
  const css = readFileSync(cssPath, "utf8");

  function ruleBody(selector: string): string | null {
    const start = css.indexOf(selector);
    if (start === -1) return null;
    const open = css.indexOf("{", start);
    if (open === -1) return null;
    const body = css.slice(open + 1, css.indexOf("}", open));
    return body.replace(/\s+/g, " ");
  }

  it("renders the viewport-fit shell structure", () => {
    const { html } = bootedShell();
    expect(html).toContain('class="match-shell"');
    expect(html).toContain('class="match-shell__body');
    expect(html).toContain('class="match-shell__inspector"');
    // Round log lives inside the inspector column (the scroll rail).
    expect(html).toMatch(
      /<aside class="match-shell__inspector"[\s\S]*?<section class="round-log /,
    );
  });

  it("pins the shell to the viewport (mock 06 h-screen + min-h-[720px])", () => {
    const body = ruleBody(".match-shell {");
    expect(body).not.toBeNull();
    expect(body).toContain("height: 100vh");
    expect(body).toContain("min-height: 720px");
    expect(body).not.toContain("min-height: 100vh");
  });

  it("bounds the body grid to a single fr row", () => {
    const body = ruleBody(".match-shell__body {");
    expect(body).not.toBeNull();
    expect(body).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(body).toContain("flex: 1");
    expect(body).toContain("min-height: 0");
  });

  it("lets the round log shrink below content so it owns the scroll", () => {
    const body = ruleBody(".round-log {");
    expect(body).not.toBeNull();
    expect(body).toContain("min-height: 0");
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("flex: 1");
  });

  it("fills movement and playback mode slots and floats the movement hud", () => {
    const slot = ruleBody(".match-mode--movement");
    expect(slot).not.toBeNull();
    expect(slot).toContain("height: 100%");
    expect(slot).toContain("padding: 0");
    // The playback modifier shares the grouped slot rule.
    expect(css).toMatch(/\.match-mode--movement,\s*\.match-mode--playback \{/);
    const hud = ruleBody(".movement-hud");
    expect(hud).not.toBeNull();
    expect(hud).toContain("position: absolute");
    expect(hud).toContain("top: 16px");
    expect(hud).toContain("right: 16px");
    expect(hud).toContain("z-index: 4");
  });
});
