/**
 * Match-entry AI deployment coordinator (M17).
 *
 * A framework-free orchestrator: for each launch AI squad it posts one
 * `AI_DEPLOY` request built ONLY from that squad's `PublicState` projection,
 * marks the slot pending, and on completion validates the returned placements
 * through the engine's `legalDeployment` before marking the slot ready. Human
 * drafts and `MatchState` never enter a request — the information boundary
 * (FR-24) is preserved by construction.
 *
 * Determinism (FR-29): the request carries the visible launch seed plus a
 * fixed per-squad stream label, so a re-sent request is byte-identical. No
 * clock, random API, network call, or React import lives here.
 *
 * A worker failure, an unexpected response kind, or an illegal placement is a
 * visible typed error — never a silent fallback or fabricated success. After
 * `cancel()`, late promises call no callback.
 */

import type { Catalog, MatchState, Placement, SquadId } from "../../../engine";
import { emptyOpponentModel, legalDeployment, publicView } from "../../../engine";
import { asDeployOk, type AiClient } from "../../bridge/ai-client";
import type { MatchAiConfig } from "./ai-config";
import type { LaunchSnapshot } from "./types";

export interface StartAiDeploymentInput {
  readonly engine: MatchState;
  readonly catalog: Catalog;
  readonly launch: LaunchSnapshot;
  readonly client: AiClient;
  readonly config: MatchAiConfig;
  readonly onPending: (squad: SquadId, requestId: number) => void;
  readonly onReady: (squad: SquadId, placements: readonly Placement[]) => void;
  readonly onError: (
    squad: SquadId,
    requestId: number,
    errorKind: string,
    message: string,
  ) => void;
}

export interface AiDeploymentRun {
  cancel(): void;
}

/** Fixed per-squad deployment stream label: `ai.squad<N>.deploy`. */
function deployStreamLabel(squad: SquadId): string {
  return `ai.squad${squad as number}.deploy`;
}

/**
 * Post one deployment request per launch AI squad and route each result to
 * the supplied slot callbacks. Returns a run whose `cancel()` aborts every
 * outstanding call and silences any late result.
 */
export function startAiDeployment(input: StartAiDeploymentInput): AiDeploymentRun {
  let active = true;
  const cancels: Array<() => void> = [];

  for (const squad of input.launch.aiSquadIds) {
    const call = input.client.postAiRequest({
      kind: "AI_DEPLOY",
      state: publicView(input.engine, squad, input.catalog),
      squadId: squad as number,
      catalog: input.catalog,
      seed: input.launch.seed,
      streamLabel: deployStreamLabel(squad),
      weights: input.config.weights,
      nodeBudget: input.config.deploymentNodeBudget,
      tier: input.launch.input.aiTier,
      opponentModel: emptyOpponentModel(),
    });
    input.onPending(squad, call.requestId);
    cancels.push(call.cancel);
    call.result
      .then((result) => {
        if (!active) return;
        if (result.kind === "cancelled") return;
        if (result.kind === "error") {
          input.onError(squad, result.requestId, result.errorKind, result.message);
          return;
        }
        const ok = asDeployOk(result);
        if (ok === null) {
          input.onError(
            squad,
            call.requestId,
            "AI_UNEXPECTED_RESPONSE",
            `Expected AI_DEPLOY_OK, got ${result.response.kind}.`,
          );
          return;
        }
        const placements = ok.decision.choice;
        const violations = legalDeployment(input.engine, squad, placements, input.catalog);
        if (violations.length > 0) {
          input.onError(
            squad,
            call.requestId,
            "AI_ILLEGAL_DEPLOYMENT",
            violations.map((v) => `${v.rule}:${v.kind} ${v.message}`).join("; "),
          );
          return;
        }
        input.onReady(squad, placements);
      })
      .catch((err: unknown) => {
        if (!active) return;
        input.onError(
          squad,
          call.requestId,
          "INTERNAL_DEFECT",
          err instanceof Error ? err.message : String(err),
        );
      });
  }

  return {
    cancel(): void {
      if (!active) return;
      active = false;
      for (const cancelCall of cancels) cancelCall();
    },
  };
}
