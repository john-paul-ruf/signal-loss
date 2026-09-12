import { expect, test, type Page, type Response } from "@playwright/test";

const STORAGE_KEY = "signal-loss:state";

function isMigrationModuleRequest(url: string): boolean {
  return /\/migrations\/001_initial(?:\.ts)?(?:\?|$)/u.test(url);
}

function collectRuntimeFailures(page: Page, expectedOrigin: string): Set<string> {
  const failures = new Set<string>();

  page.on("pageerror", (error) => {
    failures.add(`page error: ${error.message}`);
  });
  page.on("console", (message) => {
    // Console API calls carry argument handles; engine policy diagnostics do
    // not. The latter are browser output, not application console emissions.
    if (message.type() === "error" && message.args().length > 0) {
      failures.add(`console error: ${message.text()}`);
    }
  });
  page.on("request", (request) => {
    const url = request.url();
    if (isMigrationModuleRequest(url)) {
      failures.add(`runtime migration-module request: ${url}`);
    }

    const parsed = new URL(url);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin !== expectedOrigin
    ) {
      failures.add(`unexpected external-origin request: ${url}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (isMigrationModuleRequest(request.url())) {
      failures.add(
        `failed migration-module request: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
      );
    }
  });

  return failures;
}

async function waitForActiveServiceWorker(page: Page): Promise<void> {
  const readiness = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return { ok: false, reason: "Service workers are unsupported." };
    }

    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 15_000);
      }),
    ]);
    if (registration === null) {
      return { ok: false, reason: "Service worker activation timed out." };
    }

    const activeWorker = registration.active;
    if (activeWorker === null) {
      return { ok: false, reason: "Service worker registration has no active worker." };
    }
    if (activeWorker.state !== "activated") {
      const activated = await new Promise<boolean>((resolve) => {
        const finish = (didActivate: boolean): void => {
          window.clearTimeout(timeoutId);
          activeWorker.removeEventListener("statechange", handleStateChange);
          resolve(didActivate);
        };
        const handleStateChange = (): void => {
          if (activeWorker.state === "activated") finish(true);
          else if (activeWorker.state === "redundant") finish(false);
        };
        const timeoutId = window.setTimeout(() => finish(false), 15_000);

        activeWorker.addEventListener("statechange", handleStateChange);
        handleStateChange();
      });
      if (activated) return { ok: true, reason: "" };

      return {
        ok: false,
        reason: `Service worker did not activate (${activeWorker.state}).`,
      };
    }
    return { ok: true, reason: "" };
  });

  expect(readiness.ok, readiness.reason).toBe(true);
}

test("production preview boots, persists, recovers, and reloads offline", async ({
  baseURL,
  browserName,
  context,
  page,
}) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required for production boot.");

  await page.setViewportSize({ width: 1440, height: 900 });
  const runtimeFailures = collectRuntimeFailures(page, new URL(baseURL).origin);

  await page.goto("/#/setup");
  await expect(
    page.getByRole("heading", { name: "SIGNAL LOSS / MATCH SETUP" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "NEW SEED" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "GENERATE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "DEPLOY" })).toBeVisible();
  await expect(page.getByText("LOADING MATCH SETUP…")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBeNull();

  await page.goto("/#/build");
  const rosters = page.getByRole("region", { name: "Rosters" });
  await expect(rosters).toBeVisible();
  const duplicateButtons = page.getByRole("button", { name: "Duplicate to edit" });
  const prebuiltCount = await duplicateButtons.count();
  expect(prebuiltCount).toBeGreaterThan(0);

  const duplicate = duplicateButtons.first();
  const prebuiltName = (
    await duplicate.locator("xpath=ancestor::li[1]").locator("span").first().innerText()
  ).trim();
  expect(prebuiltName.length).toBeGreaterThan(0);
  await duplicate.click();

  const savedRoster = rosters.getByRole("button").filter({ hasText: prebuiltName });
  await expect(savedRoster).toHaveCount(1);
  await expect(duplicateButtons).toHaveCount(prebuiltCount);

  await page.reload();
  await expect(rosters).toBeVisible();
  await expect(savedRoster).toHaveCount(1);

  await page.evaluate((key) => {
    localStorage.setItem(key, "{malformed");
  }, STORAGE_KEY);
  await page.reload();

  const corruptionAlert = page
    .getByRole("alert")
    .filter({ hasText: "Stored collection is corrupt" });
  await expect(corruptionAlert).toBeVisible();
  await corruptionAlert.getByRole("button", { name: "Reset store" }).click();
  await corruptionAlert.getByRole("button", { name: "Confirm reset" }).click();
  await expect(corruptionAlert).toHaveCount(0);
  await expect(
    page.getByText("NO SAVED ROSTERS · DUPLICATE A PREBUILT OR IMPORT ONE"),
  ).toBeVisible();

  await waitForActiveServiceWorker(page);
  await page.reload();
  await expect(rosters).toBeVisible();
  const controllerState = await page.evaluate(
    () => navigator.serviceWorker.controller?.state ?? null,
  );
  expect(controllerState, "The activated service worker must control the repeat load.").toBe(
    "activated",
  );

  if (browserName === "webkit") {
    // WebKit's inspector-level offline switch aborts controlled navigations.
    // Require the strongest observable equivalent: every app response on a
    // repeat load must come from the activated service worker's precache.
    const serviceWorkerResponses: string[] = [];
    const networkResponses: string[] = [];
    const onResponse = (response: Response): void => {
      if (new URL(response.url()).origin !== new URL(baseURL).origin) return;
      (response.fromServiceWorker() ? serviceWorkerResponses : networkResponses).push(
        response.url(),
      );
    };
    page.on("response", onResponse);
    let navigationResponse: Response | null = null;
    try {
      navigationResponse = await page.reload({ waitUntil: "domcontentloaded" });
    } finally {
      page.off("response", onResponse);
    }
    expect(navigationResponse?.fromServiceWorker()).toBe(true);
    expect(serviceWorkerResponses.length).toBeGreaterThan(0);
    expect(
      networkResponses,
      "WebKit's repeat load must resolve every app response from the precache.",
    ).toStrictEqual([]);
  } else {
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
    } finally {
      await context.setOffline(false);
    }
  }

  await expect(rosters).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicate to edit" }).first()).toBeEnabled();
  await expect(page.getByText(/loading collection|LOADING MATCH SETUP/iu)).toHaveCount(0);

  expect(
    [...runtimeFailures],
    `Production runtime failures:\n${[...runtimeFailures].join("\n")}`,
  ).toStrictEqual([]);
});
