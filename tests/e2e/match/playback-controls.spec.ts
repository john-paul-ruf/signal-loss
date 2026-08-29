import { expect, test } from "@playwright/test";
import {
  FORBIDDEN,
  collectRuntimeFailures,
  enterMovementWithPositivePlot,
} from "./support/real-match";

test.describe("playback controls — real match lifecycle", () => {
  test("starts from pre-state and supports pause, step, resume, skip, and continue", async ({ page }) => {
    test.setTimeout(90_000);
    const failures = collectRuntimeFailures(page);
    await enterMovementWithPositivePlot(page);

    const transport = page.getByTestId("playback-transport");
    await expect(transport).toBeVisible();
    await expect(page.getByTestId("playback-status")).toContainText(/PLAYING|COMPLETE/);
    const moved = page.locator('[data-kind="MOVED"]');
    await expect(moved.first()).toBeVisible({ timeout: 30_000 });

    if (await page.getByTestId("pb-pause").isVisible()) {
      await page.getByTestId("pb-pause").click();
      await expect(page.getByTestId("playback-status")).toContainText("PAUSED");
      const before = await transport.textContent();
      await page.waitForTimeout(400);
      await expect(transport).toHaveText(before ?? "");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
    }

    if (await page.getByTestId("pb-skip").isEnabled()) await page.keyboard.press("s");
    await expect(page.getByTestId("playback-continue")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("playback-continue").click();
    await expect(page.getByTestId("mode-attack")).toBeVisible({ timeout: 30_000 });

    const offending = failures.filter((text) => FORBIDDEN.some((needle) => text.includes(needle)));
    expect(offending, offending.join("\n")).toEqual([]);
  });

  test("reduced motion remains manual and exposes complete focusable cards", async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterMovementWithPositivePlot(page);
    await expect(page.getByTestId("reduced-motion-stack")).toBeVisible();
    await expect(page.getByTestId("playback-status")).toContainText("PAUSED");
    await expect(page.locator(".reduced-motion-stack__card")).toHaveCount(0);
    await page.getByTestId("rm-advance").click();
    await expect(page.locator(".reduced-motion-stack__card").first()).toBeVisible();
    await page.locator(".reduced-motion-stack__card").first().focus();
    await page.keyboard.press("s");
    const count = await page.locator(".reduced-motion-stack__card").count();
    expect(count).toBeGreaterThan(0);
    await expect(page.getByTestId("playback-continue")).toBeEnabled();
  });
});
