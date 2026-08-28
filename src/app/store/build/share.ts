/**
 * Share-string import/export for the collection surface (FR-7). Import is a
 * persistent screen state, never a toast: the four distinguishable decode
 * failure kinds (MALFORMED · UNKNOWN_ENTRY · ILLEGAL · VERSION_UNSUPPORTED)
 * map to four distinct outcomes. Import never silently repairs an illegal
 * roster — an ILLEGAL decode surfaces the violations and cannot be added.
 */

import {
  decode,
  encodeConstruct,
  encodeRoster,
  type Catalog,
  type DecodeResult,
  type Violation,
} from "../../../engine/index";
import type { ConstructSnapshotV1, SavedRosterV1 } from "../../../platform/index";
import { asBudget, constructToSnapshot, rosterToEngineRoster } from "./collection-model";

export type ImportOutcome =
  | { readonly status: "empty" }
  | {
      readonly status: "ok-roster";
      readonly budget: number;
      readonly snapshots: readonly ConstructSnapshotV1[];
      readonly message: string;
    }
  | {
      readonly status: "ok-construct";
      readonly snapshot: ConstructSnapshotV1;
      readonly message: string;
    }
  | { readonly status: "malformed"; readonly message: string; readonly offset: number | null }
  | {
      readonly status: "unknown";
      readonly message: string;
      readonly code: number;
      readonly entry: string;
    }
  | { readonly status: "illegal"; readonly message: string; readonly violations: readonly Violation[] }
  | { readonly status: "version"; readonly message: string; readonly version: number };

/** Decode a pasted share string into a persistent, presentable import state. */
export function importShareString(text: string, catalog: Catalog): ImportOutcome {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { status: "empty" };
  return outcomeFromDecode(decode(trimmed, catalog));
}

/**
 * Map a codec `DecodeResult` to the persistent import screen state. Split out
 * from `importShareString` so the four distinct failure treatments (FR-7) are
 * unit-testable without hand-crafting checksum-valid wire strings.
 */
export function outcomeFromDecode(result: DecodeResult): ImportOutcome {
  if (result.ok) {
    if (result.value.kind === "roster") {
      const snapshots = result.value.roster.constructs.map(constructToSnapshot);
      return {
        status: "ok-roster",
        budget: result.value.budget,
        snapshots,
        message: `OK — roster built for ${result.value.budget} pts (${snapshots.length} constructs)`,
      };
    }
    return {
      status: "ok-construct",
      snapshot: constructToSnapshot(result.value.construct),
      message: "OK — single construct",
    };
  }

  const error = result.error;
  switch (error.kind) {
    case "MALFORMED":
      return {
        status: "malformed",
        message: error.offset === undefined ? error.message : `${error.message} (at char ${error.offset})`,
        offset: error.offset ?? null,
      };
    case "UNKNOWN_ENTRY":
      return {
        status: "unknown",
        message: `Unknown ${error.entry} code ${error.code} — not in this catalog`,
        code: error.code,
        entry: error.entry,
      };
    case "ILLEGAL":
      return {
        status: "illegal",
        message: `Illegal roster — ${error.violations.length} violation(s); import never repairs`,
        violations: error.violations,
      };
    case "VERSION_UNSUPPORTED":
      return {
        status: "version",
        message: `Unsupported format version ${error.version} — this build cannot read it`,
        version: error.version,
      };
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

/**
 * Export a saved roster as an SL1 share string, or null if its budget is not
 * one of the eight legal values (a structurally-illegal record is still
 * exportable only when its budget is a real `Budget`).
 */
export function exportRoster(roster: SavedRosterV1, catalog: Catalog): string | null {
  const budget = asBudget(roster.budget);
  if (budget === null) return null;
  return encodeRoster(rosterToEngineRoster(roster), budget, catalog);
}

/** Export a single construct snapshot as an SL1 share string. */
export function exportConstructSnapshot(snapshot: ConstructSnapshotV1, catalog: Catalog): string {
  return encodeConstruct(
    {
      chassisCode: snapshot.chassisCode as never,
      commanderCode: snapshot.commanderCode as never,
      mounts: snapshot.mounts.map((m) => ({ hardpointIndex: m.hardpointIndex, mountCode: m.mountCode as never })),
    },
    catalog,
  );
}
