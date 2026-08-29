import { expect, test, type Page } from "@playwright/test";
import { DETERMINISTIC_SEED, FORBIDDEN, collectRuntimeFailures, enterMovementWithPositivePlot } from "./support/real-match";

const MAX_ROUND = 26;

async function commitMovement(page: Page): Promise<void> {
  await expect(page.getByTestId("commit-movement")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("commit-movement").click();
  await page.getByRole("dialog", { name: "COMMIT MOVEMENT" }).getByRole("button", { name: "COMMIT MOVEMENT", exact: true }).click();
  await expect(page.getByTestId("mode-playback")).toBeVisible();
}

async function commitAttack(page: Page): Promise<void> {
  const rows = page.locator('[data-testid^="attack-row-"]');
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const select = rows.nth(index).getByRole("combobox");
    if (await select.locator('option:not([value=""])').count()) await select.selectOption({ index: 1 });
  }
  await expect(page.getByTestId("commit-attack")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("commit-attack").click();
  await page.getByRole("dialog", { name: "COMMIT ATTACK" }).getByRole("button", { name: "COMMIT ATTACK", exact: true }).click();
  await expect(page.getByTestId("mode-playback")).toBeVisible();
}

async function rememberEvents(page: Page, observed: Set<string>): Promise<void> {
  for (const kind of await page.locator("[data-kind]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-kind") ?? ""))) observed.add(kind);
}

test("complete deterministic match reaches result and same-seed rematch", async ({ page }) => {
  test.setTimeout(420_000);
  const failures = collectRuntimeFailures(page);
  const observed = new Set<string>();
  await page.goto("/#/setup");
  await expect(page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" })).toBeVisible({ timeout: 30_000 });
  await enterMovementWithPositivePlot(page);
  await page.getByTestId("pb-skip").click();
  await rememberEvents(page, observed);
  await page.getByTestId("playback-continue").click();

  for (let round = 1; round <= MAX_ROUND && !page.url().endsWith("#/result"); round += 1) {
    if (await page.getByTestId("mode-attack").count()) {
      await commitAttack(page); await page.getByTestId("pb-skip").click(); await rememberEvents(page, observed); await page.getByTestId("playback-continue").click();
    }
    if (page.url().endsWith("#/result")) break;
    await expect(page.getByTestId("mode-movement")).toBeVisible({ timeout: 30_000 });
    await commitMovement(page); await page.getByTestId("pb-skip").click(); await rememberEvents(page, observed); await page.getByTestId("playback-continue").click();
  }

  await expect(page).toHaveURL(/#\/result$/, { timeout: 30_000 });
  await expect(page.locator(".result-placement h1")).toHaveText(/^(1ST|2ND|3RD|4TH|5TH)$/);
  await expect(page.locator(".result-placement")).toContainText("OF 5");
  await expect(page.getByText(DETERMINISTIC_SEED, { exact: true })).toBeVisible();
  await expect(page.getByText("NO PROGRESSION — ROSTERS ARE UNCHANGED BY PLAY", { exact: true })).toBeVisible();
  await expect(page.locator(".result-rosters li")).toHaveCount(5);
  for (const kind of ["MOVED", "POSTURE_REVEAL", "SHOT", "TRACE_DAMAGE", "DESTROYED", "ELIMINATED", "MATCH_COMPLETE"]) expect(observed.has(kind), `missing ${kind}`).toBe(true);
  expect(failures.filter((text) => FORBIDDEN.some((needle) => text.includes(needle))), failures.join("\n")).toEqual([]);

  await page.getByRole("button", { name: "REMATCH · SAME SEED" }).click();
  await expect(page).toHaveURL(/#\/match$/);
  await expect(page.getByTestId("mode-deployment")).toBeVisible({ timeout: 30_000 });
});
