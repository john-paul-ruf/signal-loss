import type { RouteDefinition } from "../../route-registry";
import { Codex } from "./Codex";

/** Self-registering codex route — the full catalog reference (FR-1, FR-19). */
export const route: RouteDefinition = {
  id: "codex",
  path: "#/codex",
  render: () => <Codex />,
};
