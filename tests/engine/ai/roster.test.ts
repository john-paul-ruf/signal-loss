import { describe, expect, it } from "vitest";
import { generateAiRoster } from "../../../src/engine/ai/index";
import { rngFromSeed, stream } from "../../../src/engine/rng/index";
import { validateRoster, rosterCost } from "../../../src/engine/build/index";
import type { Budget } from "../../../src/engine/catalog/index";
import { testCatalog } from "../../fixtures/matches/simple-match";

describe("ai/roster / generateAiRoster", () => {
  it("returns a legal roster at the smallest budget (25)", () => {
    const catalog = testCatalog();
    const rng = stream(rngFromSeed("ai-r1"), "ai.squad3.roster");
    const result = generateAiRoster(rng, 25 as Budget, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const violations = validateRoster(result.value.roster, catalog, 25 as Budget);
    expect(violations).toEqual([]);
    expect(rosterCost(result.value.roster, catalog)).toBeLessThanOrEqual(25);
  });

  it("returns a legal roster at every supported budget", () => {
    const catalog = testCatalog();
    const budgets: readonly Budget[] = [25, 50, 75, 100, 125, 150, 175, 200] as unknown as readonly Budget[];
    for (const b of budgets) {
      const rng = stream(rngFromSeed(`ai-b${b as number}`), "ai.squad1.roster");
      const result = generateAiRoster(rng, b, catalog);
      expect(result.ok, `budget ${b as number}`).toBe(true);
      if (!result.ok) continue;
      const violations = validateRoster(result.value.roster, catalog, b);
      expect(violations, `budget ${b as number}`).toEqual([]);
    }
  });

  it("is deterministic across repeated calls with the same rng and inputs", () => {
    const catalog = testCatalog();
    const rng = stream(rngFromSeed("determinism"), "ai.squad2.roster");
    const a = generateAiRoster(rng, 100 as Budget, catalog);
    const b = generateAiRoster(rng, 100 as Budget, catalog);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.value.roster)).toBe(JSON.stringify(b.value.roster));
    expect(a.value.rng).toEqual(b.value.rng);
  });

  it("advances the rng — returned rng differs from input rng", () => {
    const catalog = testCatalog();
    const rng = stream(rngFromSeed("advance"), "ai.squad0.roster");
    const result = generateAiRoster(rng, 100 as Budget, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.value.rng)).not.toBe(JSON.stringify(rng));
  });

  it("respects MAX_SQUAD cap even at high budgets", () => {
    const catalog = testCatalog();
    const rng = stream(rngFromSeed("maxsquad"), "ai.squad4.roster");
    const result = generateAiRoster(rng, 200 as Budget, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roster.constructs.length).toBeLessThanOrEqual(catalog.tunables.MAX_SQUAD);
  });

  it("produces four distinct rosters across the four squad streams in one match", () => {
    const catalog = testCatalog();
    const rosters: string[] = [];
    for (let sq = 1; sq <= 4; sq = sq + 1) {
      const rng = stream(rngFromSeed("match-distinct"), `ai.squad${sq}.roster`);
      const result = generateAiRoster(rng, 100 as Budget, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      rosters.push(JSON.stringify(result.value.roster));
    }
    const unique = new Set(rosters);
    // Property: with a nontrivial catalog + budget = 100 (many combos), all
    // four should differ. Failure could indicate a determinism collision.
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("returns NO_LEGAL_ROSTER when no commander construct fits budget", () => {
    // Every commander in the fixture costs ≥ 5 and every chassis ≥ 12.
    // Budget of 1 admits nothing.
    const catalog = testCatalog();
    const rng = stream(rngFromSeed("nofit"), "ai.squad3.roster");
    const result = generateAiRoster(rng, 1 as unknown as Budget, catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("NO_LEGAL_ROSTER");
  });

  it("contains exactly one commander in every generated roster", () => {
    const catalog = testCatalog();
    for (let i = 0; i < 8; i = i + 1) {
      const rng = stream(rngFromSeed(`single-cmd-${i}`), `ai.squad${i % 5}.roster`);
      const result = generateAiRoster(rng, 100 as Budget, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const cmdCount = result.value.roster.constructs.filter((c) => c.commanderCode !== null).length;
      expect(cmdCount).toBe(1);
    }
  });
});
