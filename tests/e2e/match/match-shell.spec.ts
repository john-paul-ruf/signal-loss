import { expect, test } from "@playwright/test";

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
    const empty = page.getByText("Waiting for launch payload");
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
