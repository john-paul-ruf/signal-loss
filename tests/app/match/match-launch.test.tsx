// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowStoreProvider, createFlowStore } from "../../../src/app/store/core";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core/flow-store";
import { MatchScreen } from "../../../src/app/screens/match/MatchScreen";
import { buildSimpleMap } from "../../fixtures/maps/simple";

function launch(): CompleteMatchLaunchConfig {
  const roster = { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] };
  return {
    human: { source: { kind: "prebuilt", id: "starter-25" as never, name: "Starter" }, roster, shareString: "SL1-human" },
    aiRosters: [roster, roster, roster, roster],
    aiRosterShareStrings: ["SL1-ai1", "SL1-ai2", "SL1-ai3", "SL1-ai4"],
    map: buildSimpleMap("route-test"),
    seed: "route-test",
    budget: 25,
    aiTier: 1,
    selector: { kind: "any" },
    resolvedArchetypeId: "arena" as never,
  };
}

describe("MatchScreen launch consumption", () => {
  it("renders setup recovery only when the flow store has no launch", () => {
    const store = createFlowStore();
    const html = renderToStaticMarkup(<FlowStoreProvider store={store}><MatchScreen /></FlowStoreProvider>);
    expect(html).toContain('href="#/setup"');
    expect(html).toContain("Missing launch payload.");
  });

  it("holds a supplied launch for its one-time boot transition", () => {
    const store = createFlowStore();
    store.getState().setPendingLaunch(launch());
    const html = renderToStaticMarkup(<FlowStoreProvider store={store}><MatchScreen /></FlowStoreProvider>);
    expect(html).toContain("Preparing match…");
    expect(html).not.toContain('href="#/setup"');
  });
});
