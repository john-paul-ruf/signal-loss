import { describe, expect, it, vi } from "vitest";
import {
  createNavigationStore,
  normalizeHashPath,
} from "../../../src/app/store/core/index";

describe("app/core/navigation-store", () => {
  it("normalizes bare paths into `#/...`", () => {
    expect(normalizeHashPath("")).toBe("#/");
    expect(normalizeHashPath("foo")).toBe("#/foo");
    expect(normalizeHashPath("/foo")).toBe("#/foo");
    expect(normalizeHashPath("#/foo")).toBe("#/foo");
  });

  it("navigate() invokes requestNavigation and bumps count only on change", () => {
    const request = vi.fn();
    const store = createNavigationStore({ initialPath: "#/", requestNavigation: request });
    store.getState().navigate("build");
    expect(request).toHaveBeenCalledWith("#/build");
    expect(store.getState().currentPath).toBe("#/build");
    expect(store.getState().navigationCount).toBe(1);
    // Same path — count does not tick.
    store.getState().navigate("#/build");
    expect(store.getState().navigationCount).toBe(1);
  });

  it("hashChanged updates state without dispatching an outbound request", () => {
    const request = vi.fn();
    const store = createNavigationStore({ initialPath: "#/", requestNavigation: request });
    store.getState().hashChanged("#/match");
    expect(store.getState().currentPath).toBe("#/match");
    expect(request).not.toHaveBeenCalled();
  });
});
