import { describe, expect, it } from "vitest";
import {
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  meetsDesktopViewport,
  probeStorageAvailability,
  resolveReducedMotion,
} from "../../src/platform/capability";

describe("platform/capability / viewport", () => {
  it("meetsDesktopViewport enforces both dimensions", () => {
    expect(meetsDesktopViewport({ width: MIN_VIEWPORT_WIDTH, height: MIN_VIEWPORT_HEIGHT })).toBe(true);
    expect(meetsDesktopViewport({ width: 1280, height: 719 })).toBe(false);
    expect(meetsDesktopViewport({ width: 1279, height: 720 })).toBe(false);
    expect(meetsDesktopViewport({ width: 1920, height: 1080 })).toBe(true);
    expect(meetsDesktopViewport({ width: 0, height: 0 })).toBe(false);
  });
});

describe("platform/capability / reduced motion", () => {
  it("returns true if persisted preference is reduced", () => {
    expect(resolveReducedMotion("reduced", null)).toBe(true);
    expect(resolveReducedMotion("reduced", (): { matches: boolean } => ({ matches: false }))).toBe(true);
  });

  it("returns false if persisted preference is full even when system prefers reduced", () => {
    expect(resolveReducedMotion("full", (): { matches: boolean } => ({ matches: true }))).toBe(false);
  });

  it("returns the media query result when pref is system", () => {
    expect(resolveReducedMotion("system", (): { matches: boolean } => ({ matches: true }))).toBe(true);
    expect(resolveReducedMotion("system", (): { matches: boolean } => ({ matches: false }))).toBe(false);
  });

  it("returns false when pref is system and matchMedia is unavailable", () => {
    expect(resolveReducedMotion("system", null)).toBe(false);
  });
});

describe("platform/capability / storage probe", () => {
  it("returns available=true on a working storage", () => {
    const store = new Map<string, string>();
    const result = probeStorageAvailability({
      key: "signal-loss:state",
      storage: {
        setItem: (k, v) => void store.set(k, v),
        removeItem: (k) => void store.delete(k),
      },
    });
    expect(result.available).toBe(true);
    expect(store.size).toBe(0);
  });

  it("returns available=false when storage is null", () => {
    const result = probeStorageAvailability({ key: "signal-loss:state", storage: null });
    expect(result.available).toBe(false);
  });

  it("classifies a setItem throw as unavailable with the cause preserved", () => {
    const cause = Object.assign(new Error("blocked"), { name: "SecurityError" });
    const result = probeStorageAvailability({
      key: "signal-loss:state",
      storage: {
        setItem: () => {
          throw cause;
        },
        removeItem: () => undefined,
      },
    });
    expect(result.available).toBe(false);
    expect(result.cause).toBe(cause);
  });
});
