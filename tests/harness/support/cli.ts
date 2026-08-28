/**
 * Harness CLI. Parses argv, loads the release catalog, dispatches to the
 * requested battery, formats + writes the report, and returns an exit
 * code. Every side effect goes through the injected `HarnessIo` so tests
 * can capture and assert on output.
 *
 * Supported invocations:
 *
 *   sl determinism [--seeds N] [--json] [--output PATH] [--seed BASE]
 *                  [--explicit-seeds A,B,C] [--budget B] [--ai-tier T]
 *                  [--partitions P] [--partition K]
 *
 *   sl playability | behavior | costing | all  (checkpoint-3..6 wire-in)
 *
 * Flags:
 *   --seeds N            Number of seeds (default 8).
 *   --seed BASE          Base seed string (default "release").
 *   --explicit-seeds LIST  Comma-separated explicit seed list (overrides
 *                        --seeds / --seed for the sample).
 *   --budget B           Budget value (25, 50, ..., 200). Default 100.
 *   --ai-tier T          1 | 2 | 3 (default 2).
 *   --json               Emit JSON to stdout (or --output).
 *   --output PATH        Write output to file. When set, human summary
 *                        goes to stderr; JSON goes to the file.
 *   --partitions P       Total partitions (default 1).
 *   --partition K        This partition index (default 0).
 *   --node-budget N      AI per-decision node budget (default 384).
 *   --max-rounds N       Cap rounds (default catalog.tunables value).
 *
 * Unknown flags return nonzero and useful text on stderr.
 */

import { BUDGETS } from "../../../src/engine/index";
import type { Budget, Catalog } from "../../../src/engine/index";
import type { HarnessIo } from "./io";
import { runDeterminismBattery } from "./determinism";
import { runPlayabilityBattery } from "./playability";
import { formatReport } from "./report-human";
import type { AllReport, BatteryName, BatteryReport } from "./report-types";
import { serializeReport } from "./report-json";
import { loadReleaseCatalog, formatCatalogErrors } from "./release-loader";
import { generateSeedSet, parseSeedList, partitionSeeds } from "./seeds";

export interface CliFlags {
  readonly battery: BatteryName | null;
  readonly seedCount: number;
  readonly baseSeed: string;
  readonly explicitSeeds: readonly string[] | null;
  readonly budget: Budget;
  readonly aiTier: 1 | 2 | 3;
  readonly json: boolean;
  readonly output: string | null;
  readonly partitions: number;
  readonly partition: number;
  readonly nodeBudget: number;
  readonly maxRounds: number | null;
  readonly sourceRevision: string;
}

const DEFAULT_FLAGS: CliFlags = {
  battery: null,
  seedCount: 8,
  baseSeed: "release",
  explicitSeeds: null,
  budget: 100 as Budget,
  aiTier: 2,
  json: false,
  output: null,
  partitions: 1,
  partition: 0,
  nodeBudget: 384,
  maxRounds: null,
  sourceRevision: "unknown",
};

const BATTERY_NAMES: readonly BatteryName[] = [
  "determinism",
  "playability",
  "behavior",
  "costing",
  "all",
];

/**
 * Programmatic entry point. Returns an exit code; the CLI wrapper
 * (`harness/cli.ts`) calls `process.exit(...)`. Never throws — every
 * failure is turned into a nonzero exit code + explanatory stderr text.
 */
export async function runCli(
  argv: readonly string[],
  io: HarnessIo,
): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.writeStderr(`sl: ${parsed.error}\n`);
    return 2;
  }
  const flags = parsed.value;
  if (flags.battery === null) {
    io.writeStderr(`sl: expected a battery name (one of ${BATTERY_NAMES.join(", ")})\n`);
    return 2;
  }

  const catalog = loadReleaseCatalog();
  if (!catalog.ok) {
    io.writeStderr(`sl: release catalog validation failed\n${formatCatalogErrors(catalog.error)}\n`);
    return 3;
  }

  const seeds = resolveSeeds(flags);
  if (seeds.length === 0) {
    io.writeStderr(`sl: no seeds after applying partition (partition=${flags.partition}/${flags.partitions})\n`);
    return 2;
  }

  let report: BatteryReport | AllReport;
  switch (flags.battery) {
    case "determinism": {
      report = runDeterminismBattery({
        catalog: catalog.value,
        seeds,
        budget: flags.budget,
        aiTier: flags.aiTier,
        baseSeedLabel: flags.baseSeed,
        partitions: flags.partitions,
      });
      break;
    }
    case "playability": {
      report = runPlayabilityBattery({
        catalog: catalog.value,
        seedCount: seeds.length,
        baseSeed: flags.baseSeed,
        partitions: flags.partitions,
      });
      break;
    }
    case "behavior":
    case "costing":
      report = notYetImplementedReport(flags.battery, catalog.value, seeds, flags);
      break;
    case "all":
      report = allNotYetImplementedReport(catalog.value, flags);
      break;
    default: {
      io.writeStderr(`sl: unknown battery ${flags.battery satisfies never}\n`);
      return 2;
    }
  }

  const jsonPayload = serializeReport(report);
  if (flags.output !== null) {
    io.writeFile(flags.output, jsonPayload);
    io.writeStderr(formatReport(report));
  } else if (flags.json) {
    io.writeStdout(jsonPayload);
    io.writeStdout("\n");
  } else {
    io.writeStdout(formatReport(report));
  }

  return report.passed ? 0 : 1;
}

/* ------------------------------------------------------------------------- */
/* Argument parsing                                                          */
/* ------------------------------------------------------------------------- */

interface ParseOk {
  readonly ok: true;
  readonly value: CliFlags;
}
interface ParseErr {
  readonly ok: false;
  readonly error: string;
}
type Parsed = ParseOk | ParseErr;

export function parseArgs(argv: readonly string[]): Parsed {
  const out: {
    -readonly [K in keyof CliFlags]: CliFlags[K];
  } = { ...DEFAULT_FLAGS };
  let i = 0;
  if (i < argv.length) {
    const first = argv[i];
    if (first !== undefined && !first.startsWith("--")) {
      if (!(BATTERY_NAMES as readonly string[]).includes(first)) {
        return { ok: false, error: `unknown battery ${JSON.stringify(first)}` };
      }
      out.battery = first as BatteryName;
      i = i + 1;
    }
  }
  while (i < argv.length) {
    const raw = argv[i];
    if (raw === undefined) break;
    i = i + 1;
    switch (raw) {
      case "--seeds": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--seeds", v);
        if (!n.ok) return n;
        out.seedCount = n.value;
        break;
      }
      case "--seed": {
        const v = argv[i];
        i = i + 1;
        if (v === undefined) return { ok: false, error: `--seed requires a value` };
        out.baseSeed = v;
        break;
      }
      case "--explicit-seeds": {
        const v = argv[i];
        i = i + 1;
        if (v === undefined) return { ok: false, error: `--explicit-seeds requires a comma-separated list` };
        const parsed = parseSeedList(v);
        if (parsed.length === 0) return { ok: false, error: `--explicit-seeds must contain at least one entry` };
        out.explicitSeeds = parsed;
        break;
      }
      case "--budget": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--budget", v);
        if (!n.ok) return n;
        if (!(BUDGETS as readonly number[]).includes(n.value)) {
          return { ok: false, error: `--budget must be one of ${BUDGETS.join(", ")}; got ${n.value}` };
        }
        out.budget = n.value as Budget;
        break;
      }
      case "--ai-tier": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--ai-tier", v);
        if (!n.ok) return n;
        if (n.value !== 1 && n.value !== 2 && n.value !== 3) {
          return { ok: false, error: `--ai-tier must be 1, 2, or 3; got ${n.value}` };
        }
        out.aiTier = n.value;
        break;
      }
      case "--json":
        out.json = true;
        break;
      case "--output": {
        const v = argv[i];
        i = i + 1;
        if (v === undefined) return { ok: false, error: `--output requires a path` };
        out.output = v;
        break;
      }
      case "--partitions": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--partitions", v);
        if (!n.ok) return n;
        if (n.value < 1) return { ok: false, error: `--partitions must be >= 1` };
        out.partitions = n.value;
        break;
      }
      case "--partition": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--partition", v);
        if (!n.ok) return n;
        if (n.value < 0) return { ok: false, error: `--partition must be >= 0` };
        out.partition = n.value;
        break;
      }
      case "--node-budget": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--node-budget", v);
        if (!n.ok) return n;
        if (n.value < 1) return { ok: false, error: `--node-budget must be >= 1` };
        out.nodeBudget = n.value;
        break;
      }
      case "--max-rounds": {
        const v = argv[i];
        i = i + 1;
        const n = intFlag("--max-rounds", v);
        if (!n.ok) return n;
        out.maxRounds = n.value;
        break;
      }
      case "--source-revision": {
        const v = argv[i];
        i = i + 1;
        if (v === undefined) return { ok: false, error: `--source-revision requires a value` };
        out.sourceRevision = v;
        break;
      }
      default:
        return { ok: false, error: `unknown flag ${JSON.stringify(raw)}` };
    }
  }
  if (out.partition >= out.partitions) {
    return { ok: false, error: `--partition (${out.partition}) must be < --partitions (${out.partitions})` };
  }
  return { ok: true, value: out };
}

function intFlag(name: string, raw: string | undefined): { ok: true; value: number } | ParseErr {
  if (raw === undefined) return { ok: false, error: `${name} requires an integer value` };
  if (!/^-?[0-9]+$/.test(raw)) return { ok: false, error: `${name} expects an integer; got ${JSON.stringify(raw)}` };
  const n = parseInt(raw, 10);
  return { ok: true, value: n };
}

function resolveSeeds(flags: CliFlags): readonly string[] {
  const base = flags.explicitSeeds !== null
    ? flags.explicitSeeds
    : generateSeedSet(flags.baseSeed, flags.seedCount);
  if (flags.partitions === 1) return base;
  return partitionSeeds(base, flags.partition, flags.partitions).seeds;
}

/**
 * Placeholder report for batteries the later checkpoints will implement.
 * Kept passing so `sl determinism` (the checkpoint-2 gate) does not
 * incorrectly signal a downstream failure.
 */
function notYetImplementedReport(
  battery: Exclude<BatteryName, "all" | "determinism">,
  catalog: Catalog,
  seeds: readonly string[],
  flags: CliFlags,
): BatteryReport {
  return {
    formatVersion: 1,
    battery,
    passed: true,
    catalogHash: catalog.hashes.catalog,
    tunablesHash: catalog.hashes.tunables,
    sample: {
      baseSeed: flags.baseSeed,
      seedCount: seeds.length,
      partitions: flags.partitions,
    },
    checks: [
      {
        id: "NOT_YET_IMPLEMENTED",
        passed: true,
        observed: { battery },
        threshold: { requiredBy: `Session 06 checkpoint that owns ${battery}` },
        message: `${battery} battery is a stub in this checkpoint.`,
      },
    ],
    evidence: {},
  };
}

function allNotYetImplementedReport(
  catalog: Catalog,
  flags: CliFlags,
): AllReport {
  return {
    formatVersion: 1,
    battery: "all",
    passed: true,
    sourceRevision: flags.sourceRevision,
    catalogHash: catalog.hashes.catalog,
    tunablesHash: catalog.hashes.tunables,
    children: [],
  };
}

/* ------------------------------------------------------------------------- */
/* Utility re-exports                                                        */
/* ------------------------------------------------------------------------- */

export { canonicalJson, reportDigest } from "./report-json";
export { BATTERY_NAMES };
