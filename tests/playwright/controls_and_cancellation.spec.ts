import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  CAVITY_CAGE_PDB,
  SMALL_PDB,
  TRANSLATED_PDB,
  calculateUploadedPdb,
  loadUploadedPdb,
  openVolumeTool,
} from "./helper_volume";

// Selector contract:
// - Theme and calculation controls: src/index.html:15,96,571
// - Running cancellation panel: src/index.html:579
// - Results, viewer state, and New calculation: src/index.html:589,595,623,626

async function readPresetState(page: Page): Promise<string[]> {
  return Promise.all([
    page.getByRole("textbox", { name: "PDB ID", exact: true }).inputValue(),
    page.getByLabel("Probe radius", { exact: true }).inputValue(),
    page.getByLabel("Grid spacing", { exact: true }).inputValue(),
  ]);
}

test("tool selector uses the original 3vee artwork", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('img[src="img/volumeCalc.png"]')).toBeVisible();
});

test("shared footer links the 3V publication", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Publication" })).toHaveAttribute(
    "href",
    "https://doi.org/10.1093/nar/gkq395",
  );
});

test("presets apply their scientific parameter sets", async ({ page }) => {
  await page.goto("/");
  await openVolumeTool(page);
  await page.getByRole("button", { name: "Lysozyme - Shell" }).click();
  await expect.poll(() => readPresetState(page)).toEqual(["2LYZ", "6", "0.5"]);

  await page.getByRole("button", { name: "50S Ribosomal Subunit" }).click();
  await expect.poll(() => readPresetState(page)).toEqual(["1JJ2", "6", "2"]);
});

test("ported 3vee help is visible on keyboard focus", async ({ page }) => {
  await page.goto("/");
  await openVolumeTool(page);
  const probeHelp = page.getByLabel("Radius of a virtual ball rolled along the macromolecule.", {
    exact: true,
  });
  await probeHelp.focus();

  await expect(probeHelp).toBeFocused();
  await expect
    .poll(async () =>
      probeHelp.evaluate((element) => getComputedStyle(element, "::after").visibility),
    )
    .toBe("visible");
});

test("sphericity help uses squared-volume notation", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);

  await expect(page.getByLabel(/V\u00b2/)).toHaveAttribute("data-tooltip", /V\u00b2/);
});

test("color mode persists through tool navigation and reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await openVolumeTool(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "All tools" })
    .click();
  await expect(page.getByRole("heading", { name: "External volumes" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();
});

test("NGL palette follows the page color mode", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);
  await expect(page.locator("#viewer")).toHaveAttribute("data-viewer-theme", "dark");

  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(page.locator("#viewer")).toHaveAttribute("data-viewer-theme", "light");
});

test("surface opacity control updates the NGL representation", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);

  const opacity = page.getByLabel("Surface opacity");
  await opacity.fill("0.1");
  await expect(page.locator("#surface-opacity-value")).toHaveText("10%");
  await expect(page.locator("#viewer")).toHaveAttribute("data-surface-opacity", "0.1");
});

test("internal-cavity filling selects the VolumeNoCav result method", async ({ page }) => {
  await page.goto("/");
  await openVolumeTool(page);
  await page.getByLabel("Fill internal cavities", { exact: true }).check();
  await calculateUploadedPdb(page, CAVITY_CAGE_PDB, "0.5", "cavity-cage.pdb");

  await expect(page.locator("#result-cavities")).toContainText("Filled (27");
  await expect(page.locator("#result-volume")).toContainText("1,450");
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    "cavity-cage-volume-no-cav.mrc.gz",
  );
});

test("NGL preserves the translated MRC origin", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page, TRANSLATED_PDB, "0.75");

  await expect(page.locator("#viewer")).toHaveAttribute("data-volume-origin", "87,-42,12");
});

test("new calculation clears viewer data and returns to an enabled setup form", async ({
  page,
}) => {
  await page.goto("/");
  await calculateUploadedPdb(page);
  await expect(page.locator("#viewer canvas")).toHaveCount(1);
  await expect(page.locator("#viewer")).toHaveAttribute("data-volume-origin");
  await expect(page.locator("#viewer")).toHaveAttribute("data-preview-bin");

  await page.getByRole("button", { name: "New calculation" }).click();

  await expect(page.getByRole("heading", { name: "Volume Calculation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate volume" })).toBeEnabled();
  await expect(page.locator("#viewer")).toBeEmpty();
  await expect(page.locator("#viewer")).not.toHaveAttribute("data-volume-origin");
  await expect(page.locator("#viewer")).not.toHaveAttribute("data-preview-bin");
  await expect(page.locator("#viewer-resolution")).toBeEmpty();
});

test("new calculation prevents a delayed result render from restoring viewer data", async ({
  page,
}) => {
  await page.addInitScript(() => {
    type GzipGateWindow = Window & {
      gzipBlobEntered?: boolean;
      gzipBlobSettled?: boolean;
      releaseGzipBlob?: () => void;
    };
    const gateWindow = window as GzipGateWindow;
    // The override must call the native method with each intercepted Response as its receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalBlob = Response.prototype.blob;
    let releaseGzipBlob: (() => void) | undefined;
    const gzipBlobMayFinish = new Promise<void>((resolve) => {
      releaseGzipBlob = resolve;
    });
    gateWindow.releaseGzipBlob = releaseGzipBlob;
    Response.prototype.blob = async function (): Promise<Blob> {
      gateWindow.gzipBlobEntered = true;
      await gzipBlobMayFinish;
      const blob = await originalBlob.call(this);
      gateWindow.gzipBlobSettled = true;
      return blob;
    };
  });
  await page.goto("/");
  await loadUploadedPdb(page);
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Calculate volume" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { gzipBlobEntered?: boolean }).gzipBlobEntered),
    )
    .toBe(true);

  await page.getByRole("button", { name: "New calculation" }).click();
  await page.evaluate(() =>
    (window as Window & { releaseGzipBlob?: () => void }).releaseGzipBlob?.(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { gzipBlobSettled?: boolean }).gzipBlobSettled),
    )
    .toBe(true);

  await expect(page.getByRole("heading", { name: "Volume Calculation" })).toBeVisible();
  await expect(page.locator("#viewer")).toBeEmpty();
  await expect(page.locator("#viewer")).not.toHaveAttribute("data-preview-bin");
  await expect(page.locator("#download-mrc")).not.toHaveAttribute("download");
});

test("result breadcrumbs return to the Volume setup", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByText("Volume Calculation")
    .click();

  await expect(page.getByRole("heading", { name: "Volume Calculation" })).toBeVisible();
});

test("cancelling an in-flight RCSB fetch cannot resume the old calculation", async ({ page }) => {
  let releaseRequest: (() => void) | undefined;
  let markRequestEntered: (() => void) | undefined;
  let markRouteSettled: (() => void) | undefined;
  const requestMayFinish = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const requestEntered = new Promise<void>((resolve) => {
    markRequestEntered = resolve;
  });
  const routeSettled = new Promise<void>((resolve) => {
    markRouteSettled = resolve;
  });
  await page.route("https://files.rcsb.org/download/2LYZ.pdb", async (route) => {
    markRequestEntered?.();
    await requestMayFinish;
    try {
      await route.fulfill({ body: SMALL_PDB, contentType: "chemical/x-pdb" });
    } catch {
      // The expected AbortController cancellation may close the route first.
    } finally {
      markRouteSettled?.();
    }
  });

  await page.goto("/");
  await openVolumeTool(page);
  await page.getByRole("button", { name: "Calculate volume" }).click();
  await requestEntered;
  await page.getByRole("button", { name: "Cancel calculation" }).click();

  releaseRequest?.();
  await routeSettled;

  await expect(page.getByRole("heading", { name: "Volume Calculation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Volume information" })).toBeHidden();
});
