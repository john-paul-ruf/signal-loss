/**
 * Deterministic table sorting for the codex (FR-1). Every sort ends in a
 * stable-ID tiebreak so equal primary keys never depend on input order — the
 * same total-order discipline the engine applies to rule sorts (architecture
 * §4.3), carried into the reference UI.
 */

export type SortDir = "ascending" | "descending";

export interface SortState<K extends string> {
  readonly key: K;
  readonly dir: SortDir;
}

/** Numbers compare numerically; strings compare case-insensitively. */
export function comparePrimitive(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Cycle a header's sort state: new column → ascending; same column → flip. */
export function nextSort<K extends string>(prev: SortState<K>, key: K): SortState<K> {
  if (prev.key !== key) return { key, dir: "ascending" };
  return { key, dir: prev.dir === "ascending" ? "descending" : "ascending" };
}

/**
 * Sort by a keyed extractor with an explicit ascending stable-ID tiebreak.
 * The tiebreak is direction-independent so ties render in the same order
 * whether the primary sort is ascending or descending.
 */
export function sortWithTiebreak<T>(
  items: readonly T[],
  extract: (item: T) => string | number,
  id: (item: T) => string,
  dir: SortDir,
): readonly T[] {
  const factor = dir === "ascending" ? 1 : -1;
  return items.slice().sort((a, b) => {
    const primary = comparePrimitive(extract(a), extract(b));
    if (primary !== 0) return primary * factor;
    return id(a).localeCompare(id(b));
  });
}
