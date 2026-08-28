import { createStore, type StoreApi } from "zustand/vanilla";
import type { PreferencesV1, ReducedMotionPreferenceV1 } from "../../../platform/index";

/**
 * Preferences store — a small live copy of `PersistedStateV1.preferences`.
 * The collection store owns persistence; this store owns the in-memory
 * projection plus derived resolved-motion booleans for the UI.
 *
 * "System" reducedMotion is not a UI setting — it means "defer to OS media
 * query". Consumers should read `resolvedReducedMotion` for the presented
 * effect and `reducedMotion` for the persisted preference.
 */
export interface PreferencesState {
  readonly reducedMotion: ReducedMotionPreferenceV1;
  readonly highContrastSquads: boolean;
  readonly resolvedReducedMotion: boolean;
}

export interface PreferencesActions {
  hydrate(persisted: PreferencesV1, systemMotionReduced: boolean): void;
  setReducedMotion(pref: ReducedMotionPreferenceV1, systemMotionReduced: boolean): void;
  setHighContrastSquads(enabled: boolean): void;
  systemMotionChanged(systemMotionReduced: boolean): void;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

const INITIAL_STATE: PreferencesState = {
  reducedMotion: "system",
  highContrastSquads: false,
  resolvedReducedMotion: false,
};

export function createPreferencesStore(): StoreApi<PreferencesStore> {
  return createStore<PreferencesStore>((set, get) => ({
    ...INITIAL_STATE,
    hydrate(persisted, systemMotionReduced): void {
      set({
        reducedMotion: persisted.reducedMotion,
        highContrastSquads: persisted.highContrastSquads,
        resolvedReducedMotion: resolveReducedMotion(persisted.reducedMotion, systemMotionReduced),
      });
    },
    setReducedMotion(pref, systemMotionReduced): void {
      set({
        reducedMotion: pref,
        resolvedReducedMotion: resolveReducedMotion(pref, systemMotionReduced),
      });
    },
    setHighContrastSquads(enabled): void {
      set({ highContrastSquads: enabled });
    },
    systemMotionChanged(systemMotionReduced): void {
      set({
        resolvedReducedMotion: resolveReducedMotion(get().reducedMotion, systemMotionReduced),
      });
    },
  }));
}

/**
 * Persisted preference wins over the OS media query; only when the user
 * chose "system" do we fall back to the OS default.
 */
function resolveReducedMotion(
  pref: ReducedMotionPreferenceV1,
  systemMotionReduced: boolean,
): boolean {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return systemMotionReduced;
}
