import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN, collectRuntimeFailures, enterMovementWithPositivePlot } from "./support/real-match";

/**
 * Match shell e2e — session 08 checkpoint 6.
 *
 * The match screen requires a launch payload committed by Session 07's
 * setup screen. Rather than trying to drive the whole boot→setup flow
 * (Session 07's territory), we probe the naked route: the shell should
 * render its skeleton and the "Return to setup" fallback so nothing
 * crashes when the payload is absent. This validates the shell's
 * error boundary + accessible landmark structure.
 */
test.describe("match shell — visits /match without a launch payload", () => {
  test("renders the shell landmarks and a return-to-setup fallback", async ({ page }) => {
    await page.goto("/#/match");
    // Route should register — the app shell mounts.
    const app = page.locator("#app-root");
    await expect(app).toBeVisible();
    // Fallback text appears when no launch payload is present.
    const empty = page.getByText("Missing launch payload.");
    await expect(empty).toBeVisible();
  });

  test("rules drawer opens with F1 and closes with Escape", async ({ page }) => {
    await page.goto("/#/match");
    await page.keyboard.press("F1");
    // Rules drawer opens as a dialog.
    const drawer = page.getByTestId("rules-drawer");
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});

/**
 * CAP-01/CA-01 proof (match-surface-ai-fixes SESSION-01, checkpoint 3):
 * the shell fits the 1280×720 viewport, only the round log scrolls,
 * and the page never scrolls even with two full rounds of log content.
 */
test.describe("match shell — viewport fit and round-log scrolling", () => {
  test("round log scrolls inside a viewport-fit shell (1280×720)", async ({ page }) => {
    test.setTimeout(240_000);
    const failures = collectRuntimeFailures(page);

    await page.setViewportSize({ width: 1280, height: 720 });
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
    await expect(page.getByTestId("commit-attack")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("commit-attack").click();
    await page.getByRole("dialog", { name: "COMMIT ATTACK" }).getByRole("button", { name: "COMMIT ATTACK", exact: true }).click();
    await expect(page.getByTestId("mode-playback")).toBeVisible();
    await finishPlayback(page);
    // Two full rounds of events are now in the log; round 2 movement plots.
    await expect(page.getByTestId("mode-movement")).toBeVisible({ timeout: 30_000 });

    const log = page.locator(".round-log").last();
    await expect(log).toBeVisible();

    // The log holds more content than the panel fits: seeded two rounds.
    await expect.poll(async () =>
      log.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight })),
    ).toEqual(expect.objectContaining({ scroll: expect.any(Number), client: expect.any(Number) }));
    const heights = await log.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(heights.scroll).toBeGreaterThan(heights.client);

    // Page never scrolls: scrollingElement does not overflow.
    const pageScroll = await page.evaluate(() => {
      const el = document.scrollingElement;
      if (el === null) throw new Error("no scrolling element");
      return { scroll: el.scrollHeight, client: el.clientHeight };
    });
    expect(pageScroll.scroll).toBeLessThanOrEqual(pageScroll.client + 1);

    // Shell fits the viewport: top bar + body + command bar ≤ 100vh.
    const shellBox = await page.locator(".match-shell").boundingBox();
    expect(shellBox).not.toBeNull();
    expect(shellBox?.height ?? 0).toBeLessThanOrEqual(721);

    // Scrolling to the top reveals an older event row, then returning to
    // the bottom restores the stick-to-newest position.
    await log.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.locator('[data-kind="DEPLOYMENT_REVEAL"]').last()).toBeVisible();
    await log.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const backAtBottom = await log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    expect(backAtBottom).toBeLessThanOrEqual(2);

    const offending = failures.filter((text) => FORBIDDEN.some((needle) => text.includes(needle)));
    expect(offending, offending.join("\n")).toEqual([]);
  });
});

async function finishPlayback(page: Page): Promise<void> {
  const skip = page.getByTestId("pb-skip");
  if (await skip.isEnabled()) await skip.click();
  await expect(page.getByTestId("playback-continue")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("playback-continue").click();
}
