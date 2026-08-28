import * as React from "react";
import {
  createMatchStore,
  MatchStoreProvider,
  useMatchStore,
} from "../../store/match";
import type { MatchStore } from "../../store/match";
import type { StoreApi } from "zustand/vanilla";
import { MatchShell } from "../../components/match";
import { DeploymentMode } from "./DeploymentMode";
import { MovementMode } from "./MovementMode";
import { AttackMode } from "./AttackMode";
import { PlaybackMode } from "./PlaybackMode";
import { ResultMode } from "./ResultMode";

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
      <MatchModeSwitch />
    </MatchStoreProvider>
  );
}

function MatchModeSwitch(): React.ReactElement {
  const mode = useMatchStore((s) => s.mode);
  const engine = useMatchStore((s) => s.engine);
  if (engine === null) {
    return (
      <MatchShell
        boardSlot={
          <div className="match-empty" role="status">
            <p>Waiting for launch payload…</p>
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
