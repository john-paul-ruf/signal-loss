// @vitest-environment node
/**
 * Composer structural tests (renderToStaticMarkup — no jsdom in
 * devDependencies yet, matching every other session-07 render test).
 * Interactive keyboard/hover behaviour is covered by
 * tests/e2e/build/composer.spec.ts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposerView, type ComposerActions } from "../../../src/app/screens/build/composer/ComposerView";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import {
  EMPTY_DRAFT,
  setChassis,
  setCommander,
  setMount,
  type ComposerDraft,
} from "../../../src/app/store/build/composer";
import { BUDGETS, type ChassisCode } from "../../../src/engine/index";

const catalog = resolveCatalog();

const NOOP_ACTIONS: ComposerActions = {
  onSetChassis: () => {},
  onSetCommander: () => {},
  onMount: () => {},
  onUnmount: () => {},
  onSetName: () => {},
  onSetTargetBudget: () => {},
  onUndo: () => {},
  onSave: () => {},
  onCopy: () => {},
};

function render(overrides: Partial<Parameters<typeof ComposerView>[0]> = {}): string {
  return renderToStaticMarkup(
    <ComposerView
      catalog={catalog}
      draft={EMPTY_DRAFT}
      name="NEW CONSTRUCT"
      targetBudget={100}
      budgetOptions={BUDGETS}
      contextLabel="STANDALONE CONSTRUCT"
      canUndo={false}
      shareString={null}
      saveLabel="Save construct"
      justSaved={false}
      actions={NOOP_ACTIONS}
      {...overrides}
    />,
  );
}

describe("ComposerView", () => {
  it("prompts for a chassis before any construct exists", () => {
    const markup = render();
    expect(markup).toContain("SELECT A CHASSIS TO BEGIN COMPOSING");
    expect(markup.toLowerCase()).toContain("select a chassis");
  });

  it("lists every catalog chassis in the searchable region (FR-1)", () => {
    const markup = render();
    for (const c of catalog.chassis) expect(markup).toContain(c.name);
  });

  it("renders hardpoint ports and dial once a chassis is selected", () => {
    const chassis = catalog.chassis[0]!;
    const draft: ComposerDraft = setChassis(EMPTY_DRAFT, chassis.code);
    const markup = render({ draft });
    expect(markup).toContain(`Port 1 ·`);
    expect(markup).toContain("EMPTY · LEGAL · COSTS 0");
    expect(markup).toContain(`${chassis.name} dial`);
  });

  it("shows a legal banner for a construct with no violations", () => {
    const chassis = catalog.chassis[0]!;
    const draft: ComposerDraft = setChassis(EMPTY_DRAFT, chassis.code);
    const markup = render({ draft });
    expect(markup.toLowerCase()).toContain("construct legal");
  });

  it("surfaces a port type mismatch violation from a fixture with a bad mount code (FR-2)", () => {
    const chassis = catalog.chassis.find((c) => c.hardpoints.length > 0)!;
    const wrongTypeMount = catalog.mounts.find(
      (m) => m.requiredHardpointType !== chassis.hardpoints[0]!.typeId,
    )!;
    const draft: ComposerDraft = setMount(setChassis(EMPTY_DRAFT, chassis.code), 0, wrongTypeMount.code);
    const markup = render({ draft });
    expect(markup.toLowerCase()).toContain("construct illegal");
    expect(markup).toContain("FR-2");
  });

  it("shows the commander tag and its dial delta once tagged (FR-3)", () => {
    const chassis = catalog.chassis[0]!;
    const commander = catalog.commanderTypes[0]!;
    const draft: ComposerDraft = setCommander(setChassis(EMPTY_DRAFT, chassis.code), commander.code);
    const markup = render({ draft });
    expect(markup).toContain(`◆ CMD · ${commander.name}`);
  });

  it("shows over-target-budget without treating it as an illegal construct", () => {
    // A construct that is structurally legal but costs more than a tiny target budget.
    const chassis = catalog.chassis.reduce((a, b) => (b.cost > a.cost ? b : a));
    const draft: ComposerDraft = setChassis(EMPTY_DRAFT, chassis.code);
    const markup = render({ draft, targetBudget: 1 });
    expect(markup).toContain("OVER TARGET");
    expect(markup.toLowerCase()).toContain("construct legal");
  });

  it("disables save while illegal and renders the save control", () => {
    const chassis = catalog.chassis.find((c) => c.hardpoints.length > 0)!;
    const wrongTypeMount = catalog.mounts.find(
      (m) => m.requiredHardpointType !== chassis.hardpoints[0]!.typeId,
    )!;
    const draft: ComposerDraft = setMount(setChassis(EMPTY_DRAFT, chassis.code), 0, wrongTypeMount.code);
    const markup = render({ draft });
    expect(markup).toContain('data-testid="save-construct"');
    expect(markup).toMatch(/data-testid="save-construct"[^>]*disabled/);
  });

  it("renders the roster context label when composing inside a roster", () => {
    const markup = render({ contextLabel: "ROSTER · LONG DARK" });
    expect(markup).toContain("ROSTER · LONG DARK");
  });

  it("renders a copy-string affordance once a chassis is selected (FR-7)", () => {
    const chassis = catalog.chassis[0]!;
    const draft: ComposerDraft = setChassis(EMPTY_DRAFT, chassis.code);
    const markup = render({ draft, shareString: "SL1-fixture" });
    expect(markup).toContain("Copy string");
  });

  it("hides the copy-string affordance with no chassis selected", () => {
    const markup = render({ shareString: null });
    expect(markup).not.toContain("Copy string");
  });

  it("invalid chassisCode still renders the empty-draft prompt rather than throwing", () => {
    const draft: ComposerDraft = { chassisCode: 9999 as ChassisCode, commanderCode: null, mounts: [] };
    expect(() => render({ draft })).not.toThrow();
  });
});
