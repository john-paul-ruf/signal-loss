import type { RouteDefinition } from "../../../route-registry";
import { Composer } from "./Composer";

/** Self-registering build-zone composer route (FR-2, FR-3, FR-4). */
export const route: RouteDefinition = {
  id: "composer",
  path: "#/composer",
  render: () => <Composer />,
};
