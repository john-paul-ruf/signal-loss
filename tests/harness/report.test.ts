import { describe, expect, it } from "vitest";
import { canonicalJson, reportDigest, serializeReport, serializeReportIdentity } from "./support/report-json";
import { formatReport } from "./support/report-human";
import type { AllReport, BatteryReport } from "./support/report-types";

const sampleReport: BatteryReport = {
  formatVersion: 1,
  battery: "determinism",
  passed: true,
  catalogHash: "aaaaaaaaaaaaaaaa",
  tunablesHash: "bbbbbbbbbbbbbbbb",
  sample: {
    baseSeed: "release",
    seedCount: 3,
    partitions: 1,
    explicitSeeds: ["release#0", "release#1", "release#2"],
  },
  checks: [
    {
      id: "REPLAY_IDENTITY",
      passed: true,
      observed: { totalSeeds: 3, replayIdentical: 3 },
      threshold: { requiredIdenticalRuns: 2 },
      message: "identical",
    },
  ],
  evidence: {},
};

describe("canonical JSON", () => {
  it("emits object keys in lexicographic order", () => {
    const out = canonicalJson({ b: 2, a: 1, c: 3 });
    expect(out).toBe(`{"a":1,"b":2,"c":3}`);
  });

  it("preserves array order", () => {
    const out = canonicalJson([3, 1, 2]);
    expect(out).toBe("[3,1,2]");
  });

  it("throws on non-finite numbers", () => {
    expect(() => canonicalJson(NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson(Infinity)).toThrow(/non-finite/);
  });

  it("byte-identical output for two independent serializations of the same payload", () => {
    const a = serializeReport(sampleReport);
    const b = serializeReport(sampleReport);
    expect(a).toBe(b);
  });
});

describe("report identity payload", () => {
  it("excludes diagnostics when present", () => {
    const withDiag: BatteryReport = { ...sampleReport, diagnostics: { wallClockMs: 42 } };
    const identity = serializeReportIdentity(withDiag);
    const identityWithout = serializeReportIdentity(sampleReport);
    expect(identity).toBe(identityWithout);
  });

  it("reportDigest is a 16-char lowercase hex string", () => {
    const digest = reportDigest(sampleReport);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it("reportDigest stays stable across two reports with different diagnostics", () => {
    const a: BatteryReport = { ...sampleReport, diagnostics: { wallClockMs: 100 } };
    const b: BatteryReport = { ...sampleReport, diagnostics: { wallClockMs: 200 } };
    expect(reportDigest(a)).toBe(reportDigest(b));
  });
});

describe("human formatter", () => {
  it("prints every check with observed/threshold key-value evidence", () => {
    const text = formatReport(sampleReport);
    expect(text).toContain("battery: determinism");
    expect(text).toContain("[PASS] REPLAY_IDENTITY");
    expect(text).toContain("observed: replayIdentical=3 totalSeeds=3");
    expect(text).toContain("threshold: requiredIdenticalRuns=2");
  });

  it("prints all-report envelope", () => {
    const all: AllReport = {
      formatVersion: 1,
      battery: "all",
      passed: true,
      sourceRevision: "abc",
      catalogHash: "aaaaaaaaaaaaaaaa",
      tunablesHash: "bbbbbbbbbbbbbbbb",
      children: [
        { battery: "determinism", passed: true, digest: "1111111111111111" },
      ],
    };
    const text = formatReport(all);
    expect(text).toContain("battery: all");
    expect(text).toContain("determinism: passed=true");
  });
});
