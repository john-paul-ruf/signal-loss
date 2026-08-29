/**
 * Structural provider coverage for the app-lifetime flow store. Uses
 * `react-dom/server` `renderToStaticMarkup` because Session 01's toolchain
 * carries no jsdom / testing-library — the provider boundary is a narrow
 * structural concern (context wiring + throw guard + store identity), so a
 * DOM harness would be dead weight here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoreApi } from "zustand/vanilla";
import { describe, expect, it } from "vitest";
import {
  FlowStoreProvider,
  createFlowStore,
  useFlowStore,
  useFlowStoreApi,
  type FlowStore,
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

function IdentityProbe(props: {
  readonly expected: StoreApi<FlowStore>;
}): React.ReactElement {
  const store = useFlowStoreApi();
  return <span data-identity={store === props.expected ? "same" : "other"} />;
}

function InitialProbe(): React.ReactElement {
  const pending = useFlowStore((state) => state.pendingLaunch);
  const last = useFlowStore((state) => state.lastResult);
  const requested = useFlowStore((state) => state.requestedEntity);
  return <span data-initial={`${pending}:${last}:${requested}`} />;
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

  it("shares the exact injected store with every consumer in one render", () => {
    const store = createFlowStore();
    store.getState().setPendingLaunch(launch);
    const html = renderToStaticMarkup(
      <FlowStoreProvider store={store}>
        <SeedProbe />
        <SeedProbe />
        <IdentityProbe expected={store} />
      </FlowStoreProvider>,
    );
    expect(html.match(/data-seed="seed-abc"/g)).toHaveLength(2);
    expect(html).toContain('data-identity="same"');
    expect(html).not.toContain('data-identity="other"');
  });

  it("creates a default store whose launch, result, and entity start null", () => {
    const html = renderToStaticMarkup(
      <FlowStoreProvider>
        <InitialProbe />
      </FlowStoreProvider>,
    );
    expect(html).toContain('data-initial="null:null:null"');
  });

  it("never reaches for browser storage or persistence in the provider file", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../../src/app/store/core/flow-context.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /localStorage|sessionStorage|CollectionRepository|migrations/,
    );
  });
});

function ApiProbe(): React.ReactElement {
  useFlowStoreApi();
  return <span />;
}
