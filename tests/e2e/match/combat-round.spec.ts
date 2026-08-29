import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN, collectRuntimeFailures, enterMovementWithPositivePlot } from "./support/real-match";

async function finishPlayback(page: Page): Promise<void> {
  const skip = page.getByTestId("pb-skip");
  if (await skip.isEnabled()) await skip.click();
  await expect(page.getByTestId("playback-continue")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("playback-continue").click();
}

test.describe("combat round — real workers and product controls", () => {
  test("moves, attacks, reveals posture, and reaches round two", async ({ page }) => {
    test.setTimeout(180_000);
    const failures = collectRuntimeFailures(page);
    await page.goto("/#/setup");
    await expect(page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" })).toBeVisible({ timeout: 30_000 });
    await enterMovementWithPositivePlot(page);
    await finishPlayback(page);
    await expect(page.getByTestId("mode-attack")).toBeVisible({ timeout: 30_000 });

    const firstRow = page.locator('[data-testid^="attack-row-"]').first();
    const target = firstRow.getByRole("combobox");
    await expect.poll(async () => target.locator('option:not([value=""])').count(), { timeout: 30_000 }).toBeGreaterThan(0);
    await target.selectOption({ index: 1 });
    await page.keyboard.press("1");
    await page.keyboard.press("p");
    if (Number((await page.getByTestId("attack-pool-remaining").textContent())?.match(/\d+/)?.[0] ?? "0") > 0) {
      await page.keyboard.press("c");
    }
    await expect(page.getByTestId("exchange-card").first()).toBeVisible();
    await expect(page.getByTestId("commit-attack")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("commit-attack").click();
    await page.getByRole("dialog", { name: "COMMIT ATTACK" }).getByRole("button", { name: "COMMIT ATTACK", exact: true }).click();
    await expect(page.getByTestId("mode-playback")).toBeVisible();
    await finishPlayback(page);

    await expect(page.locator('[data-kind="SHOT"]')).not.toHaveCount(0);
    await expect(page.locator('[data-kind="POSTURE_REVEAL"]')).not.toHaveCount(0);
    const landedOrDefended = await page.locator('[data-kind="DAMAGE_APPLIED"], [data-kind="DIAL_ADVANCED"], [data-kind="DEFENSE_INFO"]').count();
    expect(landedOrDefended).toBeGreaterThan(0);
    await expect(page.getByTestId("mode-movement")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("round")).toHaveText("02");
    expect(failures.filter((text) => FORBIDDEN.some((needle) => text.includes(needle))), failures.join("\n")).toEqual([]);
  });
});
