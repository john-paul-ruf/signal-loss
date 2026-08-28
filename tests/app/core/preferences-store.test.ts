import { describe, expect, it } from "vitest";
import { createPreferencesStore } from "../../../src/app/store/core/index";

describe("app/core/preferences-store", () => {
  it("hydrates from persisted preferences and resolves motion", () => {
    const store = createPreferencesStore();
    store.getState().hydrate({ reducedMotion: "system", highContrastSquads: true }, true);
    const state = store.getState();
    expect(state.reducedMotion).toBe("system");
    expect(state.resolvedReducedMotion).toBe(true);
    expect(state.highContrastSquads).toBe(true);
  });

  it("persisted preference overrides system motion setting", () => {
    const store = createPreferencesStore();
    store.getState().hydrate({ reducedMotion: "full", highContrastSquads: false }, true);
    expect(store.getState().resolvedReducedMotion).toBe(false);
    store.getState().setReducedMotion("reduced", false);
    expect(store.getState().resolvedReducedMotion).toBe(true);
  });

  it("systemMotionChanged only affects the resolved value when pref is system", () => {
    const store = createPreferencesStore();
    store.getState().hydrate({ reducedMotion: "system", highContrastSquads: false }, false);
    expect(store.getState().resolvedReducedMotion).toBe(false);
    store.getState().systemMotionChanged(true);
    expect(store.getState().resolvedReducedMotion).toBe(true);
    store.getState().setReducedMotion("full", true);
    expect(store.getState().resolvedReducedMotion).toBe(false);
    store.getState().systemMotionChanged(true);
    expect(store.getState().resolvedReducedMotion).toBe(false);
  });
});
