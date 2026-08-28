import { createStore, type StoreApi } from "zustand/vanilla";
import type { PersistedEntityIdV1, SavedRosterV1 } from "../../../platform/index";

/**
 * Non-persisted flow store — carries `MatchLaunchConfig` from the setup
 * screen to the match screen, and `MatchResultPayload` back from the match
 * screen to the result screen. Neither value is written to
 * `CollectionRepository` — these are session-in-flight objects that must
 * not survive a reload (database.md §8, and this session's checkpoint 4).
 *
 * The types are intentionally minimal here — the match/setup sessions
 * (07/08) extend them with rich engine state via their own store slices.
 * We only carry the handoff CONTRACT.
 */

/**
 * The parameters a setup screen commits when the player launches a match.
 * Consumers of the match store read this once at mount and NEVER write it.
 */
export interface MatchLaunchConfig {
  readonly rosterId: SavedRosterV1["id"];
  /** Copy of the roster taken at launch time so a delete mid-match can't leak state. */
  readonly roster: SavedRosterV1;
  readonly budget: number;
  readonly seed: string;
  readonly archetypeCode: number | null;
  readonly aiTierId: string;
}

/**
 * A summary the match screen posts on completion for the result screen to
 * render. `share` carries the seed + rosters codec strings; the payload
 * intentionally carries nothing personal.
 */
export interface MatchResultPayload {
  readonly config: MatchLaunchConfig;
  readonly outcome: "victory" | "defeat" | "stalemate";
  readonly rounds: number;
  readonly humanEliminationRound: number | null;
  readonly finalStateHash: string;
  readonly share: {
    readonly rosterCode: string;
    readonly seed: string;
  };
}

/**
 * Flow store — pointers to the currently-in-flight launch and the most
 * recently completed match. Both are set-and-cleared by the screens that
 * own them.
 */
export interface FlowState {
  readonly pendingLaunch: MatchLaunchConfig | null;
  readonly lastResult: MatchResultPayload | null;
  readonly requestedEntity: PersistedEntityIdV1 | null;
}

export interface FlowActions {
  setPendingLaunch(config: MatchLaunchConfig | null): void;
  setLastResult(result: MatchResultPayload | null): void;
  requestEntity(id: PersistedEntityIdV1 | null): void;
  clear(): void;
}

export type FlowStore = FlowState & FlowActions;

const INITIAL_STATE: FlowState = {
  pendingLaunch: null,
  lastResult: null,
  requestedEntity: null,
};

export function createFlowStore(): StoreApi<FlowStore> {
  return createStore<FlowStore>((set) => ({
    ...INITIAL_STATE,
    setPendingLaunch(config): void {
      set({ pendingLaunch: config });
    },
    setLastResult(result): void {
      set({ lastResult: result });
    },
    requestEntity(id): void {
      set({ requestedEntity: id });
    },
    clear(): void {
      set({ ...INITIAL_STATE });
    },
  }));
}
