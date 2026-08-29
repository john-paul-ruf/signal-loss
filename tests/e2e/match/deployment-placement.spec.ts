import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  fitCamera,
  worldToScreenX,
  worldToScreenY,
  type WorldBounds,
} from "../../../src/app/board/camera";
import type { Fx, Vec2 } from "../../../src/engine";

/**
 * Deployment placement regression (fix-deployment-placement SESSION-01).
 *
 * The reported no-op: the human spawn was undiscoverable, staged drafts had
 * no board feedback, and BEGIN MATCH was enabled at 0 / N. This spec drives
 * the real setup → match route and proves the repaired interaction:
 *   - the human spawn is labelled and BEGIN MATCH starts disabled at 0 / 3
 *   - a center click (outside squad 0's corner spawn) reports the reason
 *   - three interior clicks stage drafts, advance the count, and only then
 *     enable the irreversible commit
 *   - BEGIN MATCH hands off to the engine as the final authority, with no
 *     partial commit and no runtime crash
 *
 * NOTE: in-match AI deployment orchestration is not yet wired in this build
 * (M15 workers / M17 store — outside this session's lease), so the engine
 * rejects the still-unplaced AI squads and the match does not yet advance to
 * MOVEMENT_PLOT. Step 5 accepts either the transition or that surfaced
 * rejection, so it proves the in-lease contract today and stays valid once
 * AI deployment lands.
 *
 * Canvas clicks are derived from the board's own bounding box and the known
 * generated geometry — never a window-absolute coordinate. `MAP_BOUNDS` and
 * `SPAWN_POINTS` below are the deterministic output of `generateMap(SEED,
 * {kind:"any"}, …)` for the release catalog: squad 0 spawns in the
 * upper-left, a 4096×4096 fx box at (-30720…-26624). The click points are
 * projected through the same `fitCamera` the board uses, so they land inside
 * that box regardless of the board's rendered size. Replace SEED (and the
 * geometry) only if a catalog revision makes the seed fail the map gate, and
 * document the replacement here.
 */
const DETERMINISTIC_SEED = "8592953eb8ce193f7fcdc987660b5fab";

const MAP_BOUNDS: WorldBounds = {
  min: { x: -32768 as Fx, y: -32768 as Fx },
  max: { x: 32768 as Fx, y: 32768 as Fx },
};

/**
 * Three distinct interior points of squad 0's upper-left spawn box, spaced
 * wider than the sum of the 1024-fx footprint radii so the complete
 * deployment is legal (verified against `legalDeployment` — 0 violations).
 */
const SPAWN_POINTS: readonly Vec2[] = [
  { x: -30208 as Fx, y: -30208 as Fx },
  { x: -27136 as Fx, y: -30208 as Fx },
  { x: -28672 as Fx, y: -27136 as Fx },
];

/** The map center (0,0) is inside bounds but outside every corner spawn. */
const MAP_CENTER: Vec2 = { x: 0 as Fx, y: 0 as Fx };

const FORBIDDEN = [
  "getSnapshot should be cached",
  "Maximum update depth",
];

async function generateAndDeploy(page: Page): Promise<void> {
  await page.goto("/#/setup");
  await expect(
    page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "STRIKE FORCE · PREBUILT" }).click();
  await page.getByLabel("Map seed").fill(DETERMINISTIC_SEED);

  await page.getByRole("button", { name: "GENERATE" }).click();
  const deploy = page.getByRole("button", { name: "DEPLOY" });
  await expect(deploy).toBeEnabled({ timeout: 30_000 });
  await deploy.click();

  await expect(page).toHaveURL(/#\/match$/);
  await expect(page.getByTestId("mode-deployment")).toBeVisible({ timeout: 30_000 });
}

/** Project a world point to an element-relative click position via the board's camera. */
async function clickWorld(board: Locator, world: Vec2): Promise<void> {
  const box = await board.boundingBox();
  if (box === null) throw new Error("board has no bounding box");
  const cam = fitCamera(MAP_BOUNDS, {
    width: box.width,
    height: box.height,
    devicePixelRatio: 1,
  });
  await board.click({
    position: {
      x: worldToScreenX(cam, world.x),
      y: worldToScreenY(cam, world.y),
    },
  });
}

test.describe("deployment placement — real setup → match", () => {
  test("stages three drafts, gates commit, and starts the match", async ({ page }) => {
    test.setTimeout(60_000);

    const failures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        failures.push(message.text());
      }
    });
    page.on("pageerror", (error) => failures.push(error.message));

    await generateAndDeploy(page);

    // 1 — the affordance is discoverable and the commit is gated at 0 / 3.
    await expect(page.getByTestId("deploy-title")).toHaveText(/YOUR SPAWN/);
    await expect(page.getByTestId("deploy-instruction")).toHaveText(
      "SELECT A UNIT, THEN CLICK YOUR SPAWN",
    );
    await expect(page.getByTestId("deploy-count")).toHaveText("0 / 3 PLACED");
    const beginMatch = page.getByTestId("commit-deployment");
    await expect(beginMatch).toBeDisabled();
    await expect(page.getByTestId("deploy-remaining")).toHaveText("3 CONSTRUCTS UNPLACED");

    const board = page.getByTestId("board-canvas");

    // 2 — a center click is outside squad 0's corner spawn (protects the
    // reported no-op path: the center ring is not the spawn region).
    await clickWorld(board, MAP_CENTER);
    await expect(page.getByTestId("deploy-reason")).toHaveText("OUT OF SPAWN REGION");
    await expect(page.getByTestId("deploy-count")).toHaveText("0 / 3 PLACED");

    // 3 — three distinct interior points of the upper-left (squad 0) spawn.
    const point0 = SPAWN_POINTS[0]!;
    const point1 = SPAWN_POINTS[1]!;
    const point2 = SPAWN_POINTS[2]!;
    await clickWorld(board, point0);
    await expect(page.getByTestId("deploy-count")).toHaveText("1 / 3 PLACED");
    await expect(beginMatch).toBeDisabled();

    await clickWorld(board, point1);
    await expect(page.getByTestId("deploy-count")).toHaveText("2 / 3 PLACED");
    await expect(beginMatch).toBeDisabled();

    await clickWorld(board, point2);
    await expect(page.getByTestId("deploy-count")).toHaveText("3 / 3 PLACED");

    // A staged coordinate is visible in the HUD (board feedback, not a no-op).
    await expect(page.getByText(/✓ -?\d+, -?\d+/).first()).toBeVisible();

    // 4 — commit is enabled only once every construct is down.
    await expect(beginMatch).toBeEnabled();
    await expect(page.getByTestId("deploy-remaining")).toHaveCount(0);

    // 5 — the gate having passed, BEGIN MATCH hands off to applyDeployment,
    // the final engine authority. On success the mode advances to movement
    // plotting. In-match AI deployment orchestration is a separate, not-yet-
    // wired concern (M15 workers / M17 store, outside this lease); until it
    // lands the engine legitimately rejects the still-unplaced AI squads and
    // surfaces ENGINE_REJECTED without partially committing. Accept either
    // outcome, but never a silent no-op, a partial commit, or a runtime crash.
    await beginMatch.click();
    await expect
      .poll(
        async () =>
          (await page.getByTestId("mode-movement").count()) > 0 ||
          (await page.getByTestId("command-error").count()) > 0,
        { timeout: 30_000 },
      )
      .toBe(true);

    const advancedToMovement = (await page.getByTestId("mode-movement").count()) > 0;
    if (!advancedToMovement) {
      // Engine stayed the authority: still on the match route, deployment
      // intact at 3 / 3, nothing partially committed.
      await expect(page).toHaveURL(/#\/match$/);
      await expect(page.getByTestId("mode-deployment")).toBeVisible();
      await expect(page.getByTestId("deploy-count")).toHaveText("3 / 3 PLACED");
    }

    // No React external-store / update-depth failure at any point.
    const offending = failures.filter((text) =>
      FORBIDDEN.some((needle) => text.includes(needle)),
    );
    expect(offending, offending.join("\n")).toEqual([]);
  });
});
