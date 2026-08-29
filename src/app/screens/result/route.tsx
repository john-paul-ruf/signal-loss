import type { RouteDefinition } from "../../route-registry";
import { ResultScreen } from "./ResultScreen";

export const route: RouteDefinition = {
  id: "match-result",
  path: "#/result",
  render: () => <ResultScreen />,
};
