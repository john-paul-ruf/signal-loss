/**
 * "all" battery aggregator — runs every sub-battery, digests each
 * result, and returns a single AllReport binding source revision +
 * catalog / tunables hashes + per-child digest to one artifact.
 *
 * Determinism: the AllReport payload EXCLUDES per-child diagnostics
 * (wall-clock durations, etc.); two runs on identical inputs produce
 * byte-identical AllReport JSON.
 */

import type { Budget, Catalog } from "../../../src/engine/index";
import type { AllReport, BatteryReport, BatteryName } from "./report-types";
import { runDeterminismBattery } from "./determinism";
import { runPlayabilityBattery } from "./playability";
import { runBehaviorBattery } from "./behavior";
import { runCostingBattery } from "./costing";
import { reportDigest } from "./report-json";
import { generateSeedSet } from "./seeds";

export interface AllOptions {
  readonly catalog: Catalog;
  readonly sourceRevision: string;
  readonly seedCount?: number;
  readonly baseSeed?: string;
}

export function runAllBattery(options: AllOptions): AllReport {
  const {
    catalog,
    sourceRevision,
    seedCount = 4,
    baseSeed = "release",
  } = options;
  const seeds = generateSeedSet(baseSeed, seedCount);

  const children: {
    battery: Exclude<BatteryName, "all">;
    passed: boolean;
    digest: string;
  }[] = [];

  const runners: {
    battery: Exclude<BatteryName, "all">;
    fn: () => BatteryReport;
  }[] = [
    {
      battery: "determinism",
      fn: () => runDeterminismBattery({
        catalog,
        seeds,
        budget: 25,
        aiTier: 2,
        baseSeedLabel: baseSeed,
      }),
    },
    {
      battery: "playability",
      fn: () => runPlayabilityBattery({
        catalog,
        seedCount,
        baseSeed,
      }),
    },
    {
      battery: "behavior",
      fn: () => runBehaviorBattery({
        catalog,
        seedCount: Math.min(seedCount, 2),
        baseSeed,
      }),
    },
    {
      battery: "costing",
      fn: () => runCostingBattery({
        catalog,
        seedCount: Math.min(seedCount, 2),
        baseSeed,
        // Restrict to the smallest budgets in `all` — the low-budget
        // deployments are the only ones with a small enough roster to
        // deploy inside the standard spawn regions reliably. Larger
        // budgets are still covered by the dedicated `costing` CI job.
        budgets: [25 as Budget, 50 as Budget],
      }),
    },
  ];

  for (const { battery, fn } of runners) {
    const report = fn();
    children.push({
      battery,
      passed: report.passed,
      digest: reportDigest(report),
    });
  }

  return {
    formatVersion: 1,
    battery: "all",
    passed: children.every((c) => c.passed),
    sourceRevision,
    catalogHash: catalog.hashes.catalog,
    tunablesHash: catalog.hashes.tunables,
    children,
  };
}
