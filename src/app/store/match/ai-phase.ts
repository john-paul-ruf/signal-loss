import type {
  Catalog,
  MatchState,
  OpponentModel,
  SquadAttackPlot,
  SquadId,
  SquadMovePlots,
} from "../../../engine";
import { legalAttackPlot, legalMovePlot, publicView } from "../../../engine";
import { asAttackOk, asMoveOk, type AiClient } from "../../bridge/ai-client";
import type { MatchAiConfig } from "./ai-config";
import type { LaunchSnapshot } from "./types";

export type AiPlotPhase = "MOVE" | "ATTACK";

export interface StartAiPhaseInput {
  readonly phase: AiPlotPhase;
  readonly engine: MatchState;
  readonly catalog: Catalog;
  readonly launch: LaunchSnapshot;
  readonly client: AiClient;
  readonly config: MatchAiConfig;
  readonly opponentModel: OpponentModel;
  readonly onPending: (squad: SquadId, requestId: number) => void;
  readonly onReadyMove: (squad: SquadId, plot: SquadMovePlots, diagnosticsSeed: string) => void;
  readonly onReadyAttack: (squad: SquadId, plot: SquadAttackPlot, diagnosticsSeed: string) => void;
  readonly onError: (squad: SquadId, requestId: number, errorKind: string, message: string) => void;
}

export interface AiPhaseRun {
  cancel(): void;
}

function streamLabel(phase: AiPlotPhase, squad: SquadId, round: number): string {
  return `ai.squad${squad as number}.r${round}.${phase === "MOVE" ? "move" : "attack"}`;
}

export function startAiPhase(input: StartAiPhaseInput): AiPhaseRun {
  let active = true;
  const cancels: Array<() => void> = [];
  const tier = input.launch.input.aiTier;

  for (const squad of input.launch.aiSquadIds) {
    const label = streamLabel(input.phase, squad, input.engine.round);
    const common = {
      state: publicView(input.engine, squad, input.catalog),
      squadId: squad as number,
      catalog: input.catalog,
      seed: input.launch.seed,
      streamLabel: label,
      weights: input.config.weights,
      nodeBudget: input.config.plotNodeBudgets[tier],
      tier,
      opponentModel: input.opponentModel,
    };
    const call = input.client.postAiRequest(
      input.phase === "MOVE" ? { kind: "AI_MOVE", ...common } : { kind: "AI_ATTACK", ...common },
    );
    input.onPending(squad, call.requestId);
    cancels.push(call.cancel);
    call.result
      .then((result) => {
        if (!active || result.kind === "cancelled") return;
        if (result.kind === "error") {
          input.onError(squad, result.requestId, result.errorKind, result.message);
          return;
        }
        if (input.phase === "MOVE") {
          const ok = asMoveOk(result);
          if (ok === null) {
            input.onError(squad, call.requestId, "AI_UNEXPECTED_RESPONSE", `Expected AI_MOVE_OK, got ${result.response.kind}.`);
            return;
          }
          const plot = ok.decision.choice;
          if ((plot.squadId as number) !== (squad as number)) {
            input.onError(squad, call.requestId, "AI_ILLEGAL_MOVE", `Returned plot belongs to squad ${plot.squadId as number}.`);
            return;
          }
          const violations = plot.moves.flatMap((move) => {
            const legal = legalMovePlot(input.engine, move.constructId, move.path, input.catalog);
            return legal.ok ? [] : legal.error;
          });
          if (violations.length > 0) {
            input.onError(squad, call.requestId, "AI_ILLEGAL_MOVE", formatViolations(violations));
            return;
          }
          input.onReadyMove(squad, plot, label);
          return;
        }
        const ok = asAttackOk(result);
        if (ok === null) {
          input.onError(squad, call.requestId, "AI_UNEXPECTED_RESPONSE", `Expected AI_ATTACK_OK, got ${result.response.kind}.`);
          return;
        }
        const plot = ok.decision.choice;
        const violations = legalAttackPlot(input.engine, squad, plot);
        if (violations.length > 0) {
          input.onError(squad, call.requestId, "AI_ILLEGAL_ATTACK", formatViolations(violations));
          return;
        }
        input.onReadyAttack(squad, plot, label);
      })
      .catch((error: unknown) => {
        if (!active) return;
        input.onError(squad, call.requestId, "INTERNAL_DEFECT", error instanceof Error ? error.message : String(error));
      });
  }

  return {
    cancel(): void {
      if (!active) return;
      active = false;
      for (const cancel of cancels) cancel();
    },
  };
}

function formatViolations(violations: readonly { readonly rule: string; readonly kind: string; readonly message: string }[]): string {
  return violations.map((violation) => `${violation.rule}:${violation.kind} ${violation.message}`).join("; ");
}
