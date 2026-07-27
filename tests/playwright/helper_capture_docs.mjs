import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputDirectory = process.argv[3] ?? "/tmp/vossvolvox_pages_screenshots";
const referencePdbPath = process.argv[4];
const smallPdb = [
  "ATOM      1  N   ALA A   1      -1.200   0.000   0.000  1.00 20.00           N",
  "ATOM      2  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C",
  "ATOM      3  C   ALA A   1       1.300   0.500   0.000  1.00 20.00           C",
  "ATOM      4  O   ALA A   1       2.300  -0.100   0.000  1.00 20.00           O",
  "ATOM      5  CB  ALA A   1      -0.200  -1.500   0.300  1.00 20.00           C",
  "END",
].join("\n");

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(outputDirectory, "tool_selector.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Light mode" }).click();
  await page.locator('html[data-theme="light"]').waitFor();
  await page.screenshot({
    path: path.join(outputDirectory, "tool_selector_light.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Dark mode" }).click();
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.getByRole("link", { name: "Volume Calculation" }).click();
  await page.getByRole("heading", { name: "Volume Calculation", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(outputDirectory, "volume_setup.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Light mode" }).click();
  await page.locator('html[data-theme="light"]').waitFor();
  await page.screenshot({
    path: path.join(outputDirectory, "volume_setup_light.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Dark mode" }).click();
  await page.locator('html[data-theme="dark"]').waitFor();

  if (referencePdbPath === undefined) {
    await page.getByText("Upload file", { exact: true }).click();
    await page.getByLabel("PDB file", { exact: true }).setInputFiles({
      name: "small-example.pdb",
      mimeType: "chemical/x-pdb",
      buffer: Buffer.from(smallPdb),
    });
    await page.getByLabel("Grid spacing", { exact: true }).selectOption("2");
  } else {
    await page.getByText("Upload file", { exact: true }).click();
    await page.getByLabel("PDB file", { exact: true }).setInputFiles(referencePdbPath);
  }
  await page.getByRole("button", { name: "Calculate volume" }).click();
  await page.getByRole("heading", { name: "Volume information" }).waitFor();
  await page.locator("#viewer canvas").waitFor();
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await page.screenshot({
    path: path.join(outputDirectory, "volume_results.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Light mode" }).click();
  await page.locator('#viewer[data-viewer-theme="light"]').waitFor();
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await page.screenshot({
    path: path.join(outputDirectory, "volume_results_light.png"),
    animations: "disabled",
  });
} finally {
  await context.close();
  await browser.close();
}

console.log(`Captured README screenshots under ${outputDirectory}`);
