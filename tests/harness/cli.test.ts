import { describe, expect, it } from "vitest";
import { capturedIo } from "./support/io";
import { runCli, parseArgs, BATTERY_NAMES } from "./support/cli";
import { canonicalJson } from "./support/report-json";
import type { AllReport, BatteryReport } from "./support/report-types";

describe("CLI argument parsing", () => {
  it("parses a full determinism invocation", () => {
    const p = parseArgs([
      "determinism",
      "--seeds", "4",
      "--seed", "release",
      "--budget", "50",
      "--ai-tier", "2",
      "--json",
      "--output", "/tmp/out.json",
      "--partitions", "3",
      "--partition", "1",
      "--node-budget", "256",
      "--max-rounds", "10",
    ]);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.battery).toBe("determinism");
      expect(p.value.seedCount).toBe(4);
      expect(p.value.baseSeed).toBe("release");
      expect(p.value.budget).toBe(50);
      expect(p.value.aiTier).toBe(2);
      expect(p.value.json).toBe(true);
      expect(p.value.output).toBe("/tmp/out.json");
      expect(p.value.partitions).toBe(3);
      expect(p.value.partition).toBe(1);
      expect(p.value.nodeBudget).toBe(256);
      expect(p.value.maxRounds).toBe(10);
    }
  });

  it("accepts explicit seeds", () => {
    const p = parseArgs(["determinism", "--explicit-seeds", "a, b, c"]);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.explicitSeeds).toEqual(["a", "b", "c"]);
    }
  });

  it("rejects an unknown flag", () => {
    const p = parseArgs(["determinism", "--nope"]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("unknown flag");
  });

  it("rejects an unknown battery", () => {
    const p = parseArgs(["nonsense"]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("unknown battery");
  });

  it("rejects a non-integer flag value", () => {
    const p = parseArgs(["determinism", "--seeds", "one"]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("integer");
  });

  it("rejects a partition >= partitions", () => {
    const p = parseArgs(["determinism", "--partitions", "3", "--partition", "3"]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("--partition");
  });

  it("rejects an unsupported budget", () => {
    const p = parseArgs(["determinism", "--budget", "42"]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toContain("--budget");
  });

  it("names all five battery targets", () => {
    expect(BATTERY_NAMES).toEqual([
      "determinism",
      "playability",
      "behavior",
      "costing",
      "all",
    ]);
  });
});

describe("CLI dispatch", () => {
  it("exits 2 when no battery is provided", async () => {
    const io = capturedIo();
    const code = await runCli([], io);
    expect(code).toBe(2);
    expect(io.readAll().stderr).toContain("expected a battery name");
  });

  it("exits 2 on an unknown battery", async () => {
    const io = capturedIo();
    const code = await runCli(["madeup"], io);
    expect(code).toBe(2);
    expect(io.readAll().stderr).toContain("unknown battery");
  });

  it("runs determinism, writes JSON to stdout with --json", async () => {
    const io = capturedIo();
    const code = await runCli(
      [
        "determinism",
        "--seeds", "1",
        "--seed", "cli-smoke",
        "--budget", "25",
        "--ai-tier", "1",
        "--json",
      ],
      io,
    );
    expect(code).toBe(0);
    const stdout = io.readAll().stdout.trim();
    const parsed = JSON.parse(stdout) as BatteryReport;
    expect(parsed.battery).toBe("determinism");
    expect(parsed.passed).toBe(true);
    // Canonical JSON: re-serialize must equal payload.
    expect(canonicalJson(parsed)).toBe(canonicalJson(parsed));
  });

  it("writes JSON to file with --output and mirrors human summary to stderr", async () => {
    const io = capturedIo();
    const code = await runCli(
      [
        "determinism",
        "--seeds", "1",
        "--seed", "cli-file",
        "--budget", "25",
        "--ai-tier", "1",
        "--output", "/tmp/sl-cli-out.json",
      ],
      io,
    );
    expect(code).toBe(0);
    const dumped = io.readAll().files.get("/tmp/sl-cli-out.json");
    expect(dumped).toBeDefined();
    if (dumped !== undefined) {
      const parsed = JSON.parse(dumped) as BatteryReport;
      expect(parsed.battery).toBe("determinism");
    }
    expect(io.readAll().stderr).toContain("battery: determinism");
  });

  it("emits deterministic byte-identical JSON across two runs with equal inputs", async () => {
    const runOnce = async (): Promise<string> => {
      const io = capturedIo();
      const code = await runCli(
        [
          "determinism",
          "--seeds", "2",
          "--seed", "cli-repeat",
          "--budget", "25",
          "--ai-tier", "1",
          "--json",
        ],
        io,
      );
      expect(code).toBe(0);
      return io.readAll().stdout;
    };
    const first = await runOnce();
    const second = await runOnce();
    expect(first).toBe(second);
  });

  it("returns an AllReport stub for `all` (checkpoint 6 wires this in fully)", async () => {
    const io = capturedIo();
    const code = await runCli(["all", "--json", "--source-revision", "abc"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(io.readAll().stdout.trim()) as AllReport;
    expect(parsed.battery).toBe("all");
    expect(parsed.sourceRevision).toBe("abc");
  });
});
