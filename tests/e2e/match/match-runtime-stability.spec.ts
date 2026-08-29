import { expect, test } from "@playwright/test";

/**
 * Runtime-stability regression (fix-generated-map SESSION-03).
 *
 * The reported screenshots showed `The result of getSnapshot should be
 * cached` and `Maximum update depth exceeded` in <SquadRail> the moment
 * the real setup → match transition mounted the match store. The defect
 * lived in `useMatchStore`'s external-store snapshot getter, so only the
 * live React subscription reproduces it — a static render cannot.
 *
 * This spec drives the actual route: generate a deterministic setup, then
 * DEPLOY into the match and assert the match view reaches "Own constructs"
 * with no external-store or update-depth console failure.
 *
 * The seed below is verified to pass the current map gate at budget 100.
 * If a future catalog revision makes it fail the gate, replace it with
 * another deterministic passing seed and update this note — never weaken
 * the gate or add retries in product code.
 */
const DETERMINISTIC_SEED = "8592953eb8ce193f7fcdc987660b5fab";

const FORBIDDEN = [
  "getSnapshot should be cached",
  "Maximum update depth",
];

test.describe("match runtime stability — real setup → match transition", () => {
  test("deploys into the match without external-store or update-depth failures", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/#/setup");
    await expect(
      page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" }),
    ).toBeVisible();

    // Default budget is 100; STRIKE FORCE is the legal prebuilt there.
    await page.getByRole("button", { name: "STRIKE FORCE · PREBUILT" }).click();
    await page.getByLabel("Map seed").fill(DETERMINISTIC_SEED);

    await page.getByRole("button", { name: "GENERATE" }).click();
    const deploy = page.getByRole("button", { name: "DEPLOY" });
    await expect(deploy).toBeEnabled({ timeout: 30_000 });

    // Capture console/page errors only from the match transition, so this
    // spec stays isolated from the separate setup duplicate-key regression.
    const failures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        failures.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      failures.push(error.message);
    });

    await deploy.click();

    await expect(page).toHaveURL(/#\/match$/);
    await expect(
      page.getByRole("region", { name: "Own constructs" }),
    ).toBeVisible({ timeout: 30_000 });

    const offending = failures.filter((text) =>
      FORBIDDEN.some((needle) => text.includes(needle)),
    );
    expect(offending, offending.join("\n")).toEqual([]);
  });
});
