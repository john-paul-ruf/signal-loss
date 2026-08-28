/**
 * CollectionView structural tests (renderToStaticMarkup; no jsdom). Interactive
 * import/armed-delete/keyboard flows and axe are covered by the Playwright spec
 * tests/e2e/build/collection.spec.ts. These assert the design's information
 * states render from a fixture PersistedStateV1.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollectionView, type CollectionActionsView } from "../../../src/app/screens/build/CollectionView";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import { prebuiltToSnapshots } from "../../../src/app/store/build/collection-model";
import type { PersistedStateV1 } from "../../../src/platform/index";

const catalog = resolveCatalog();

const NOOP_ACTIONS: CollectionActionsView = {
  onDuplicatePrebuilt: () => {},
  onSaveImportedRoster: () => {},
  onRename: () => {},
  onDuplicate: () => {},
  onDelete: () => {},
  onResetCorrupt: () => {},
  onCopy: () => {},
};

function stateWith(): PersistedStateV1 {
  const legal = [...prebuiltToSnapshots(catalog.prebuilts[3]!)];
  const illegal = legal.map((c) => ({ ...c, commanderCode: null }));
  return {
    schemaVersion: 1,
    revision: 1,
    nextEntityId: 3,
    constructs: [],
    rosters: [
      { id: "roster:1", name: "LONG DARK", budget: catalog.prebuilts[3]!.budget, constructs: legal },
      { id: "roster:2", name: "TWO CROWNS", budget: catalog.prebuilts[3]!.budget, constructs: illegal },
    ],
    preferences: { reducedMotion: "system", highContrastSquads: false },
  };
}

function render(overrides: Partial<Parameters<typeof CollectionView>[0]> = {}): string {
  return renderToStaticMarkup(
    <CollectionView
      catalog={catalog}
      state={stateWith()}
      persistenceUnavailable={false}
      clipboardAvailable
      lastError={null}
      corrupt={false}
      corruptRaw={null}
      actions={NOOP_ACTIONS}
      {...overrides}
    />,
  );
}

describe("CollectionView", () => {
  it("pins prebuilts with a DUPLICATE TO EDIT fork affordance (FR-5)", () => {
    const markup = render();
    expect(markup).toContain("Prebuilt");
    expect(markup).toContain("Duplicate to edit");
    for (const p of catalog.prebuilts) expect(markup).toContain(p.name);
  });

  it("shows a legal roster's budget and legal banner for the default selection", () => {
    const markup = render();
    expect(markup).toContain("LONG DARK");
    expect(markup.toLowerCase()).toContain("legal");
    // A re-importable share string textarea is present for the selected roster.
    expect(markup).toContain('id="share-out"');
    expect(markup).toContain("SL1-");
  });

  it("renders a persistent import panel (not a toast)", () => {
    expect(render()).toContain('id="share-in"');
  });

  it("surfaces persistence-unavailable as a persistent banner", () => {
    expect(render({ persistenceUnavailable: true })).toContain("Saves unavailable");
  });

  it("surfaces a corrupt store with an armed reset and raw-copy affordance", () => {
    const markup = render({ corrupt: true, corruptRaw: "raw" });
    expect(markup).toContain("Stored collection is corrupt");
    expect(markup).toContain("Reset store");
    expect(markup).toContain("Copy raw data");
  });
});
