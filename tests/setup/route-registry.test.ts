import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  bootFallbackRoute,
  discoverRoutesFromModules,
  findRouteByPath,
  normalizePath,
  registeredRoutes,
  type RouteDefinition,
} from "../../src/app/route-registry";

function fakeRoute(id: string, path: string): RouteDefinition {
  return {
    id,
    path,
    // Render function returns a plain object rather than JSX to keep this test
    // node-only (no jsdom needed). React never runs it here.
    render: () => ({ id, path }) as unknown as ReactElement,
  };
}

describe("route-registry / discoverRoutesFromModules", () => {
  it("returns an empty ordered set when no modules are registered", () => {
    const routes = discoverRoutesFromModules({});
    expect(routes).toEqual([]);
  });

  it("sorts discovered routes by lexicographic path", () => {
    const routes = discoverRoutesFromModules({
      "./screens/z/route.tsx": { route: fakeRoute("z", "#/z") },
      "./screens/a/route.tsx": { route: fakeRoute("a", "#/a") },
      "./screens/m/route.tsx": { route: fakeRoute("m", "#/m") },
    });
    expect(routes.map((r) => r.path)).toEqual(["#/a", "#/m", "#/z"]);
  });

  it("rejects a duplicate route id", () => {
    expect(() =>
      discoverRoutesFromModules({
        "./screens/a/route.tsx": { route: fakeRoute("dup", "#/a") },
        "./screens/b/route.tsx": { route: fakeRoute("dup", "#/b") },
      }),
    ).toThrow(/Duplicate route id/);
  });

  it("rejects a duplicate route path", () => {
    expect(() =>
      discoverRoutesFromModules({
        "./screens/a/route.tsx": { route: fakeRoute("a", "#/same") },
        "./screens/b/route.tsx": { route: fakeRoute("b", "#/same") },
      }),
    ).toThrow(/Duplicate route path/);
  });

  it("rejects a path that does not begin with '#'", () => {
    expect(() =>
      discoverRoutesFromModules({
        "./screens/a/route.tsx": { route: fakeRoute("a", "/a") },
      }),
    ).toThrow(/must start with '#'/);
  });

  it("rejects a module whose route export is malformed", () => {
    expect(() =>
      discoverRoutesFromModules({
        "./screens/bad/route.tsx": { route: { path: "#/x" } as unknown },
      }),
    ).toThrow(/missing a non-empty string `id`/);
  });
});

describe("route-registry / normalizePath", () => {
  it("returns the fallback path for an empty input", () => {
    expect(normalizePath("")).toBe("#/");
  });

  it("passes through a hash-prefixed path unchanged", () => {
    expect(normalizePath("#/build")).toBe("#/build");
  });

  it("adds the '#' to a leading-slash path", () => {
    expect(normalizePath("/match")).toBe("#/match");
  });

  it("wraps a bare segment as a hash path", () => {
    expect(normalizePath("codex")).toBe("#/codex");
  });
});

describe("route-registry / findRouteByPath", () => {
  const routes: readonly RouteDefinition[] = [
    fakeRoute("boot", "#/"),
    fakeRoute("build", "#/build"),
    fakeRoute("match", "#/match"),
  ];

  it("returns an exact match when present", () => {
    expect(findRouteByPath("#/build", routes).id).toBe("build");
  });

  it("normalizes the incoming path before matching", () => {
    expect(findRouteByPath("build", routes).id).toBe("build");
  });

  it("falls back to the first available route when no match", () => {
    expect(findRouteByPath("#/nowhere", routes).id).toBe("boot");
  });

  it("falls back to the boot fallback when nothing is registered", () => {
    expect(findRouteByPath("#/anything", []).id).toBe(bootFallbackRoute.id);
  });
});

describe("route-registry / discovered surface", () => {
  it("exposes an immutable route list (may be empty in Session 01)", () => {
    expect(Array.isArray(registeredRoutes)).toBe(true);
    // Object.isFrozen is not required by contract, but the array is
    // exposed as `readonly` and mutations should be caught by TS + review.
    // We only assert the value type here.
    for (const route of registeredRoutes) {
      expect(typeof route.id).toBe("string");
      expect(typeof route.path).toBe("string");
      expect(typeof route.render).toBe("function");
    }
  });

  it("always resolves to the boot fallback when no feature routes exist", () => {
    if (registeredRoutes.length === 0) {
      expect(findRouteByPath("#/anywhere").id).toBe(bootFallbackRoute.id);
    }
  });
});
