import type { Page } from "@playwright/test";

export const SMALL_PDB = [
  "ATOM      1  N   ALA A   1      -1.200   0.000   0.000  1.00 20.00           N",
  "ATOM      2  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C",
  "ATOM      3  C   ALA A   1       1.300   0.500   0.000  1.00 20.00           C",
  "ATOM      4  O   ALA A   1       2.300  -0.100   0.000  1.00 20.00           O",
  "ATOM      5  CB  ALA A   1      -0.200  -1.500   0.300  1.00 20.00           C",
  "END",
].join("\n");

export const FILTER_PDB = [
  "ATOM      1  N   ALA A   1      -1.200   0.000   0.000  1.00 20.00           N",
  "ATOM      2  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C",
  "ATOM      3  C   ALA A   1       1.300   0.500   0.000  1.00 20.00           C",
  "HETATM    4  C1  LIG A   2       2.300  -0.100   0.000  1.00 20.00           C",
  "HETATM    5  O   HOH A   3      -0.200  -1.500   0.300  1.00 20.00           O",
  "END",
].join("\n");

export const OVER_LIMIT_PDB = [
  "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N",
  "ATOM      2  CA  ALA A   1     200.000   0.000   0.000  1.00 20.00           C",
  "ATOM      3  C   ALA A   1       0.000 200.000 200.000  1.00 20.00           C",
  "END",
].join("\n");

export const TRANSLATED_PDB = [
  "ATOM      1  N   ALA A   1      98.800 -30.000  25.000  1.00 20.00           N",
  "ATOM      2  CA  ALA A   1     100.000 -30.000  25.000  1.00 20.00           C",
  "ATOM      3  C   ALA A   1     101.300 -29.500  25.000  1.00 20.00           C",
  "ATOM      4  O   ALA A   1     102.300 -30.100  25.000  1.00 20.00           O",
  "ATOM      5  CB  ALA A   1      99.800 -31.500  25.300  1.00 20.00           C",
  "END",
].join("\n");

export function capturePageErrors(page: Page): string[] {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return pageErrors;
}

export async function openVolumeTool(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: "Volume Calculation", exact: true });
  if (!(await heading.isVisible())) {
    await page.getByRole("link", { name: "Volume Calculation" }).click();
  }
  await heading.waitFor();
}

export async function loadUploadedPdb(
  page: Page,
  pdbText = SMALL_PDB,
  filename = "local-example.pdb",
): Promise<void> {
  await openVolumeTool(page);
  await page.getByText("Upload file", { exact: true }).click();
  await page.getByLabel("PDB file", { exact: true }).setInputFiles({
    name: filename,
    mimeType: "chemical/x-pdb",
    buffer: Buffer.from(pdbText),
  });
}

export async function calculateUploadedPdb(
  page: Page,
  pdbText = SMALL_PDB,
  gridSize = "2",
  filename = "local-example.pdb",
): Promise<void> {
  await loadUploadedPdb(page, pdbText, filename);
  await page.getByLabel("Grid spacing", { exact: true }).selectOption(gridSize);
  await page.getByRole("button", { name: "Calculate volume" }).click();
}
