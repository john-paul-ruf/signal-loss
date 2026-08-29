import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { route } from "../../../src/app/screens/setup/route";

describe("match setup route", () => {
  it("self-registers the exact setup path", () => {
    expect(route).toMatchObject({ id: "match-setup", path: "#/setup" });
  });
  it("renders a labelled setup surface", () => {
    const html = renderToStaticMarkup(route.render());
    expect(html).toContain("MATCH SETUP");
    expect(html).toContain("LOADING MATCH SETUP");
  });
});
