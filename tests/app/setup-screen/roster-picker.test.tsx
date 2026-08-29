import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Catalog, Roster } from "../../../src/engine";
import type { SavedRosterV1 } from "../../../src/platform";
import { RosterPicker, type RosterPickerProps } from "../../../src/app/components/setup/RosterPicker";

/** Flatten the returned element tree so keys can be inspected before React renders it. */
function collectElements(node: ReactNode, acc: ReactElement[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child as ReactNode, acc);
    return;
  }
  if (!isValidElement(node)) return;
  acc.push(node);
  const props = node.props as { children?: ReactNode };
  if (props.children !== undefined) collectElements(props.children, acc);
}

function elementClassName(element: ReactElement): string {
  const props = element.props as { className?: string };
  return props.className ?? "";
}

function elementText(element: ReactElement): string {
  const props = element.props as { children?: ReactNode };
  return typeof props.children === "string" ? props.children : "";
}

describe("RosterPicker excluded-row identity", () => {
  const savedScout = {
    id: "roster:1",
    name: "SCOUT PATROL",
    budget: 80,
    constructs: [],
  } as unknown as SavedRosterV1;

  const catalog = {
    prebuilts: [
      { id: "prebuilt:scout", name: "SCOUT PATROL", budget: 60, constructs: [] },
      { id: "prebuilt:vanguard", name: "VANGUARD", budget: 100, constructs: [] },
    ],
  } as unknown as Catalog;

  const props: RosterPickerProps = {
    catalog,
    budget: 100,
    saved: [savedScout],
    selected: null,
    onSelect: () => {},
    toRoster: () => ({ constructs: [] }) as unknown as Roster,
    prebuiltRoster: () => ({ constructs: [{}, {}] }) as unknown as Roster,
    violations: () => [],
  };

  const elements: ReactElement[] = [];
  collectElements(RosterPicker(props), elements);
  const excludedRows = elements.filter(
    (element) => element.type === "p" && elementClassName(element).includes("mt-1 font-mono"),
  );

  it("renders both duplicate-label excluded rows without hiding either", () => {
    const labels = excludedRows.map(elementText);
    expect(labels.filter((label) => label === "SCOUT PATROL · NOT BUILT AT 100")).toHaveLength(2);
  });

  it("keys the two identical labels by distinct source-derived identity", () => {
    const keys = excludedRows.map((element) => element.key);
    expect(keys).toContain("saved-roster:1");
    expect(keys).toContain("prebuilt-prebuilt:scout");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("still renders a legal choice keyed by its source identity", () => {
    const legal = elements.find((element) => element.type === "button" && element.key === "prebuilt-prebuilt:vanguard");
    expect(legal).toBeDefined();
    const label = elements.find((element) => element.type === "span" && elementText(element) === "VANGUARD · PREBUILT");
    expect(label).toBeDefined();
  });
});
