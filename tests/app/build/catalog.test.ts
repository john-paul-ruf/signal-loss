import { describe, expect, it } from "vitest";
import { resolveCatalog } from "../../../src/app/store/build/catalog";

/**
 * Proves the build-zone surfaces read the validated RELEASE catalog object,
 * not mock placeholder values (SESSION-07 checkpoint 1). The release digests
 * are the ones Session 06 recorded; if content changes and these drift, the
 * hash assertions fail loudly rather than the UI silently showing stale data.
 */
describe("app catalog resolution", () => {
  it("resolves the validated release catalog with the shipped shape", () => {
    const catalog = resolveCatalog();
    expect(catalog.chassis.length).toBe(7);
    expect(catalog.mounts.length).toBe(11);
    expect(catalog.commanderTypes.length).toBe(4);
    expect(catalog.prebuilts.length).toBe(8);
    expect(catalog.hardpointTypes.length).toBe(4);
  });

  it("carries the release catalog + tunables hashes", () => {
    const catalog = resolveCatalog();
    expect(catalog.hashes.catalog).toBe("18a634daecb23aef");
    expect(catalog.hashes.tunables).toBe("81071539e5673d96");
  });

  it("memoizes: repeated resolution returns the same object", () => {
    expect(resolveCatalog()).toBe(resolveCatalog());
  });

  it("every chassis exposes a non-empty dial and a declared curve family", () => {
    for (const chassis of resolveCatalog().chassis) {
      expect(chassis.dial.length).toBeGreaterThan(0);
      expect(["degrade", "spike", "inversion"]).toContain(chassis.curveFamily);
    }
  });
});
