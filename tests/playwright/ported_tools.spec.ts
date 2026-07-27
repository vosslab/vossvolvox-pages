import { existsSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CAVITY_CAGE_PDB, SMALL_PDB } from "./helper_volume";

// Selector contract:
// - Tool cards and hashes: src/index.html:44,56,62,68,74
// - Upload and tool parameters: src/index.html:167,226,274,419,442
// - Result series, viewer state, and downloads: src/index.html:623,746,757,767

const PORTED_TOOLS = [
  ["Volume Range", "#volume-range"],
  ["Channel Finder", "#channel-finder"],
  ["Single Channel Extraction", "#channel"],
  ["Solvent Extraction", "#solvent"],
  ["Exit Tunnel Extraction", "#tunnel"],
] as const;

const LOCAL_1JJ2_PDB = path.resolve(
  "OTHER_REPOS/vossvolvox-rust/OTHER_REPOS/vossvolvox-cpp/xyzr/1JJ2.pdb",
);

async function uploadInlinePdb(page: Page, filename: string, pdbText: string): Promise<void> {
  await page.getByText("Upload file", { exact: true }).click();
  await page.getByLabel("PDB file", { exact: true }).setInputFiles({
    name: filename,
    mimeType: "chemical/x-pdb",
    buffer: Buffer.from(pdbText),
  });
}

async function uploadLocal1jj2(page: Page): Promise<void> {
  await page.getByText("Upload file", { exact: true }).click();
  await page.getByLabel("PDB file", { exact: true }).setInputFiles(LOCAL_1JJ2_PDB);
  await page.getByLabel("Outer probe radius").fill("8");
  await page.getByLabel("Inner probe radius").fill("3.4");
  await page.getByLabel("Shell trim radius").fill("1.5");
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
}

test("all ported tool cards open their dedicated setup forms", async ({ page }) => {
  await page.goto("/");

  for (const [name, hash] of PORTED_TOOLS) {
    const toolLink = page.getByRole("link", { name: new RegExp(`^${name}`) });
    await expect(toolLink).toHaveAttribute("href", hash);
    await toolLink.click();
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "All tools" })
      .click();
  }
});

test("Volume Calculation runs independently with a local PDB", async ({ page }) => {
  await page.goto("/#volume");
  await uploadInlinePdb(page, "volume-example.pdb", SMALL_PDB);
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Calculate volume" }).click();

  await expect(page.getByRole("heading", { name: "Volume information" })).toBeVisible();
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    "volume-example-volume.mrc.gz",
  );
});

test("Volume Range produces a numerical series and representative map", async ({ page }) => {
  await page.goto("/#volume-range");
  await uploadInlinePdb(page, "range-example.pdb", SMALL_PDB);
  await page.getByLabel("Minimum probe radius").fill("0");
  await page.getByLabel("Maximum probe radius").fill("2");
  await page.getByLabel("Probe step").fill("1");
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Calculate volume range" }).click();

  await expect(page.getByRole("heading", { name: "Probe-radius series" })).toBeVisible();
  await expect(page.locator("#series-body tr")).toHaveCount(3);
  await expect(page.locator("#viewer")).toHaveAttribute("data-preview-bin", "1");
  await expect(page.getByRole("link", { name: /CSV table/ })).toHaveAttribute(
    "download",
    "range-example-volume-range-results.csv",
  );
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    "range-example-volume-range.mrc.gz",
  );
});

test("Channel Finder runs independently with the local 1JJ2 reference", async ({ page }) => {
  test.skip(!existsSync(LOCAL_1JJ2_PDB), `Local fixture not found: ${LOCAL_1JJ2_PDB}`);
  await page.goto("/#channel-finder");
  await uploadLocal1jj2(page);
  await page.getByLabel("Value").fill("2");
  await page.getByRole("button", { name: "Find channels" }).click();

  await expect(page.getByRole("heading", { name: "Selected channel union" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ranked selected channels" })).toBeVisible();
  await expect(page.getByRole("link", { name: /CSV table/ })).toHaveAttribute(
    "download",
    /1JJ2-channel-finder-results\.csv$/i,
  );
});

test("Single Channel Extraction runs independently with local 1JJ2", async ({ page }) => {
  test.skip(!existsSync(LOCAL_1JJ2_PDB), `Local fixture not found: ${LOCAL_1JJ2_PDB}`);
  await page.goto("/#channel");
  await uploadLocal1jj2(page);
  await page.getByLabel("X", { exact: true }).fill("56");
  await page.getByLabel("Y", { exact: true }).fill("140");
  await page.getByLabel("Z", { exact: true }).fill("74");
  await page.getByRole("button", { name: "Extract channel" }).click();

  await expect(page.getByRole("heading", { name: "Channel information" })).toBeVisible();
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    /1JJ2-channel\.mrc\.gz$/i,
  );
});

test("Solvent Extraction runs the internal-volume Rust/WASM path", async ({ page }) => {
  await page.goto("/#solvent");
  await uploadInlinePdb(page, "cavity-cage.pdb", CAVITY_CAGE_PDB);
  await page.getByLabel("Outer probe radius").fill("6");
  await page.getByLabel("Inner probe radius").fill("1.5");
  await page.getByLabel("Shell trim radius").fill("1.5");
  await page.getByLabel("Grid spacing", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Extract solvent" }).click();

  await expect(page.getByRole("heading", { name: "Internal solvent information" })).toBeVisible();
  await expect(page.locator("#result-volume")).toHaveText("19 Å³");
  await expect(page.locator("#result-cavities")).toHaveText("1 Å³ accessible");
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    "cavity-cage-solvent.mrc.gz",
  );
});

test("Exit Tunnel Extraction runs independently with the local 1JJ2 reference", async ({
  page,
}) => {
  test.skip(!existsSync(LOCAL_1JJ2_PDB), `Local fixture not found: ${LOCAL_1JJ2_PDB}`);
  await page.goto("/#tunnel");
  await uploadLocal1jj2(page);
  await page.getByRole("button", { name: "Extract exit tunnel" }).click();

  await expect(page.getByRole("heading", { name: "Exit tunnel information" })).toBeVisible();
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    /1JJ2-tunnel\.mrc\.gz$/i,
  );
});
