import { expect, test } from "@playwright/test";
import {
  FORBIDDEN,
  MAP_CENTER,
  MOVE_TARGET,
  SPAWN_POINTS,
  clickWorld,
  generateAndDeploy,
} from "./support/real-match";

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

    // 6 — canvas SELECTION. Click the first deployed human marker. This must
    // select + inspect the construct WITHOUT drafting a waypoint: the HUD
    // names a selected construct, its rail row stays UNPLOTTED, and the
    // plotted length stays zero (proving the click did not append a point).
    await clickWorld(board, point0);
    await expect(page.getByTestId("mv-selected")).toHaveText(/allowance \d+/);
    const selectedRow = page.locator(".squad-rail__row--selected");
    await expect(selectedRow).toHaveCount(1);
    await expect(selectedRow.locator(".squad-rail__state")).toHaveText("UNPLOTTED");
    await expect(page.getByTestId("mv-length")).toHaveText(/^0 \/ \d+$/);

    // 7 — legal WAYPOINT. Click a stable, wall-free point outside the marker
    // hit radius but inside the construct's allowance. The HUD now reports a
    // positive path length and the selected rail row reports a plotted path.
    await clickWorld(board, MOVE_TARGET);
    await expect(page.getByTestId("mv-length")).toHaveText(/^[1-9]\d* \/ \d+$/);
    await expect(selectedRow.locator(".squad-rail__state")).toHaveText(/^PLOTTED /);

    // 8 — the first click only arms the irreversible commit. The named
    // dialog stays in the viewport, EDIT returns to plotting and restores
    // focus, and only the reopened dialog's affirmative action resolves.
    const commitMovement = page.getByTestId("commit-movement");
    await commitMovement.click();

    const dialog = page.getByRole("dialog", { name: "COMMIT MOVEMENT" });
    const edit = dialog.getByRole("button", { name: "EDIT", exact: true });
    const confirmMovement = dialog.getByRole("button", {
      name: "COMMIT MOVEMENT",
      exact: true,
    });
    const scrim = page.locator(".sl-modal-scrim");

    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("mode-movement")).toBeVisible();
    await expect(page.getByTestId("mode-playback")).toHaveCount(0);
    await expect(dialog.locator(".sl-modal__body")).toHaveText(
      "2 constructs will HOLD.",
    );
    await expect(scrim).toHaveCSS("position", "fixed");
    await expect(scrim).toHaveCSS("top", "0px");
    await expect(scrim).toHaveCSS("right", "0px");
    await expect(scrim).toHaveCSS("bottom", "0px");
    await expect(scrim).toHaveCSS("left", "0px");
    await expect(dialog).toBeInViewport();
    await expect(edit).toBeInViewport();
    await expect(confirmMovement).toBeInViewport();

    await edit.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("mode-movement")).toBeVisible();
    await expect(page.getByTestId("mode-playback")).toHaveCount(0);

    // WebKit follows Safari's pointer convention and does not focus a button
    // on click. Reopen from an explicit keyboard focus target so the shared
    // trap has an opener to restore in every configured browser.
    await commitMovement.focus();
    await commitMovement.press("Space");
    await expect(dialog).toBeVisible();
    await edit.click();
    await expect(dialog).toHaveCount(0);
    await expect(commitMovement).toBeFocused();

    await commitMovement.click();
    await expect(dialog).toBeVisible();
    await confirmMovement.click();
    await expect(page.getByTestId("mode-playback")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mode-movement")).toHaveCount(0);
    // The engine accepted the move — no MOVE rejection surfaced.
    await expect(page.getByTestId("command-error")).toHaveCount(0);

    // 9 — the round log records a positive-distance MOVED for the human
    // construct rather than an implicit HOLD (the engine's real outcome).
    const movedItems = page.locator('[data-kind="MOVED"]');
    await expect(movedItems.first()).toBeVisible({ timeout: 30_000 });
    const movedTexts = await movedItems.allTextContents();
    const movedDistances = movedTexts.map((text) =>
      Number(text.match(/moved (\d+)/)?.[1] ?? "0"),
    );
    expect(
      movedDistances.some((distance) => distance > 0),
      movedTexts.join(" | "),
    ).toBe(true);

    // No partial-deployment, worker, movement-rejection, or React
    // external-store failure at any point in the flow.
    const offending = failures.filter((text) =>
      FORBIDDEN.some((needle) => text.includes(needle)),
    );
    expect(offending, offending.join("\n")).toEqual([]);
  });
});
