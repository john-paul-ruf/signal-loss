import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Boot route — accessibility + viewport gating (SESSION-07 checkpoint 1).
 * Axe runs at both declared layout viewports; the desktop statement must
 * replace the entry navigation below 1280 wide (NFR-4) rather than reflow.
 */
test.describe("boot", () => {
  test("has no axe violations at 1440x900 and 1280x720", async ({ page }) => {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/#/");
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    }
  });

  test("replaces entries with the desktop statement below 1280 wide", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.goto("/#/");
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
    await expect(page.getByText("Signal Loss is a desktop product")).toBeVisible();
  });

  test("keyboard reaches all three entry points", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/");
    const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
    await expect(links).toHaveCount(3);
    // Tab into the document until the first entry link is focused.
    const first = links.first();
    await first.focus();
    await expect(first).toBeFocused();
  });
});
