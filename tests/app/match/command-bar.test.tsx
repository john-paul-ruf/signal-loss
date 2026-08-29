// @vitest-environment node
/**
 * CommandBar AI-deployment gate tests (M19, SESSION-01).
 *
 * Rendered with `renderToStaticMarkup` (the repo's server-render pattern — no
 * jsdom), which proves the deployment commit gate reflects human + AI state:
 *   - human complete but an AI slot pending → WAITING status, commit disabled;
 *   - every AI squad READY_DEPLOY → commit enabled, status gone;
 *   - an errored AI slot → FAILED status, commit disabled, and the failure
 *     survives dismissing the error banner.
 *
 * A live keyboard dispatch needs a DOM (jsdom is not in devDependencies), so
 * the shared "incomplete predicate never commits" contract is proven at the
 * store boundary instead — the same guard the keyboard path calls.
 */

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
void React; // JSX transform requires it
import { createMatchStore, MatchStoreProvider } from "../../../src/app/store/match";
import { CommandBar } from "../../../src/app/components/match/CommandBar";
import { soloRoster, testCatalog } from "../../fixtures/matches/simple-match";
import { buildSimpleMap } from "../../fixtures/maps/simple";
import { squadId } from "../../../src/engine";
import type { SavedRosterV1 } from "../../../src/platform/index";
import type { AiStatus } from "../../../src/app/store/match";

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
      seed: "s01-command-bar",
      archetypeCode: null,
      aiTierId: "t1",
    },
    testCatalog(),
    buildSimpleMap("s01-command-bar"),
  );
  if (!ok) throw new Error("boot failed");
  return store;
}

function render(store: ReturnType<typeof createMatchStore>): string {
  return renderToStaticMarkup(
    <MatchStoreProvider store={store}>
      <CommandBar />
    </MatchStoreProvider>,
  );
}

function commitButton(html: string): string {
  return html.match(/<button[^>]*command-bar__commit[^>]*>/)?.[0] ?? "";
}

function placeHuman(store: ReturnType<typeof createMatchStore>): void {
  const anchor = store.getState().engine?.map.spawns[0]?.anchor;
  if (anchor === undefined) throw new Error("no spawn anchor");
  store.getState().setDeploymentDraft(0, anchor);
}

function readySquads(store: ReturnType<typeof createMatchStore>, squads: readonly number[]): void {
  const engine = store.getState().engine;
  for (const sq of squads) {
    const anchor = engine?.map.spawns[sq]?.anchor;
    if (anchor === undefined) throw new Error(`no spawn anchor ${sq}`);
    store.getState().markAiReadyDeploy(squadId(sq), [{ rosterIndex: 0, position: anchor }]);
  }
}

describe("CommandBar — AI deployment gate", () => {
  it("shows WAITING FOR AI DEPLOYMENT while a slot is pending and keeps commit disabled", () => {
    const store = bootStore();
    placeHuman(store);
    store.getState().markAiPending(squadId(1), 1);
    const html = render(store);
    expect(html).toContain('data-testid="deploy-ai-status"');
    expect(html).toContain("WAITING FOR AI DEPLOYMENT");
    expect(commitButton(html)).toContain("disabled");
    // Human placement is done, so the unplaced counter is gone.
    expect(html).not.toContain("UNPLACED");
  });

  it("enables commit and drops the status once all four AI squads are READY_DEPLOY", () => {
    const store = bootStore();
    placeHuman(store);
    readySquads(store, [1, 2, 3, 4]);
    const html = render(store);
    expect(commitButton(html)).not.toContain("disabled");
    expect(html).not.toContain("deploy-ai-status");
    expect(html).not.toContain("WAITING FOR AI DEPLOYMENT");
  });

  it("shows AI DEPLOYMENT FAILED and keeps commit disabled when a slot errored", () => {
    const store = bootStore();
    placeHuman(store);
    readySquads(store, [2, 3, 4]);
    store.getState().markAiError(squadId(1), 9, "AI_FAILURE", "no legal deployment");
    const html = render(store);
    expect(html).toContain('data-testid="deploy-ai-status"');
    expect(html).toContain("AI DEPLOYMENT FAILED");
    expect(commitButton(html)).toContain("disabled");
  });

  it("keeps the action disabled after the error banner is dismissed", () => {
    const store = bootStore();
    placeHuman(store);
    readySquads(store, [2, 3, 4]);
    store.getState().markAiError(squadId(1), 9, "AI_FAILURE", "boom");
    store.getState().clearError();
    const html = render(store);
    expect(html).not.toContain('data-testid="command-error"');
    expect(html).toContain("AI DEPLOYMENT FAILED");
    expect(commitButton(html)).toContain("disabled");
    // The shared predicate is the store guard the keyboard path also calls —
    // it refuses to commit an incomplete AI set even when bypassed.
    expect(store.getState().applyDeployment()).toBe(false);
  });
});

describe("CommandBar — phase readiness and playback truth", () => {
  function setPhaseAi(
    store: ReturnType<typeof createMatchStore>,
    mode: "MOVEMENT_PLOT" | "ATTACK_PLOT",
    kinds: readonly AiStatus["kind"][],
  ): void {
    const ai = new Map<number, AiStatus>();
    kinds.forEach((kind, index) => {
      const squad = squadId(index + 1);
      if (kind === "READY_MOVE") {
        ai.set(index + 1, { kind, plot: { squadId: squad, moves: [] }, diagnosticsSeed: "ready" });
      } else if (kind === "READY_ATTACK") {
        ai.set(index + 1, { kind, plot: { squadId: squad, attacks: [], postures: [] }, diagnosticsSeed: "ready" });
      } else if (kind === "ERROR") {
        ai.set(index + 1, { kind, requestId: 1, errorKind: "DOWN", message: "worker down" });
      } else if (kind === "PENDING") {
        ai.set(index + 1, { kind, requestId: 1, since: 0 });
      } else {
        ai.set(index + 1, { kind: "IDLE" });
      }
    });
    store.setState({ mode, ai });
  }

  it("requires every slot to match the current movement or attack readiness kind", () => {
    const store = bootStore();
    setPhaseAi(store, "MOVEMENT_PLOT", ["READY_MOVE", "READY_MOVE", "PENDING", "READY_MOVE"]);
    expect(render(store)).toContain("WAITING FOR AI MOVEMENT");
    expect(commitButton(render(store))).toContain("disabled");
    setPhaseAi(store, "MOVEMENT_PLOT", ["READY_MOVE", "READY_MOVE", "READY_MOVE", "READY_MOVE"]);
    expect(commitButton(render(store))).not.toContain("disabled");

    setPhaseAi(store, "ATTACK_PLOT", ["READY_ATTACK", "READY_MOVE", "READY_ATTACK", "READY_ATTACK"]);
    expect(render(store)).toContain("WAITING FOR AI ATTACK");
    setPhaseAi(store, "ATTACK_PLOT", ["READY_ATTACK", "READY_ATTACK", "ERROR", "READY_ATTACK"]);
    expect(render(store)).toContain("AI ATTACK FAILED");
    setPhaseAi(store, "ATTACK_PLOT", ["READY_ATTACK", "READY_ATTACK", "READY_ATTACK", "READY_ATTACK"]);
    expect(commitButton(render(store))).not.toContain("disabled");
  });

  it("labels playing, paused, and zero-event complete playback truthfully", () => {
    const store = bootStore();
    const snapshot = store.getState().engine!;
    store.setState({
      mode: "MOVEMENT_PLAYBACK",
      playback: {
        running: false,
        cursor: 0,
        speed: 1,
        events: [],
        beforeSnapshot: snapshot,
        afterSnapshot: snapshot,
        stageKind: "MOVEMENT",
      },
    });
    expect(render(store)).toContain("COMPLETE");
    expect(commitButton(render(store))).not.toContain("disabled");
    expect(render(store)).toContain("CONTINUE");

    const event = { kind: "MATCH_COMPLETE", round: 1, winner: null, reason: "SIMULTANEOUS" } as const;
    store.setState({ playback: { ...store.getState().playback, events: [event], running: false } });
    expect(render(store)).toContain("PAUSED");
    expect(render(store)).not.toContain("PLAYING…");
    store.setState({ playback: { ...store.getState().playback, running: true } });
    expect(render(store)).toContain("PLAYING");
  });
});
