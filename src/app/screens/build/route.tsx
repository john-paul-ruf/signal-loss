import type { RouteDefinition } from "../../route-registry";
import { BuildCollection } from "./BuildCollection";

/** Self-registering build-zone collection route (FR-5, FR-6, FR-7). */
export const route: RouteDefinition = {
  id: "build-collection",
  path: "#/build",
  render: () => <BuildCollection />,
};
