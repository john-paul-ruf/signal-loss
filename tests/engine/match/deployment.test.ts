import { describe, expect, it } from "vitest";
import {
  applyDeployments,
  createMatch,
  legalDeployment,
  squadId,
} from "../../../src/engine/match/index";
import type { Placement } from "../../../src/engine/match/index";
import {
  soloCenterPlacements,
  soloMatchConfig,
} from "../../fixtures/matches/simple-match";

describe("match/deployment / legalDeployment", () => {
  it("accepts a placement inside the spawn region", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const region = created.value.map.spawns[0];
    if (region === undefined) throw new Error("no spawn 0");
    const errors = legalDeployment(
      created.value,
      squadId(0),
      [{ rosterIndex: 0, position: region.anchor }],
      config.catalog,
    );
    expect(errors).toEqual([]);
  });

  it("rejects placement outside the spawn region", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const other = created.value.map.spawns[1];
    if (other === undefined) throw new Error("no spawn 1");
    const errors = legalDeployment(
      created.value,
      squadId(0),
      [{ rosterIndex: 0, position: other.anchor }],
      config.catalog,
    );
    expect(errors.some((v) => v.kind === "OUTSIDE_SPAWN_REGION")).toBe(true);
  });

  it("rejects overlapping placements (single construct duplicated)", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const region = created.value.map.spawns[0];
    if (region === undefined) throw new Error("no spawn 0");
    const errors = legalDeployment(
      created.value,
      squadId(0),
      [
        { rosterIndex: 0, position: region.anchor },
        { rosterIndex: 0, position: region.anchor },
      ] as readonly Placement[],
      config.catalog,
    );
    expect(errors.some((v) => v.kind === "ROSTER_INDEX_DUPLICATE")).toBe(true);
  });

  it("reports partial deployment", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const errors = legalDeployment(
      created.value,
      squadId(0),
      [] as readonly Placement[],
      config.catalog,
    );
    expect(errors.some((v) => v.kind === "PARTIAL_DEPLOYMENT")).toBe(true);
  });
});

describe("match/deployment / applyDeployments", () => {
  it("transitions to MOVEMENT_PLOT round 1 and confirms own positions", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const applied = applyDeployments(
      created.value,
      soloCenterPlacements(created.value),
      config.catalog,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.phase).toBe("MOVEMENT_PLOT");
    expect(applied.value.round).toBe(1);
    // Own known positions confirmed at round 1.
    for (let sq = 0; sq < 5; sq = sq + 1) {
      const own = applied.value.knownPositions.filter(
        (k) => (k.observer as number) === sq && (k.subject as number) === sq,
      );
      expect(own).toHaveLength(1);
      expect(own[0]?.confirmedRound).toBe(1);
    }
    // Known positions are sorted by (observer, subject).
    for (let i = 1; i < applied.value.knownPositions.length; i = i + 1) {
      const prev = applied.value.knownPositions[i - 1]!;
      const cur = applied.value.knownPositions[i]!;
      const prevKey = (prev.observer as number) * 1_000_000 + (prev.subject as number);
      const curKey = (cur.observer as number) * 1_000_000 + (cur.subject as number);
      expect(curKey).toBeGreaterThan(prevKey);
    }
  });

  it("rejects a mixed valid+invalid batch as one failure", () => {
    const config = soloMatchConfig();
    const created = createMatch(config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const good = soloCenterPlacements(created.value);
    // Squad 3 deploys into squad 0's region.
    const badRegion = created.value.map.spawns[0]!;
    const bad = good.map((p, i) => (i === 3 ? [{ rosterIndex: 0, position: badRegion.anchor }] : p));
    const applied = applyDeployments(
      created.value,
      bad as unknown as Parameters<typeof applyDeployments>[1],
      config.catalog,
    );
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error.some((v) => v.kind === "OUTSIDE_SPAWN_REGION")).toBe(true);
  });
});
