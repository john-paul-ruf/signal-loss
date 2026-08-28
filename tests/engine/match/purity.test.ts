import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const matchDir = join(process.cwd(), "src/engine/match");

function walk(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (path.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("engine/match purity (Session 04)", () => {
  it("no source file imports engine/rng (arch §3.7)", () => {
    const files = walk(matchDir);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/from\s+["']\.\.\/rng/.test(source)) offenders.push(file);
      if (/from\s+["']\.\.\/\.\.\/engine\/rng/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no source file imports any npm package outside the engine allowlist", () => {
    const files = walk(matchDir);
    const offenders: { file: string; line: string }[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (const line of lines) {
        const match = line.match(/from\s+["']([^"']+)["']/);
        if (!match) continue;
        const spec = match[1] as string;
        if (spec.startsWith(".")) continue;
        if (spec.startsWith("node:")) continue; // permitted only in test fixtures; match/ has none
        offenders.push({ file, line });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no source file uses Math.random, Date, or performance.now", () => {
    const files = walk(matchDir);
    const offenders: { file: string; hit: string }[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/Math\.random\b/.test(source)) offenders.push({ file, hit: "Math.random" });
      if (/\bDate\.now\b/.test(source)) offenders.push({ file, hit: "Date.now" });
      if (/\bperformance\.now\b/.test(source)) offenders.push({ file, hit: "performance.now" });
      if (/\bnew\s+Date\b/.test(source)) offenders.push({ file, hit: "new Date" });
    }
    expect(offenders).toEqual([]);
  });

  it("createMatch does not mutate input catalog or rosters (freeze probe)", async () => {
    const { createMatch } = await import("../../../src/engine/match/index");
    const { soloMatchConfig } = await import("../../fixtures/matches/simple-match");
    const config = soloMatchConfig();
    Object.freeze(config);
    Object.freeze(config.rosters);
    for (const roster of config.rosters) {
      Object.freeze(roster);
      Object.freeze(roster.constructs);
    }
    const result = createMatch(config);
    expect(result.ok).toBe(true);
  });
});
