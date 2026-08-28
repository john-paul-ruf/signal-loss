/**
 * Report schema shared by every battery. Every field is deterministic —
 * no wall-clock timestamps, no host names, nothing that would make two
 * runs of the same input diverge byte-for-byte.
 *
 * The harness `all` report embeds the source revision (`sourceRevision`
 * comes from the caller — usually a `GIT_SHA` env var; the harness never
 * shells out to git itself), catalog / tunables digests, sample specs,
 * and each child battery's report digest.
 */

export const REPORT_FORMAT_VERSION = 1 as const;

export type BatteryName = "determinism" | "playability" | "behavior" | "costing" | "all";

/** Per-check pass/fail with observed / threshold evidence. */
export interface CheckResult {
  readonly id: string;
  readonly passed: boolean;
  readonly observed: Readonly<Record<string, number | string | boolean>>;
  readonly threshold: Readonly<Record<string, number | string | boolean>>;
  readonly message: string;
  /** Ordered list of failing seeds (or scenarios) — capped at `failingSeedCap`. */
  readonly failingSeeds?: readonly string[];
}

/** Sample definition — what seeds were considered, how many, how partitioned. */
export interface SampleSpec {
  readonly baseSeed: string;
  readonly seedCount: number;
  readonly partitions: number;
  /** Optional explicit list — used when the caller supplied `--seeds a,b,c`. */
  readonly explicitSeeds?: readonly string[];
}

/**
 * Aggregate report for one battery run. `catalogHash` / `tunablesHash` are
 * echoed from the loaded catalog so the report is self-describing.
 */
export interface BatteryReport {
  readonly formatVersion: typeof REPORT_FORMAT_VERSION;
  readonly battery: BatteryName;
  readonly passed: boolean;
  readonly catalogHash: string;
  readonly tunablesHash: string;
  readonly sample: SampleSpec;
  readonly checks: readonly CheckResult[];
  /** Structured evidence table (per-check aggregates, cross-runtime hashes, etc.). */
  readonly evidence: Readonly<Record<string, unknown>>;
  /** Non-identity diagnostics (wall-clock durations, node counts) — excluded from hash. */
  readonly diagnostics?: Readonly<Record<string, unknown>>;
}

/** `all` — one entry per sub-battery plus a payload digest of each. */
export interface AllReport {
  readonly formatVersion: typeof REPORT_FORMAT_VERSION;
  readonly battery: "all";
  readonly passed: boolean;
  readonly sourceRevision: string;
  readonly catalogHash: string;
  readonly tunablesHash: string;
  readonly children: readonly {
    readonly battery: Exclude<BatteryName, "all">;
    readonly passed: boolean;
    readonly digest: string;
  }[];
}
