/**
 * Build-zone store facade. Currently the validated release-catalog resolver
 * and app metadata; the composer/collection/setup draft stores are added in
 * later checkpoints of this session under this same subtree.
 */

export { resolveCatalog, formatCatalogErrors } from "./catalog";
export { APP_VERSION } from "./app-info";
export {
  SQUAD_LADDER,
  type SquadIdentity,
} from "./squad-identity";
