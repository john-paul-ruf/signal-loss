import { encodeRoster, type Catalog } from "../../../engine";
import type { CompleteMatchLaunchConfig } from "../../store/core";
import { createUserSeed, makeSetupDraft, type PreparedSetup, type SetupPreparationResult } from "../../store/build";

export type RematchResult =
  | { readonly kind: "ok"; readonly launch: CompleteMatchLaunchConfig }
  | { readonly kind: "error"; readonly errorKind: "ENTROPY_UNAVAILABLE" | "PREPARATION_FAILED" | "ENCODE_FAILED"; readonly message: string };

export interface NewSeedRematchDependencies {
  readonly catalog: Catalog;
  readonly entropy: Parameters<typeof createUserSeed>[0];
  prepare(seed: string): Promise<SetupPreparationResult>;
}

export function cloneSameSeedLaunch(launch: CompleteMatchLaunchConfig): CompleteMatchLaunchConfig {
  return { ...launch, human: { ...launch.human }, aiRosters: [...launch.aiRosters], aiRosterShareStrings: [...launch.aiRosterShareStrings] };
}

export async function createNewSeedLaunch(prior: CompleteMatchLaunchConfig, deps: NewSeedRematchDependencies): Promise<RematchResult> {
  const seed = createUserSeed(deps.entropy);
  if (seed.kind === "error") return { kind: "error", errorKind: "ENTROPY_UNAVAILABLE", message: seed.message };
  const generated = await deps.prepare(seed.seed);
  if (generated.kind === "error") return { kind: "error", errorKind: "PREPARATION_FAILED", message: `${generated.failure.stage}: ${generated.failure.message}` };
  return launchFromPrepared(prior, generated.prepared, deps.catalog);
}

export function launchFromPrepared(prior: CompleteMatchLaunchConfig, prepared: PreparedSetup, catalog: Catalog): RematchResult {
  const shares = prepared.aiRosters.map((roster) => encodeRoster(roster, prior.budget, catalog));
  const [a, b, c, d] = shares;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return { kind: "error", errorKind: "ENCODE_FAILED", message: "The regenerated AI rosters could not be encoded." };
  return { kind: "ok", launch: { human: { ...prior.human }, aiRosters: prepared.aiRosters, aiRosterShareStrings: [a, b, c, d], map: prepared.mapResult.map, seed: prepared.seed, budget: prior.budget, aiTier: prior.aiTier, selector: prior.selector, resolvedArchetypeId: prepared.mapResult.map.archetypeId } };
}

export function draftForRematch(prior: CompleteMatchLaunchConfig, seed: string) {
  return makeSetupDraft({ budget: prior.budget, aiTier: prior.aiTier, selector: prior.selector, seed });
}
