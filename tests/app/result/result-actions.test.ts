import { describe, expect, it } from "vitest";
import { cloneSameSeedLaunch, createNewSeedLaunch } from "../../../src/app/components/result/result-actions";
import { resolveCatalog } from "../../../src/app/store/build";
import type { CompleteMatchLaunchConfig } from "../../../src/app/store/core";
import { buildSimpleMap } from "../../fixtures/maps/simple";

const roster = { constructs: [{ chassisCode: 10 as never, commanderCode: 1 as never, mounts: [] }] };
const launch: CompleteMatchLaunchConfig = { human: { source: { kind: "saved", id: "roster:1", name: "R" }, roster, shareString: "human" }, aiRosters: [roster, roster, roster, roster], aiRosterShareStrings: ["a", "b", "c", "d"], map: buildSimpleMap("old"), seed: "old", budget: 50, aiTier: 1, selector: { kind: "any" }, resolvedArchetypeId: "arena" as never };

describe("result rematch actions", () => {
  it("clones same-seed input without changing reproducibility bytes", () => { const copy = cloneSameSeedLaunch(launch); expect(copy).toEqual(launch); expect(copy).not.toBe(launch); });
  it("preserves the old launch when preparation fails", async () => {
    const outcome = await createNewSeedLaunch(launch, { catalog: resolveCatalog(), entropy: { getRandomValues(array) { (array as Uint32Array).fill(1); return array; } }, prepare: async () => ({ kind: "error", failure: { stage: "MAP", streamLabel: null, errorKind: "WORKER_DOWN", message: "down" } }) });
    expect(outcome).toEqual({ kind: "error", errorKind: "PREPARATION_FAILED", message: "MAP: down" });
    expect(launch.seed).toBe("old");
  });
});
