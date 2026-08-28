import type { RouteDefinition } from "../../route-registry";
import { MatchScreen } from "./MatchScreen";

/**
 * Match screen route (design.md §5.4 — one shell hosting five modes).
 * Self-registered via route-registry's `import.meta.glob` so no manual
 * edit to `route-registry.tsx` is needed.
 */
export const route: RouteDefinition = {
  id: "match",
  path: "#/match",
  render: () => <MatchScreen />,
};
