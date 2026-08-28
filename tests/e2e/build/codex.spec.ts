import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Codex route — accessibility, keyboard sort + disclosure, catalog truth
 * (SESSION-07 checkpoint 1).
 */
test.describe("codex", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/codex");
    await expect(page.getByRole("heading", { name: "Codex" })).toBeVisible();
  });

  test("has no axe violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("keyboard-sorts a column and reflects it in aria-sort", async ({ page }) => {
    const costHeaderButton = page.getByRole("button", { name: /^Cost/ });
    await costHeaderButton.focus();
    await expect(costHeaderButton).toBeFocused();
    await page.keyboard.press("Enter");
    const costHeader = page.getByRole("columnheader", { name: /^Cost/ });
    await expect(costHeader).toHaveAttribute("aria-sort", "ascending");
    await page.keyboard.press("Enter");
    await expect(costHeader).toHaveAttribute("aria-sort", "descending");
  });

  test("keyboard-expands a chassis dial via its disclosure button", async ({ page }) => {
    const disclosure = page
      .getByRole("button", { expanded: false })
      .filter({ hasText: /-CLASS|HARDLINE|BASTION|SURGE|PHANTOM|CASCADE|MIRAGE|JUGGERNAUT/ })
      .first();
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { expanded: true }).first()).toBeVisible();
    // A dial stat grid header (S1) appears once expanded.
    await expect(page.getByRole("columnheader", { name: "S1" }).first()).toBeVisible();
  });

  test("states the resolution-truth contract line", async ({ page }) => {
    await expect(
      page.getByText("EVERY VALUE SHOWN HERE IS THE VALUE USED IN RESOLUTION"),
    ).toBeVisible();
  });
});
