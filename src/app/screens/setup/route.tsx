import type { RouteDefinition } from "../../route-registry";
import { MatchSetup } from "./MatchSetup";
export const route: RouteDefinition = { id: "match-setup", path: "#/setup", render: () => <MatchSetup /> };
