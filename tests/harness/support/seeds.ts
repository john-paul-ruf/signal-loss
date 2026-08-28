/**
 * Seed helpers for the batteries. Every seed is a plain string; the engine
 * hashes it internally to obtain a PCG32 state. Nothing here reads a clock.
 */

export interface SeedPartition {
  readonly partition: number;
  readonly total: number;
  readonly seeds: readonly string[];
}

/**
 * Produce `count` deterministic seed strings anchored at `base`. Seeds
 * are `<base>#<index>` — the `#` separator is not otherwise used by the
 * engine's seed hashing so it never collides with a user-supplied seed.
 */
export function generateSeedSet(base: string, count: number): readonly string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`generateSeedSet: expected non-negative integer count; got ${count}.`);
  }
  const out: string[] = [];
  for (let i = 0; i < count; i = i + 1) {
    out.push(`${base}#${i}`);
  }
  return out;
}

/**
 * Split a seed list into `total` equal-ish partitions and return
 * partition `index` (0-based). Partition assignment is stable — seed `k`
 * always lands in partition `k % total`, so re-running with a different
 * partition count still covers every seed uniquely.
 */
export function partitionSeeds(
  seeds: readonly string[],
  index: number,
  total: number,
): SeedPartition {
  if (!Number.isInteger(total) || total < 1) {
    throw new RangeError(`partitionSeeds: expected total >= 1; got ${total}.`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    throw new RangeError(`partitionSeeds: expected 0 <= index < total; got index=${index} total=${total}.`);
  }
  const out: string[] = [];
  for (let i = 0; i < seeds.length; i = i + 1) {
    if (i % total !== index) continue;
    const seed = seeds[i];
    if (seed === undefined) continue;
    out.push(seed);
  }
  return { partition: index, total, seeds: out };
}

/**
 * Merge partitioned seed lists back into the canonical order. If any seed
 * appears in multiple partitions (e.g. by mistake) the first occurrence
 * wins — the caller can additionally assert uniqueness on the returned list.
 */
export function mergePartitions(
  partitions: readonly SeedPartition[],
): readonly string[] {
  if (partitions.length === 0) return [];
  const total = partitions[0]?.total ?? 0;
  for (const p of partitions) {
    if (p.total !== total) {
      throw new RangeError(`mergePartitions: mixed total values (${p.total} vs ${total}).`);
    }
  }
  // Reconstruct canonical index order by interleaving.
  // Every partition holds seeds with index % total === partition; the
  // combined size equals partition.seeds.length * total (± remainder).
  const buffers = partitions
    .slice()
    .sort((a, b) => a.partition - b.partition)
    .map((p) => p.seeds.slice());
  const out: string[] = [];
  const cursors = buffers.map(() => 0);
  let index = 0;
  const seen = new Set<string>();
  // Continue until every buffer's cursor equals its buffer length.
  // Sum of buffer lengths is the total seed count.
  let remaining = buffers.reduce((n, b) => n + b.length, 0);
  while (remaining > 0) {
    const partition = index % total;
    const buf = buffers[partition];
    const cursor = cursors[partition];
    if (buf !== undefined && cursor !== undefined && cursor < buf.length) {
      const seed = buf[cursor];
      if (seed !== undefined) {
        if (!seen.has(seed)) {
          out.push(seed);
          seen.add(seed);
        }
        cursors[partition] = cursor + 1;
        remaining = remaining - 1;
      }
    }
    index = index + 1;
    // Guard against infinite loops when partitions are internally inconsistent.
    if (index > buffers.reduce((n, b) => n + b.length, 0) * total + total) {
      throw new Error("mergePartitions: could not reconstruct sequence (internal defect).");
    }
  }
  return out;
}

/**
 * Parse a comma-separated seed list. Trims whitespace, drops empty
 * entries. Deterministic: preserves input order.
 */
export function parseSeedList(input: string): readonly string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
