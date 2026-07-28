import { expect, test } from "@playwright/test";

import {
  FILTER_PDB,
  OVER_LIMIT_PDB,
  SMALL_PDB,
  calculateUploadedPdb,
  capturePageErrors,
  loadUploadedPdb,
  openVolumeTool,
} from "./helper_volume";

// Selector contract:
// - Filter and calculation controls: src/index.html (#volume-form)
// - Error recovery panel: src/index.html (#error-panel)
// - Atom result: src/index.html (#result-atoms)

for (const filterCase of [
  { name: "ATOM records only by default", includeHetatm: false, excludeWater: true, atoms: "3" },
  { name: "non-water HETATM records", includeHetatm: true, excludeWater: true, atoms: "4" },
  { name: "HETATM records including water", includeHetatm: true, excludeWater: false, atoms: "5" },
]) {
  test(`filters select ${filterCase.name}`, async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.goto("/");
    await loadUploadedPdb(page, FILTER_PDB, "filter-input.pdb");
    await page
      .getByLabel("Include HETATM records", { exact: true })
      .setChecked(filterCase.includeHetatm);
    await page
      .getByLabel("Exclude water molecules", { exact: true })
      .setChecked(filterCase.excludeWater);
    await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Calculate volume" }).click();

    await expect(page.locator("#result-atoms")).toHaveText(filterCase.atoms);
    expect(pageErrors).toEqual([]);
  });
}

test("invalid RCSB ID returns to editable inputs", async ({ page }) => {
  await page.goto("/");
  await openVolumeTool(page);
  const pdbIdInput = page.getByRole("textbox", { name: "PDB ID", exact: true });
  await pdbIdInput.fill("bad");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#error-message")).toContainText("valid four-character RCSB PDB ID");
  await page.getByRole("button", { name: "Adjust inputs" }).click();
  await expect(pdbIdInput).toHaveValue("bad");
});

test("RCSB HTTP errors are reported with the entry ID", async ({ page }) => {
  await page.route("https://files.rcsb.org/download/9ZZZ.pdb", async (route) => {
    await route.fulfill({ status: 404, body: "not found" });
  });
  await page.goto("/");
  await openVolumeTool(page);
  await page.getByRole("textbox", { name: "PDB ID", exact: true }).fill("9zzz");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#error-message")).toHaveText("RCSB returned HTTP 404 for 9ZZZ.");
});

test("too few valid atoms are rejected by the WASM engine", async ({ page }) => {
  const twoAtomPdb = SMALL_PDB.split("\n").slice(0, 2).concat("END").join("\n");
  await page.goto("/");
  await calculateUploadedPdb(page, twoAtomPdb);

  await expect(page.locator("#error-message")).toContainText("fewer than three valid atoms");
});

test("an uploaded image is reported as missing PDB coordinate records", async ({ page }) => {
  await page.goto("/");
  await openVolumeTool(page);
  await page.getByText("Upload file", { exact: true }).click();
  await page.getByLabel("PDB file", { exact: true }).setInputFiles({
    name: "not-a-structure.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#error-message")).toHaveText(
    "This file does not contain PDB ATOM or HETATM coordinate records.",
  );
});

test("an invalid gzip upload reports decompression failure", async ({ page }) => {
  await page.goto("/");
  await loadUploadedPdb(page, "This is not gzip data.", "broken.pdb.gz");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.locator("#error-message")).toHaveText(
    "Could not decompress the uploaded file broken.pdb.gz.",
  );
});

test("bounding grids above 64 million voxels stop with recovery guidance", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page, OVER_LIMIT_PDB, "0.5");

  await expect(page.locator("#error-message")).toContainText(
    /browser limit is 64 million.*Choose a coarser grid/,
  );
});
