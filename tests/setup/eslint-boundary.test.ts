import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * A single shared ESLint instance for the negative-fixture suite. We build it
 * with `overrideConfigFile` pointing at the project's real flat config so the
 * rules under test are exactly the rules that ship.
 */
function makeEslint(): ESLint {
  return new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: resolve(REPO_ROOT, "eslint.config.js"),
    errorOnUnmatchedPattern: false,
  });
}

async function lint(source: string, virtualPath: string): Promise<ESLint.LintResult> {
  const eslint = makeEslint();
  const [result] = await eslint.lintText(source, { filePath: virtualPath });
  if (result === undefined) {
    throw new Error(`ESLint returned no result for ${virtualPath}`);
  }
  return result;
}

function ruleIds(result: ESLint.LintResult): readonly string[] {
  return result.messages
    .map((m) => m.ruleId)
    .filter((id): id is string => id !== null);
}

describe("eslint boundary — engine purity", () => {
  it("bans Math.random inside the engine", async () => {
    const source = "export function seed(): number { return Math.random(); }\n";
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-random.ts"));
    expect(ruleIds(result)).toContain("no-restricted-properties");
  });

  it("bans Date.now inside the engine", async () => {
    const source = "export function now(): number { return Date.now(); }\n";
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-clock.ts"));
    expect(ruleIds(result)).toContain("no-restricted-properties");
  });

  it("bans performance.now inside the engine", async () => {
    const source =
      "export function ms(): number { return performance.now(); }\n";
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-perf.ts"));
    expect(ruleIds(result)).toContain("no-restricted-properties");
  });

  it("bans Math.hypot inside the engine", async () => {
    const source =
      "export function d(a: number, b: number): number { return Math.hypot(a, b); }\n";
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-hypot.ts"));
    expect(ruleIds(result)).toContain("no-restricted-properties");
  });

  it("bans importing React from the engine", async () => {
    const source = 'import * as React from "react";\nexport const R = React;\n';
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-react.ts"));
    expect(ruleIds(result)).toContain("no-restricted-imports");
  });

  it("bans importing any npm package from the engine", async () => {
    const source = 'import z from "zustand";\nexport const s = z;\n';
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-npm.ts"));
    expect(ruleIds(result)).toContain("no-restricted-imports");
  });

  it("bans an engine .sort() call without a comparator", async () => {
    const source =
      "export function s(xs: number[]): number[] { return xs.slice().sort(); }\n";
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/forbidden-sort.ts"));
    expect(ruleIds(result)).toContain("no-restricted-syntax");
  });

  it("permits Math.sqrt inside the fx module (isqrt seed)", async () => {
    const source = "export function s(n: number): number { return Math.sqrt(n); }\n";
    const result = await lint(source, resolve(REPO_ROOT, "src/engine/fx/allowed-sqrt.ts"));
    expect(ruleIds(result)).not.toContain("no-restricted-properties");
  });

  it("bans importing from ./src/app inside the engine (no-restricted-paths)", async () => {
    const source =
      'import { registeredRoutes } from "../../app/route-registry";\nexport const r = registeredRoutes;\n';
    const result = await lint(
      source,
      resolve(REPO_ROOT, "src/engine/fx/forbidden-app-import.ts"),
    );
    // Either the path-boundary rule or the npm-ban rule may fire; the
    // guarantee is that at least one engine-boundary rule flags this file.
    const ids = ruleIds(result);
    const flagged =
      ids.includes("import/no-restricted-paths") || ids.includes("no-restricted-imports");
    expect(flagged).toBe(true);
  });
});

describe("eslint boundary — repo-wide", () => {
  it("bans dangerouslySetInnerHTML anywhere in src/", async () => {
    const source =
      'export function X(): JSX.Element { return <div dangerouslySetInnerHTML={{__html: "x"}} />; }\n';
    const result = await lint(
      source,
      resolve(REPO_ROOT, "src/app/forbidden-danger.tsx"),
    );
    const ids = ruleIds(result);
    const flagged =
      ids.includes("no-restricted-syntax") || ids.includes("react/no-danger");
    expect(flagged).toBe(true);
  });
});
