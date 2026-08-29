import { expect, test } from "@playwright/test";

test("direct setup route renders the match setup shell", async ({ page }) => {
  await page.goto("/#/setup");
  await expect(page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "GENERATE" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "DEPLOY" })).toBeDisabled();
});
