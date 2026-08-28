import { describe, expect, it } from "vitest";
import {
  generateSeedSet,
  mergePartitions,
  parseSeedList,
  partitionSeeds,
} from "./support/seeds";

describe("harness seed helpers", () => {
  it("generateSeedSet produces the requested count and stable ordering", () => {
    const seeds = generateSeedSet("release", 5);
    expect(seeds).toEqual([
      "release#0",
      "release#1",
      "release#2",
      "release#3",
      "release#4",
    ]);
  });

  it("generateSeedSet returns [] for count = 0", () => {
    expect(generateSeedSet("release", 0)).toEqual([]);
  });

  it("partitionSeeds assigns k -> k % total canonically", () => {
    const seeds = generateSeedSet("s", 10);
    const p0 = partitionSeeds(seeds, 0, 3);
    const p1 = partitionSeeds(seeds, 1, 3);
    const p2 = partitionSeeds(seeds, 2, 3);
    expect(p0.seeds).toEqual(["s#0", "s#3", "s#6", "s#9"]);
    expect(p1.seeds).toEqual(["s#1", "s#4", "s#7"]);
    expect(p2.seeds).toEqual(["s#2", "s#5", "s#8"]);
  });

  it("mergePartitions reconstructs canonical order", () => {
    const seeds = generateSeedSet("m", 12);
    const partitions = [0, 1, 2, 3].map((i) => partitionSeeds(seeds, i, 4));
    const merged = mergePartitions(partitions);
    expect(merged).toEqual(seeds);
  });

  it("mergePartitions matches a single-process run byte-for-byte", () => {
    const seeds = generateSeedSet("cross", 7);
    const partitions = [0, 1, 2].map((i) => partitionSeeds(seeds, i, 3));
    expect(mergePartitions(partitions)).toEqual(seeds);
  });

  it("mergePartitions rejects mixed totals", () => {
    const seeds = generateSeedSet("z", 6);
    const p0 = partitionSeeds(seeds, 0, 2);
    const p1 = { ...partitionSeeds(seeds, 1, 3), total: 3 };
    expect(() => mergePartitions([p0, p1])).toThrow(/mixed total/);
  });

  it("parseSeedList trims and drops empties, preserves order", () => {
    expect(parseSeedList("a, b ,c,,d")).toEqual(["a", "b", "c", "d"]);
    expect(parseSeedList("")).toEqual([]);
    expect(parseSeedList("only")).toEqual(["only"]);
  });

  it("partitionSeeds rejects out-of-range partition index", () => {
    const seeds = generateSeedSet("z", 3);
    expect(() => partitionSeeds(seeds, 5, 3)).toThrow(/index/);
    expect(() => partitionSeeds(seeds, 0, 0)).toThrow(/total/);
  });
});
