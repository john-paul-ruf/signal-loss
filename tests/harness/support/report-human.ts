/**
 * Human-readable formatter for battery reports. Every threshold and
 * observed value is printed so the same evidence is visible whether the
 * consumer reads JSON or ASCII. Output is deterministic byte-for-byte.
 */

import type { AllReport, BatteryReport } from "./report-types";

export function formatReport(report: BatteryReport | AllReport): string {
  if (report.battery === "all") return formatAll(report as AllReport);
  return formatBattery(report as BatteryReport);
}

function formatBattery(report: BatteryReport): string {
  const lines: string[] = [];
  lines.push(`battery: ${report.battery}`);
  lines.push(`passed: ${report.passed}`);
  lines.push(`catalogHash: ${report.catalogHash}`);
  lines.push(`tunablesHash: ${report.tunablesHash}`);
  lines.push(
    `sample: seed=${report.sample.baseSeed} count=${report.sample.seedCount} partitions=${report.sample.partitions}`,
  );
  if (report.sample.explicitSeeds !== undefined) {
    lines.push(`  explicitSeeds: ${report.sample.explicitSeeds.join(",")}`);
  }
  lines.push("");
  for (const c of report.checks) {
    lines.push(`[${c.passed ? "PASS" : "FAIL"}] ${c.id}: ${c.message}`);
    lines.push(`    observed: ${formatKv(c.observed)}`);
    lines.push(`    threshold: ${formatKv(c.threshold)}`);
    if (c.failingSeeds !== undefined && c.failingSeeds.length > 0) {
      lines.push(`    failingSeeds (first ${c.failingSeeds.length}): ${c.failingSeeds.join(",")}`);
    }
  }
  return lines.join("\n") + "\n";
}

function formatAll(report: AllReport): string {
  const lines: string[] = [];
  lines.push(`battery: all`);
  lines.push(`passed: ${report.passed}`);
  lines.push(`sourceRevision: ${report.sourceRevision}`);
  lines.push(`catalogHash: ${report.catalogHash}`);
  lines.push(`tunablesHash: ${report.tunablesHash}`);
  lines.push("");
  for (const child of report.children) {
    lines.push(`  ${child.battery}: passed=${child.passed} digest=${child.digest}`);
  }
  return lines.join("\n") + "\n";
}

function formatKv(record: Readonly<Record<string, number | string | boolean>>): string {
  const keys = Object.keys(record).slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts = keys.map((k) => `${k}=${String(record[k])}`);
  return parts.join(" ");
}
