/**
 * Boot screen structural tests. Uses `react-dom/server` renderToStaticMarkup
 * (Session 01's toolchain has no jsdom); interactive viewport-gating and axe
 * are covered by the Playwright e2e specs under tests/e2e/build. These assert
 * the status readouts derive from the loaded release catalog, not mock claims.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Boot } from "../../../src/app/screens/boot/Boot";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import { APP_VERSION } from "../../../src/app/store/build/app-info";

describe("Boot screen", () => {
  const markup = renderToStaticMarkup(<Boot />);
  const catalog = resolveCatalog();

  it("states the real catalog counts and hash, not mock placeholders", () => {
    expect(markup).toContain(`>${catalog.chassis.length}</span> CHASSIS`);
    expect(markup).toContain(`>${catalog.mounts.length}</span> MOUNTS`);
    expect(markup).toContain(catalog.hashes.catalog);
    // The mock's illustrative build/catalog claims must not survive.
    expect(markup).not.toContain("0.4.1");
    expect(markup).toContain(APP_VERSION);
  });

  it("renders the contract line and all five squad tags", () => {
    expect(markup).toContain("INTENT IS THE ONLY UNKNOWN");
    for (const tag of ["VC", "AX", "KS", "HL", "NS"]) {
      expect(markup).toContain(`>${tag}</span>`);
    }
  });

  it("exposes the three entry points as navigable links", () => {
    expect(markup).toContain('href="#/setup"');
    expect(markup).toContain('href="#/build"');
    expect(markup).toContain('href="#/codex"');
    expect(markup).toContain("New Match");
    expect(markup).toContain("Build Zone");
    expect(markup).toContain("Codex");
  });

  it("states the desktop-only minimum viewport", () => {
    expect(markup).toContain("1280×720 MINIMUM");
  });
});
