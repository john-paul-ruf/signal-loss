import { describe, expect, it } from "vitest";
import {
  encodeRoster,
  type Budget,
  type DecodeResult,
  type Roster,
} from "../../../src/engine/index";
import { resolveCatalog } from "../../../src/app/store/build/catalog";
import {
  prebuiltToSnapshots,
  snapshotToConstruct,
} from "../../../src/app/store/build/collection-model";
import {
  exportRoster,
  importShareString,
  outcomeFromDecode,
} from "../../../src/app/store/build/share";
import type { SavedRosterV1 } from "../../../src/platform/index";

const catalog = resolveCatalog();

/** Engine roster built from a release prebuilt's snapshots. */
function prebuiltRoster(index: number): { roster: Roster; budget: Budget } {
  const prebuilt = catalog.prebuilts[index]!;
  const snapshots = prebuiltToSnapshots(prebuilt);
  return {
    roster: { constructs: snapshots.map(snapshotToConstruct) },
    budget: prebuilt.budget,
  };
}

describe("share import — the four decode outcomes plus round-trip (FR-7)", () => {
  it("empty input is a distinct empty state", () => {
    expect(importShareString("   ", catalog).status).toBe("empty");
  });

  it("round-trips a legal roster and states its budget", () => {
    const { roster, budget } = prebuiltRoster(0);
    const encoded = encodeRoster(roster, budget, catalog);
    const outcome = importShareString(encoded, catalog);
    expect(outcome.status).toBe("ok-roster");
    if (outcome.status === "ok-roster") {
      expect(outcome.budget).toBe(budget);
      expect(outcome.snapshots.length).toBe(roster.constructs.length);
    }
  });

  it("rejects a malformed string with a MALFORMED treatment", () => {
    expect(importShareString("not-a-share-string", catalog).status).toBe("malformed");
    expect(importShareString("SL1-!!!!not-base64", catalog).status).toBe("malformed");
  });

  it("maps every decode failure kind to a distinct treatment (FR-7)", () => {
    // The public encoder validates codes, so UNKNOWN_ENTRY / VERSION_UNSUPPORTED
    // cannot be produced by encode — the mapping is verified directly.
    const malformed: DecodeResult = { ok: false, error: { kind: "MALFORMED", message: "bad", offset: 7 } };
    const unknown: DecodeResult = { ok: false, error: { kind: "UNKNOWN_ENTRY", code: 99, entry: "mount" } };
    const illegal: DecodeResult = { ok: false, error: { kind: "ILLEGAL", violations: [] } };
    const version: DecodeResult = { ok: false, error: { kind: "VERSION_UNSUPPORTED", version: 2 } };

    expect(outcomeFromDecode(malformed).status).toBe("malformed");
    const u = outcomeFromDecode(unknown);
    expect(u.status).toBe("unknown");
    if (u.status === "unknown") {
      expect(u.code).toBe(99);
      expect(u.entry).toBe("mount");
    }
    expect(outcomeFromDecode(illegal).status).toBe("illegal");
    const v = outcomeFromDecode(version);
    expect(v.status).toBe("version");
    if (v.status === "version") expect(v.version).toBe(2);
  });

  it("rejects a structurally-valid but illegal roster and never repairs it", () => {
    // Same constructs as a legal prebuilt, but with every commander tag removed
    // → FR-3 (exactly one commander) fails; decode surfaces ILLEGAL.
    const { roster, budget } = prebuiltRoster(1);
    const stripped: Roster = {
      constructs: roster.constructs.map((c) => ({ ...c, commanderCode: null })),
    };
    const encoded = encodeRoster(stripped, budget, catalog);
    const outcome = importShareString(encoded, catalog);
    expect(outcome.status).toBe("illegal");
    if (outcome.status === "illegal") expect(outcome.violations.length).toBeGreaterThan(0);
  });
});

describe("share export (FR-7)", () => {
  it("exports a legal saved roster to a re-importable SL1 string", () => {
    const { budget } = prebuiltRoster(2);
    const saved: SavedRosterV1 = {
      id: "roster:1",
      name: "TEST",
      budget,
      constructs: [...prebuiltToSnapshots(catalog.prebuilts[2]!)],
    };
    const encoded = exportRoster(saved, catalog);
    expect(encoded).not.toBeNull();
    if (encoded !== null) {
      const back = importShareString(encoded, catalog);
      expect(back.status).toBe("ok-roster");
    }
  });

  it("returns null when the roster budget is not a legal export budget", () => {
    const saved: SavedRosterV1 = {
      id: "roster:2",
      name: "WEIRD",
      budget: 33,
      constructs: [...prebuiltToSnapshots(catalog.prebuilts[0]!)],
    };
    expect(exportRoster(saved, catalog)).toBeNull();
  });
});
