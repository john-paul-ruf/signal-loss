import * as React from "react";
import {
  createMatchStore,
  MatchStoreProvider,
  useMatchStore,
  useMatchStoreActions,
} from "../../store/match";
import type { MatchStore } from "../../store/match";
import type { StoreApi } from "zustand/vanilla";
import { MatchShell } from "../../components/match";
import { DeploymentMode } from "./DeploymentMode";
import { MovementMode } from "./MovementMode";
import { AttackMode } from "./AttackMode";
import { PlaybackMode } from "./PlaybackMode";
import { ResultMode } from "./ResultMode";
import { resolveCatalog } from "../../store/build/catalog";
import { useFlowStore } from "../../store/core";
import { createAiClient, browserAiWorker } from "../../bridge/ai-client";
import { startAiDeployment } from "../../store/match/ai-deployment";
import { resolveMatchAiConfig } from "../../store/match/ai-config";

/**
 * Match screen entry. Owns the match store lifecycle — one store per
 * mount, disposed on unmount. Uses launch payload from the shared
 * core flow store if available; otherwise renders a "missing launch"
 * fallback that links back to setup.
 *
 * The actual mode module renders the board content; MatchShell provides
 * the shared rails.
 */
export function MatchScreen(): React.ReactElement {
  const storeRef = React.useRef<StoreApi<MatchStore> | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createMatchStore();
  }
  return (
    <MatchStoreProvider store={storeRef.current}>
      <AiDeploymentController />
      <MatchModeSwitch />
    </MatchStoreProvider>
  );
}

/**
 * Match-lifetime AI deployment controller. Renders nothing; on entering the
 * DEPLOYMENT phase with a booted store it spins one four-worker client and
 * posts one deployment request per AI squad, wiring results to the store's
 * typed slot actions. It is keyed on the engine revision + mode (NOT the
 * mutable `ai` map), so incoming slot writes never cancel and restart the
 * four in-flight requests. Cleanup — on phase change or unmount, including
 * StrictMode's setup/cleanup cycle — cancels the run and disposes the client
 * so no stale worker result writes into a new phase.
 */
function AiDeploymentController(): null {
  const mode = useMatchStore((s) => s.mode);
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const launch = useMatchStore((s) => s.launch);
  const markAiPending = useMatchStore((s) => s.markAiPending);
  const markAiReadyDeploy = useMatchStore((s) => s.markAiReadyDeploy);
  const markAiError = useMatchStore((s) => s.markAiError);

  React.useEffect(() => {
    if (mode !== "DEPLOYMENT" || launch === null || catalog === null || engine === null) {
      return;
    }
    const client = createAiClient({ poolSize: 4, factory: browserAiWorker });
    const run = startAiDeployment({
      engine,
      catalog,
      launch,
      client,
      config: resolveMatchAiConfig(),
      onPending: markAiPending,
      onReady: markAiReadyDeploy,
      onError: markAiError,
    });
    return () => {
      run.cancel();
      client.dispose();
    };
  }, [mode, engine, catalog, launch, markAiPending, markAiReadyDeploy, markAiError]);

  return null;
}

function MatchModeSwitch(): React.ReactElement {
  const mode = useMatchStore((s) => s.mode);
  const engine = useMatchStore((s) => s.engine);
  const lastError = useMatchStore((s) => s.lastError);
  const { boot } = useMatchStoreActions();
  const pendingLaunch = useFlowStore((s) => s.pendingLaunch);
  const attemptedRef = React.useRef(false);
  const [booting, setBooting] = React.useState(pendingLaunch !== null);
  const [bootError, setBootError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (attemptedRef.current || pendingLaunch === null || engine !== null) return;
    attemptedRef.current = true;
    try {
      boot(pendingLaunch, resolveCatalog());
    } catch (error) {
      setBootError(error instanceof Error ? error.message : String(error));
    } finally {
      setBooting(false);
    }
  }, [boot, engine, pendingLaunch]);

  if (engine === null) {
    if (booting && pendingLaunch !== null) {
      return <MatchShell boardSlot={<div className="match-empty" role="status">Preparing match…</div>} />;
    }
    return (
      <MatchShell
        boardSlot={
          <div className="match-empty" role="status">
            <p>{bootError ?? (lastError?.kind === "CREATE_FAILED" ? lastError.message : "Missing launch payload.")}</p>
            <p>
              <a href="#/setup">Return to setup</a>
            </p>
          </div>
        }
      />
    );
  }
  const boardSlot =
    mode === "DEPLOYMENT" ? (
      <DeploymentMode />
    ) : mode === "MOVEMENT_PLOT" ? (
      <MovementMode />
    ) : mode === "ATTACK_PLOT" ? (
      <AttackMode />
    ) : mode === "MOVEMENT_PLAYBACK" || mode === "ATTACK_PLAYBACK" ? (
      <PlaybackMode />
    ) : (
      <ResultMode />
    );
  return <MatchShell boardSlot={boardSlot} />;
}
