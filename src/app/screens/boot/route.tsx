import type { RouteDefinition } from "../../route-registry";
import { Boot } from "./Boot";

/** Self-registering boot route. `#/` is the app entry point (NFR-4, FR-27). */
export const route: RouteDefinition = {
  id: "boot",
  path: "#/",
  render: () => <Boot />,
};
