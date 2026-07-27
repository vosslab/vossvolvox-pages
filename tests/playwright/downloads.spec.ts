import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { calculateUploadedPdb, LARGE_GRID_PDB } from "./helper_volume";

async function downloadMrc(page: Page): Promise<{ bytes: Buffer; filename: string }> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /MRC density map/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) {
    throw new Error("Playwright did not provide the completed download path.");
  }
  return { bytes: await readFile(path), filename: download.suggestedFilename() };
}

test("MRC download is a valid gzip-wrapped occupancy map", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);

  const { bytes: compressed, filename } = await downloadMrc(page);
  expect(filename).toBe("local-example-volume.mrc.gz");
  const mrc = gunzipSync(compressed);
  const dimensions = [mrc.readInt32LE(0), mrc.readInt32LE(4), mrc.readInt32LE(8)];
  const voxelCount = dimensions.reduce((product, value) => product * value, 1);

  expect(compressed.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
  expect(mrc.subarray(208, 212).toString("ascii")).toBe("MAP ");
  expect(dimensions.every((value) => value > 0)).toBe(true);
  expect(mrc.length).toBeGreaterThanOrEqual(1024 + voxelCount);
});

test("large full-resolution results use the binned NGL preview path", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page, LARGE_GRID_PDB, "1", "large-grid.pdb");

  await expect(page.locator("#viewer")).toHaveAttribute("data-preview-bin", "2");
  const totalVoxelsText = await page.locator("#result-total-voxels").innerText();
  const totalVoxels = Number(totalVoxelsText.replace(/,/g, ""));
  expect(totalVoxels).toBeGreaterThan(8_000_000);
  await expect(page.locator("#viewer-resolution")).toContainText(
    "binned 2x to 2.00 \u00c5; values and downloads remain full resolution",
  );
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    "large-grid-volume.mrc.gz",
  );
  const report = await page.locator("#download-json").evaluate(async (element) => {
    const response = await fetch((element as HTMLAnchorElement).href);
    return (await response.json()) as {
      results: {
        origin: { x: number; y: number; z: number };
        dimensions: { x: number; y: number; z: number };
        totalGridVoxels: number;
      };
    };
  });
  const parsedOrigin = (await page.locator("#viewer").getAttribute("data-volume-origin"))
    ?.split(",")
    .map(Number);
  expect(parsedOrigin).toEqual([
    report.results.origin.x + 0.5,
    report.results.origin.y + 0.5,
    report.results.origin.z + 0.5,
  ]);

  const { bytes: compressed } = await downloadMrc(page);
  const mrc = gunzipSync(compressed);
  expect([mrc.readInt32LE(0), mrc.readInt32LE(4), mrc.readInt32LE(8)]).toEqual([
    report.results.dimensions.x,
    report.results.dimensions.y,
    report.results.dimensions.z,
  ]);
  expect(mrc.length).toBeGreaterThanOrEqual(1024 + report.results.totalGridVoxels);
});
