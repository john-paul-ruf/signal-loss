/**
 * App-side catalog resolution. The engine (M05) is filesystem-free — it
 * validates a `RawCatalogBundle` object. In the browser the six release JSON
 * files are imported statically (bundled, NFR-7: nothing is fetched at
 * runtime) and assembled into that bundle here.
 *
 * This is the single source of the validated `Catalog` for every build-zone
 * surface (boot status, codex, collection, composer, setup). Catalog load is
 * all-or-nothing (FR-30): an invalid release catalog throws, and the root
 * error boundary renders the fault in-product rather than shipping a partial
 * catalog.
 */

import {
  loadCatalog,
  type Catalog,
  type CatalogError,
  type RawCatalogBundle,
} from "../../../engine/index";
import chassisDoc from "../../../../data/catalog.chassis.json";
import mountsDoc from "../../../../data/catalog.mounts.json";
import commandersDoc from "../../../../data/catalog.commanders.json";
import prebuiltsDoc from "../../../../data/catalog.prebuilts.json";
import tunablesDoc from "../../../../data/tunables.json";
import archetypesDoc from "../../../../data/map.archetypes.json";

let cached: Catalog | null = null;

/** Assemble the raw bundle from the imported release documents. */
function releaseBundle(): RawCatalogBundle {
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

/** Format catalog errors deterministically for a fail-loud message. */
export function formatCatalogErrors(errors: readonly CatalogError[]): string {
  return errors.map((e) => `[${e.kind}] ${e.path}: ${e.message}`).join("; ");
}

/**
 * Resolve the validated release catalog, memoized. Throws on validation
 * failure — the same all-or-nothing contract the harness enforces.
 */
export function resolveCatalog(): Catalog {
  if (cached !== null) return cached;
  const result = loadCatalog(releaseBundle());
  if (!result.ok) {
    throw new Error(
      `Release catalog failed validation: ${formatCatalogErrors(result.error)}`,
    );
  }
  cached = result.value;
  return cached;
}
