/**
 * Deterministic JSON serialization for battery reports. Object keys are
 * emitted in lexicographic order so two byte-identical runs produce
 * byte-identical output. The `diagnostics` payload — used for non-identity
 * wall-clock measurements — is excluded from the payload used for report
 * digest comparison.
 */

import { fnv1a64Hex } from "../../../src/engine/index";
import type { AllReport, BatteryReport } from "./report-types";

/**
 * Canonical stringifier — lexicographic key order, arrays preserved.
 * Rejects non-finite numbers as those would silently coerce to `null`.
 */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`canonicalJson: non-finite number ${value}.`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => stringify(v));
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .slice()
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stringify(record[k])}`);
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported ${typeof value}.`);
}

/**
 * Serialize a report. `diagnostics` is stripped by
 * `serializeReportIdentity` when a caller wants two runs' identity
 * payloads compared without wall-clock noise; keep it in the on-disk
 * artifact for humans.
 */
export function serializeReport(report: BatteryReport | AllReport): string {
  return canonicalJson(report);
}

export function serializeReportIdentity(report: BatteryReport | AllReport): string {
  if ((report as BatteryReport).diagnostics === undefined) {
    return canonicalJson(report);
  }
  const clone = { ...(report as BatteryReport) };
  delete (clone as { diagnostics?: unknown }).diagnostics;
  return canonicalJson(clone);
}

/**
 * FNV-1a-64 hex digest of a canonical JSON payload — used to fold child
 * reports into an `all` bundle and to compare cross-runtime outputs.
 */
export function reportDigest(report: BatteryReport | AllReport): string {
  return fnv1a64Hex(serializeReportIdentity(report));
}
