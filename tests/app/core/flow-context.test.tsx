/**
 * Structural provider coverage for the app-lifetime flow store. Uses
 * `react-dom/server` `renderToStaticMarkup` because Session 01's toolchain
 * carries no jsdom / testing-library — the provider boundary is a narrow
 * structural concern (context wiring + throw guard + store identity), so a
 * DOM harness would be dead weight here.
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FlowStoreProvider,
  useFlowStore,
  useFlowStoreApi,
} from "../../../src/app/store/core/flow-context";
import {
  createFlowStore,
  type MatchLaunchConfig,
} from "../../../src/app/store/core/index";

const launch: MatchLaunchConfig = {
  rosterId: "roster:1",
  roster: {
    id: "roster:1",
    name: "R1",
    budget: 50,
    constructs: [{ chassisCode: 10, commanderCode: 1, mounts: [] }],
  },
  budget: 50,
  seed: "seed-abc",
  archetypeCode: null,
  aiTierId: "steady",
};

function SeedProbe(): React.ReactElement {
  const seed = useFlowStore((state) => state.pendingLaunch?.seed ?? "none");
  return <span data-seed={seed} />;
}

describe("app/core/flow-context", () => {
  it("renders a consumer that reads the supplied store's value", () => {
    const store = createFlowStore();
    store.getState().setPendingLaunch(launch);
    const html = renderToStaticMarkup(
      <FlowStoreProvider store={store}>
        <SeedProbe />
      </FlowStoreProvider>,
    );
    expect(html).toContain('data-seed="seed-abc"');
  });

  it("throws the named boundary error when a hook runs outside the provider", () => {
    expect(() => renderToStaticMarkup(<SeedProbe />)).toThrow(
      /outside FlowStoreProvider/,
    );
    expect(() => renderToStaticMarkup(<ApiProbe />)).toThrow(
      /outside FlowStoreProvider/,
    );
  });
});

function ApiProbe(): React.ReactElement {
  useFlowStoreApi();
  return <span />;
}
