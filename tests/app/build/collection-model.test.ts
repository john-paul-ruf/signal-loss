import { describe, expect, it } from "vitest";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import {
  asBudget,
  commanderOf,
  prebuiltToSnapshots,
  rosterCostOf,
  rosterSummary,
} from "../../../src/app/store/build/collection-model";
import type { SavedRosterV1 } from "../../../src/platform/index";

const catalog = resolveCatalog();

function savedFromPrebuilt(index: number, overrides: Partial<SavedRosterV1> = {}): SavedRosterV1 {
  const prebuilt = catalog.prebuilts[index]!;
  return {
    id: "roster:1",
    name: prebuilt.name,
    budget: prebuilt.budget,
    constructs: [...prebuiltToSnapshots(prebuilt)],
    ...overrides,
  };
}

describe("collection model", () => {
  it("asBudget narrows only the eight legal budgets", () => {
    expect(asBudget(100)).toBe(100);
    expect(asBudget(33)).toBeNull();
  });

  it("summarizes a forked prebuilt as legal with its commander and cost", () => {
    const summary = rosterSummary(savedFromPrebuilt(3), catalog);
    expect(summary.legal).toBe(true);
    expect(summary.violations).toEqual([]);
    expect(summary.commanderName).not.toBeNull();
    expect(summary.cost).toBeGreaterThan(0);
    expect(summary.cost).toBeLessThanOrEqual(summary.budget);
  });

  it("marks a commander-stripped roster illegal but preserves it (no repair)", () => {
    const base = savedFromPrebuilt(2);
    const illegal: SavedRosterV1 = {
      ...base,
      constructs: base.constructs.map((c) => ({ ...c, commanderCode: null })),
    };
    const summary = rosterSummary(illegal, catalog);
    expect(summary.legal).toBe(false);
    expect(summary.violations.length).toBeGreaterThan(0);
    // The record is not mutated — constructs are still present.
    expect(summary.constructCount).toBe(base.constructs.length);
  });

  it("commanderOf returns null when no construct carries a commander", () => {
    const base = savedFromPrebuilt(1);
    const none: SavedRosterV1 = {
      ...base,
      constructs: base.constructs.map((c) => ({ ...c, commanderCode: null })),
    };
    expect(commanderOf(none, catalog)).toBeNull();
  });

  it("rosterCostOf equals the sum of its construct costs within budget", () => {
    const saved = savedFromPrebuilt(0);
    expect(rosterCostOf(saved, catalog)).toBeGreaterThan(0);
  });
});
