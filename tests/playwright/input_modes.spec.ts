import { gzipSync } from "node:zlib";

import { expect, test } from "@playwright/test";

import { SMALL_PDB, openVolumeTool } from "./helper_volume";

// Selector contract:
// - Input and calculation controls: src/index.html (#volume-form)
// - Result input label: src/index.html (#result-input)

test("RCSB input fetches an asymmetric unit and calculates it", async ({ page }) => {
  await page.route("https://files.rcsb.org/download/2LYZ.pdb", async (route) => {
    await route.fulfill({ body: SMALL_PDB, contentType: "chemical/x-pdb" });
  });

  await page.goto("/");
  await openVolumeTool(page);
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#result-input")).toHaveText("2LYZ.pdb");
  await expect(page.locator("#result-atoms")).toHaveText("5");
});

test("RCSB biological assembly is decompressed in the browser", async ({ page }) => {
  const gzippedPdb = gzipSync(Buffer.from(SMALL_PDB));
  await page.route("https://files.rcsb.org/download/2LYZ.pdb1.gz", async (route) => {
    await route.fulfill({ body: gzippedPdb, contentType: "application/gzip" });
  });

  await page.goto("/");
  await openVolumeTool(page);
  await page.getByLabel("Use biological assembly 1", { exact: true }).check();
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#result-input")).toHaveText("2LYZ-assembly1.pdb");
  await expect(page.locator("#result-atoms")).toHaveText("5");
});

test("uploaded PDB stays local and keeps its filename", async ({ page }) => {
  await page.goto("/");
  await openVolumeTool(page);
  await page.getByText("Upload file", { exact: true }).click();
  await page.getByLabel("PDB file", { exact: true }).setInputFiles({
    name: "local-example.pdb",
    mimeType: "chemical/x-pdb",
    buffer: Buffer.from(SMALL_PDB),
  });
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#result-input")).toHaveText("local-example.pdb");
  await expect(page.locator("#result-atoms")).toHaveText("5");
});
