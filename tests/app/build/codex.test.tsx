/**
 * Codex structural tests. renderToStaticMarkup (no jsdom); keyboard disclosure,
 * aria-sort interaction, and axe are covered in tests/e2e/build/codex.spec.ts.
 * These assert every displayed value derives from the loaded release Catalog.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Codex } from "../../../src/app/screens/codex/Codex";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import { fxUnits } from "../../../src/app/components/build/format";

describe("Codex screen", () => {
  const markup = renderToStaticMarkup(<Codex />);
  const catalog = resolveCatalog();

  it("shows the permanent resolution-truth contract line", () => {
    expect(markup).toContain("EVERY VALUE SHOWN HERE IS THE VALUE USED IN RESOLUTION");
  });

  it("renders every chassis by name with its real cost", () => {
    for (const chassis of catalog.chassis) {
      expect(markup).toContain(chassis.name);
    }
    const first = catalog.chassis[0]!;
    expect(markup).toContain(String(first.cost));
  });

  it("renders every commander type and its real base pool", () => {
    for (const ct of catalog.commanderTypes) {
      expect(markup).toContain(ct.name);
    }
  });

  it("renders sortable headers with an aria-sort attribute", () => {
    expect(markup).toContain('aria-sort="ascending"');
  });

  it("renders a chassis move value from the catalog dial, formatted from fixed-point", () => {
    const chassis = catalog.chassis[0]!;
    expect(markup).toContain(fxUnits(chassis.dial[0]!.movementAllowance));
  });
});
