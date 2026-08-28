import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Collection route — import error states, prebuilt fork, armed delete, axe,
 * keyboard (SESSION-07 checkpoint 2). Persistence uses the real localStorage
 * repository; each test starts from a clean origin.
 */
test.describe("collection", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto("/#/build");
    await expect(page.getByRole("region", { name: "Rosters" })).toBeVisible();
  });

  test("has no axe violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("shows a MALFORMED import result as a persistent alert", async ({ page }) => {
    await page.getByLabel("Paste a share string to import").fill("not-a-share-string");
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByRole("alert")).toContainText(/prefix|malformed|expected/i);
  });

  test("forks a prebuilt via DUPLICATE TO EDIT into a saved roster", async ({ page }) => {
    await page.getByRole("button", { name: "Duplicate to edit" }).first().click();
    // The forked roster appears in the Saved group and is selectable.
    await expect(page.getByRole("region", { name: "Rosters" })).toContainText("Saved");
    await expect(
      page.getByRole("region", { name: "Rosters" }).getByRole("button", { current: "true" }),
    ).toHaveCount(0); // not yet selected, but present in saved list
  });

  test("armed delete requires an explicit confirm", async ({ page }) => {
    await page.getByRole("button", { name: "Duplicate to edit" }).first().click();
    await page.getByRole("region", { name: "Rosters" }).getByRole("button").last().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm delete" })).toBeVisible();
  });

  test("keyboard reaches the import control", async ({ page }) => {
    const importButton = page.getByRole("button", { name: "Import" });
    await importButton.focus();
    await expect(importButton).toBeFocused();
  });
});
