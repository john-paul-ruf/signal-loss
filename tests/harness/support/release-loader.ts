/**
 * Shared release-catalog loader. Lives under `tests/harness/support/` so
 * `tsconfig.app.json`'s include list picks it up for typechecking; both the
 * self-tests here and the CLI under `../../../../harness/cli.ts` import it
 * via relative paths.
 *
 * The engine (M05) is deliberately dependency-free — `loadCatalog` accepts a
 * `RawCatalogBundle` object rather than a filesystem path. This module is the
 * file-system adapter that reads the six-file `./data/` bundle and hands the
 * parsed object to the engine's validator.
 *
 * Never invoked from `./src/engine/**`. Never uses `Date` / clocks / `Math.random`
 * in a rule-affecting path — the file-read side effects live entirely outside
 * the engine boundary.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
import {
  type Catalog,
  type CatalogError,
  type RawCatalogBundle,
  loadCatalog,
} from "../../../src/engine/index";

/** Relative-to-repo-root path to the release data directory. */
export const RELEASE_DATA_DIR = "data";

/** The six JSON files that make up the release bundle. */
export interface ReleaseFileSet {
  readonly chassisPath: string;
  readonly mountsPath: string;
  readonly commandersPath: string;
  readonly prebuiltsPath: string;
  readonly tunablesPath: string;
  readonly archetypesPath: string;
}

/**
 * Repo root — resolved from this module's own URL rather than from the
 * process cwd so tests and CLI runs behave identically regardless of the
 * caller's working directory.
 */
export function repoRoot(): string {
  const here = fileURLToPath(import.meta.url);
  // tests/harness/support/release-loader.ts → repo root is three parent
  // directories up from the file's dirname (support → harness → tests → root).
  return pathResolve(dirname(here), "..", "..", "..");
}

/** Resolve the default release file set relative to the repo root. */
export function defaultReleaseFileSet(baseDir: string = repoRoot()): ReleaseFileSet {
  return {
    chassisPath: pathResolve(baseDir, RELEASE_DATA_DIR, "catalog.chassis.json"),
    mountsPath: pathResolve(baseDir, RELEASE_DATA_DIR, "catalog.mounts.json"),
    commandersPath: pathResolve(baseDir, RELEASE_DATA_DIR, "catalog.commanders.json"),
    prebuiltsPath: pathResolve(baseDir, RELEASE_DATA_DIR, "catalog.prebuilts.json"),
    tunablesPath: pathResolve(baseDir, RELEASE_DATA_DIR, "tunables.json"),
    archetypesPath: pathResolve(baseDir, RELEASE_DATA_DIR, "map.archetypes.json"),
  };
}

/**
 * Read + parse each release file. Throws with a precise message on I/O or
 * JSON-parse failure — the harness treats those as unrecoverable.
 */
export function readReleaseBundle(
  files: ReleaseFileSet = defaultReleaseFileSet(),
): RawCatalogBundle {
  const chassisDoc = readJson<{ hardpointTypes: unknown; chassis: unknown }>(files.chassisPath);
  const mountsDoc = readJson<{ mounts: unknown }>(files.mountsPath);
  const commandersDoc = readJson<{ commanders: unknown }>(files.commandersPath);
  const prebuiltsDoc = readJson<{ prebuilts: unknown }>(files.prebuiltsPath);
  const tunablesDoc = readJson<{ tunables: unknown }>(files.tunablesPath);
  const archetypesDoc = readJson<{ mapArchetypes: unknown }>(files.archetypesPath);
  return {
    hardpointTypes: chassisDoc.hardpointTypes,
    chassis: chassisDoc.chassis,
    mounts: mountsDoc.mounts,
    commanders: commandersDoc.commanders,
    prebuilts: prebuiltsDoc.prebuilts,
    tunables: tunablesDoc.tunables,
    mapArchetypes: archetypesDoc.mapArchetypes,
  };
}

/**
 * Read the release bundle, validate via the engine, and return either the
 * loaded Catalog or every validation error. Never partially loads.
 */
export function loadReleaseCatalog(
  files: ReleaseFileSet = defaultReleaseFileSet(),
):
  | { readonly ok: true; readonly value: Catalog }
  | { readonly ok: false; readonly error: readonly CatalogError[] } {
  const bundle = readReleaseBundle(files);
  const result = loadCatalog(bundle);
  if (result.ok) return { ok: true, value: result.value };
  return { ok: false, error: result.error };
}

/**
 * Format a set of CatalogErrors for human-readable output. Deterministic
 * ordering: identical inputs produce identical strings.
 */
export function formatCatalogErrors(errors: readonly CatalogError[]): string {
  const lines = errors.slice().map((e) => `  [${e.kind}] ${e.path}: ${e.message}`);
  return lines.join("\n");
}

function readJson<T>(path: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`readJson: cannot read ${path}: ${message}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`readJson: invalid JSON in ${path}: ${message}`);
  }
}
