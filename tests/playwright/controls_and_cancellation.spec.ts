import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  CAVITY_CAGE_PDB,
  SMALL_PDB,
  TRANSLATED_PDB,
  calculateUploadedPdb,
  openVolumeTool,
} from "./helper_volume";

// Selector contract:
// - Theme and calculation controls: src/index.html (#theme-toggle, #volume-form)
// - Running cancellation panel: src/index.html (#running-panel)
// - Result viewer controls: src/index.html (#results-panel)

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

test("color mode changes and persists across navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Light mode" }).click();
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

test("new calculation returns to an enabled setup form", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);
  await page.getByRole("button", { name: "New calculation" }).click();

  await expect(page.getByRole("heading", { name: "Volume Calculation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate volume" })).toBeEnabled();
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
