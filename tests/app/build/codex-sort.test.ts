import { describe, expect, it } from "vitest";
import {
  comparePrimitive,
  nextSort,
  sortWithTiebreak,
  type SortState,
} from "../../../src/app/screens/codex/sort";

interface Row {
  readonly id: string;
  readonly cost: number;
  readonly name: string;
}

const ROWS: readonly Row[] = [
  { id: "c", cost: 5, name: "Gamma" },
  { id: "a", cost: 5, name: "Alpha" },
  { id: "b", cost: 5, name: "Beta" },
  { id: "d", cost: 2, name: "Delta" },
];

describe("codex sort — stable-ID tiebreak", () => {
  it("orders equal primary keys by id ascending, ascending direction", () => {
    const sorted = sortWithTiebreak(ROWS, (r) => r.cost, (r) => r.id, "ascending");
    // cost 2 first (d), then cost 5 ties resolved by id: a, b, c.
    expect(sorted.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps ties in id order even when the primary sort is descending", () => {
    const sorted = sortWithTiebreak(ROWS, (r) => r.cost, (r) => r.id, "descending");
    // cost 5 group first (ties still a,b,c ascending), then cost 2 (d).
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("is order-independent: shuffled input yields identical output", () => {
    const shuffled = [ROWS[2]!, ROWS[0]!, ROWS[3]!, ROWS[1]!];
    const a = sortWithTiebreak(ROWS, (r) => r.cost, (r) => r.id, "ascending");
    const b = sortWithTiebreak(shuffled, (r) => r.cost, (r) => r.id, "ascending");
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("compares strings case-insensitively and numbers numerically", () => {
    expect(comparePrimitive(2, 10)).toBeLessThan(0);
    expect(comparePrimitive("alpha", "Beta")).toBeLessThan(0);
  });

  it("cycles header sort state: new column ascends, same column flips", () => {
    const s0: SortState<"name" | "cost"> = { key: "name", dir: "ascending" };
    expect(nextSort(s0, "cost")).toEqual({ key: "cost", dir: "ascending" });
    expect(nextSort(s0, "name")).toEqual({ key: "name", dir: "descending" });
  });
});
