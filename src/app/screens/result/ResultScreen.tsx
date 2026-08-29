import * as React from "react";
import { isCompleteMatchLaunchConfig, useFlowStore, useFlowStoreApi, type CompleteMatchLaunchConfig } from "../../store/core";
import { ResultSummary } from "../../components/result/ResultSummary";
import { createAiClient } from "../../bridge/ai-client";
import { browserMapGenWorker, createMapGenClient, createSetupGenerationService, resolveCatalog } from "../../store/build";
import { createNewSeedLaunch, draftForRematch, cloneSameSeedLaunch } from "../../components/result/result-actions";

export function ResultScreen(): React.ReactElement {
  const result = useFlowStore((state) => state.lastResult);
  const pendingLaunch = useFlowStore((state) => state.pendingLaunch);
  const flow = useFlowStoreApi();
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const active = React.useRef<{ cancel(): void } | null>(null);
  const service = React.useRef<ReturnType<typeof createSetupGenerationService> | null>(null);
  React.useEffect(() => () => { active.current?.cancel(); service.current?.dispose(); }, []);
  if (result === null) {
    return (
      <main className="result-missing" aria-labelledby="result-missing-title">
        <h1 id="result-missing-title">MATCH SUMMARY UNAVAILABLE</h1>
        <p>Match results are transient and do not survive a reload or direct link.</p>
        <nav aria-label="Result recovery"><a href="#/setup">Match setup</a> · <a href="#/build">Build zone</a></nav>
      </main>
    );
  }
  const launch: CompleteMatchLaunchConfig | null = pendingLaunch !== null && isCompleteMatchLaunchConfig(pendingLaunch) ? pendingLaunch : null;
  const sameSeed = (): void => {
    if (launch === null) { setActionError("The completed launch configuration is unavailable."); return; }
    flow.getState().setPendingLaunch(cloneSameSeedLaunch(launch));
    flow.getState().setLastResult(null);
    window.location.hash = "#/match";
  };
  const newSeed = (): void => {
    if (launch === null || busy) return;
    setActionError(null); setBusy(true);
    const catalog = resolveCatalog();
    if (service.current === null) service.current = createSetupGenerationService({ map: createMapGenClient({ factory: browserMapGenWorker }), ai: createAiClient({ factory: () => new Worker(new URL("../../../workers/ai.worker.ts", import.meta.url), { type: "module" }) }) });
    const rematchService = service.current;
    let generation: ReturnType<NonNullable<typeof service.current>["prepare"]> | null = null;
    void createNewSeedLaunch(launch, { catalog, entropy: globalThis.crypto, prepare(seed) { generation = rematchService.prepare(draftForRematch(launch, seed), catalog); active.current = generation; return generation.result; } }).then((outcome) => {
      if (active.current !== generation) return;
      active.current = null; setBusy(false);
      if (outcome.kind === "error") { setActionError(`[${outcome.errorKind}] ${outcome.message}`); return; }
      flow.getState().setPendingLaunch(outcome.launch);
      flow.getState().setLastResult(null);
      window.location.hash = "#/match";
    });
  };
  return <ResultSummary result={result} busy={busy} actionError={actionError} onSameSeed={sameSeed} onNewSeed={newSeed} />;
}
