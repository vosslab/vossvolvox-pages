import { expect, test } from "@playwright/test";

import { calculateUploadedPdb } from "./helper_volume";

// Selector contract:
// - Input and calculation controls: src/index.html (#volume-form)
// - Results and downloads: src/index.html (#results-panel)
// - Result rendering: src/main.ts (renderResults)

test("smoke: tool selector opens Volume and an uploaded PDB produces results", async ({ page }) => {
  await page.goto("/");
  await calculateUploadedPdb(page);

  await expect(page.locator(".primary-stats")).toContainText(/\u00c5\u00b3[\s\S]*\u00c5\u00b2/);
  await expect(page.getByRole("link", { name: /MRC density map/ })).toHaveAttribute(
    "download",
    "local-example-volume.mrc.gz",
  );
});
