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
 *     (once the four AI squads report READY_DEPLOY) enable the irreversible
 *     commit
 *   - BEGIN MATCH hands off to the engine as the final authority and the match
 *     advances to MOVEMENT_PLOT with no partial commit and no runtime crash
 *
 * In-match AI deployment is now wired (M15 workers / M17 store): the match
 * screen posts one deployment request per AI squad on entry, so BEGIN MATCH
 * enables only after every AI squad is placed and the real five-squad
 * simultaneous reveal succeeds. This spec requires that full transition.
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
  "FR-12:PARTIAL_DEPLOYMENT",
  "FR-12:AI_DEPLOYMENT_NOT_READY",
  "Engine rejected DEPLOY",
  "WORKER_DOWN",
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

    // 4 — all three human constructs are down, but the commit stays gated
    // until the four AI squads finish deploying in their workers. Wait for
    // the shared human-plus-AI predicate to enable BEGIN MATCH.
    await expect(page.getByTestId("deploy-remaining")).toHaveCount(0);
    await expect(beginMatch).toBeEnabled({ timeout: 30_000 });

    // 5 — the gate having passed, BEGIN MATCH hands off to applyDeployment,
    // the final engine authority. All five squads are placed, so the real
    // simultaneous reveal succeeds and the mode advances to movement plotting.
    await beginMatch.click();
    await expect(page.getByTestId("mode-movement")).toBeVisible({ timeout: 30_000 });

    // The match advanced for real — still on the match route, the movement
    // surface is up, the deployment HUD is gone (not a silent no-op), and no
    // command error surfaced.
    await expect(page).toHaveURL(/#\/match$/);
    await expect(page.getByTestId("command-error")).toHaveCount(0);
    await expect(page.getByTestId("mode-deployment")).toHaveCount(0);

    // No partial-deployment, worker, or React external-store failure at any
    // point in the flow.
    const offending = failures.filter((text) =>
      FORBIDDEN.some((needle) => text.includes(needle)),
    );
    expect(offending, offending.join("\n")).toEqual([]);
  });
});
