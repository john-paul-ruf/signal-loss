import { expect, type Locator, type Page } from "@playwright/test";
import {
  fitCamera,
  worldToScreenX,
  worldToScreenY,
  type WorldBounds,
} from "../../../../src/app/board/camera";
import type { Fx, Vec2 } from "../../../../src/engine";

export const DETERMINISTIC_SEED = "8592953eb8ce193f7fcdc987660b5fab";
export const MAP_BOUNDS: WorldBounds = {
  min: { x: -32768 as Fx, y: -32768 as Fx },
  max: { x: 32768 as Fx, y: 32768 as Fx },
};
export const SPAWN_POINTS: readonly Vec2[] = [
  { x: -30208 as Fx, y: -30208 as Fx },
  { x: -27136 as Fx, y: -30208 as Fx },
  { x: -28672 as Fx, y: -27136 as Fx },
];
export const MAP_CENTER: Vec2 = { x: 0 as Fx, y: 0 as Fx };
export const MOVE_TARGET: Vec2 = { x: -30208 as Fx, y: -28160 as Fx };
export const FORBIDDEN = [
  "getSnapshot should be cached",
  "Maximum update depth",
  "Engine rejected",
  "WORKER_DOWN",
  "React",
];

export async function generateAndDeploy(page: Page): Promise<void> {
  await page.goto("/#/setup");
  await expect(page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" })).toBeVisible();
  await page.getByRole("button", { name: /TIER 1/ }).click();
  await page.getByRole("button", { name: "STRIKE FORCE · PREBUILT" }).click();
  await page.getByLabel("Map seed").fill(DETERMINISTIC_SEED);
  await page.getByRole("button", { name: "GENERATE" }).click();
  const deploy = page.getByRole("button", { name: "DEPLOY" });
  await expect(deploy).toBeEnabled({ timeout: 30_000 });
  await deploy.click();
  await expect(page).toHaveURL(/#\/match$/);
  await expect(page.getByTestId("mode-deployment")).toBeVisible({ timeout: 30_000 });
}

export async function clickWorld(board: Locator, world: Vec2): Promise<void> {
  const box = await board.boundingBox();
  if (box === null) throw new Error("board has no bounding box");
  const camera = fitCamera(MAP_BOUNDS, { width: box.width, height: box.height, devicePixelRatio: 1 });
  await board.click({
    position: {
      x: worldToScreenX(camera, world.x),
      y: worldToScreenY(camera, world.y),
    },
  });
}

export async function enterMovementWithPositivePlot(page: Page): Promise<void> {
  await generateAndDeploy(page);
  const board = page.getByTestId("board-canvas");
  for (const point of SPAWN_POINTS) await clickWorld(board, point);
  const begin = page.getByTestId("commit-deployment");
  await expect(begin).toBeEnabled({ timeout: 30_000 });
  await begin.click();
  await expect(page.getByTestId("mode-movement")).toBeVisible({ timeout: 30_000 });
  await clickWorld(board, SPAWN_POINTS[0]!);
  await clickWorld(board, MOVE_TARGET);
  const commit = page.getByTestId("commit-movement");
  await expect(commit).toBeEnabled({ timeout: 30_000 });
  await commit.click();
  await page.getByRole("dialog", { name: "COMMIT MOVEMENT" })
    .getByRole("button", { name: "COMMIT MOVEMENT", exact: true }).click();
  await expect(page.getByTestId("mode-playback")).toBeVisible({ timeout: 30_000 });
}

export function collectRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") failures.push(message.text());
  });
  page.on("pageerror", (error) => failures.push(error.message));
  return failures;
}
