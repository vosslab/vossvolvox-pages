# Changelog

## 2026-07-27

### Additions and New Features

- Expanded Playwright coverage from one smoke test to 21 browser tests across every input mode,
  atom filters, validation and HTTP errors, the voxel limit, cancellation, presets, result
  controls, ported help, color-mode persistence, original artwork, MRC/NGL placement, downloads,
  and the NGL viewer.
- Added reproducible tool-selector, Volume setup, and 2LYZ result screenshots under
  `docs/screenshots/`.
- Added `tools/capture_readme_screenshots.sh` to rebuild, serve, and refresh all three
  documentation screenshots through Playwright, plus a temporary light-mode NGL result for
  visual QA.
- Ported the applicable 3vee-server Volume tooltips and restored the 50S ribosomal-subunit preset.
- Restored the site landing page as the original 3vee external-volume and internal-volume tool
  selector, with Volume Calculation available and later ports identified explicitly.
- Restored the six original 3vee selector images as compact identifiers inside their corresponding
  tool cards.

### Behavior or Interface Changes

- Made RCSB downloads abortable so cancelling during a pending fetch cannot resume an old
  calculation.
- Refreshed the README around the complete browser workflow, explicit shell commands, current
  screenshots, browser limits, and verified test coverage.
- Replaced the oversized promotional header and decorative compute graphics with a compact
  specialist-facing interface organized around PDB input, probe radius, voxel spacing, and
  coordinate filters.
- Arranged Structure and Parameters side by side at desktop widths so the complete form fits a
  16:10 viewport without scrolling.
- Made the calculated surface translucent by default, disabled transparent-surface depth writes,
  and wired the opacity slider directly to its NGL representation so the molecular ribbon remains
  visible inside the density map.
- Replaced low-contrast automatic ribbon colors with an explicit accessible chain palette and
  rendered angstrom units as `&Aring;`, `&Aring;&sup2;`, and `&Aring;&sup3;`.
- Renamed the water filter to "Exclude water molecules" so the interface does not assume that
  every PDB coordinate set came from X-ray crystallography.
- Added compact, persistent dark and light interface modes through semantic color tokens while
  giving the NGL viewport its own measured light and dark scientific palettes.
- Rendered the sphericity tooltip's squared-volume term as `V&sup2;` from ASCII-safe source.

### Fixes and Maintenance

- Updated the GitHub Pages workflow seed to use current action majors and `npm ci`.
- Scoped Pages write and OpenID Connect permissions to the deployment job.
- Added source checks and the full Chromium suite as required pre-deployment gates.
- Made the Rust cache target explicit and retained active production deployments when newer
  commits enter the Pages concurrency group.
- Added a self-contained translated-grid scientific parity and MRC2014 placement gate to the Pages
  workflow seed; the larger 2LYZ comparison still runs when its optional sibling fixture exists.
- Removed the broken `src/init.ts` build fallback, repaired the clean-script package alias, and
  consolidated duplicated calculation teardown.
- Replaced cancellation-test synchronization on Playwright's browser-specific `requestfailed`
  event with explicit routed-request lifecycle promises.

### Removals and Deprecations

- Removed pasted PDB text as an input mode; realistic structures are too large for a practical
  textarea, while RCSB lookup and local file selection cover the scientific workflow with less
  untrusted-text surface.

### Decisions and Failures

- Kept screenshot capture as an explicit script under `tools/` instead of hiding it behind a
  `package.json` command alias.
- Kept both dark- and light-mode NGL visual checks inside the repository screenshot harness
  instead of relying on ad hoc Node commands that require separate approval.
- Removed the initial general-audience landing-page treatment after confirming that the tool is
  for protein structure specialists.
- Used stable PNGs rather than an animated GIF because the setup controls and numerical results
  benefit from inspection, while animation would not add evidence.
- Replaced the initial five-atom result capture with the real 2LYZ parity fixture so the visual
  demonstrates a meaningful protein surface.
- Kept `deploy-pages.yml` as the repository-root workflow seed required by the shared TypeScript
  style; the README now documents the human activation move into `.github/workflows/`.
- Retained 64 million voxels as an allocation ceiling, not a cross-browser reliability promise;
  a near-limit calculation plus NGL render remains unmeasured.

### Developer Tests and Notes

- Confirmed all 21 Playwright tests pass against the production `dist/` build.
- Confirmed all three documentation images are 1600 x 1000 and remain below 1 MB.
- Measured every ribbon color at greater than 9:1 against the `#07131f` viewer background.
- Measured the light-mode text and control pairs at or above 4.5:1 and visually checked the
  complete setup form at 1600 x 1000.
- Measured all six light-viewer chain colors at greater than 5:1 against the `#edf4f5` NGL
  background and the light surface base at 4.93:1.
- Confirmed the translated-grid parity, MRC2014 header, NGL placement, over-limit rejection, and
  2LYZ v26.07 comparisons all pass.
- Confirmed Rust tests, WASM clippy with warnings denied, and all 463 fast Python hygiene tests
  pass.
- Ran six independent audit passes over plan compliance, tests, style, documentation, legacy code,
  and comments, then fixed every confirmed high- and medium-severity issue except the explicitly
  retained unmeasured near-limit browser workload.
- Reworked browser checks against the repository test checklist: removed pixel comparisons,
  hardcoded collection counts, fixed-frame waits, unasserted actions, and oversized assertion
  groups in favor of mocked inputs and visible or domain-state behavior.
- Verified the referenced GitHub action major tags directly against their upstream repositories.

## 2026-07-26

### Additions and New Features

- Added a complete browser Volume workflow for RCSB, uploaded, and pasted PDB structures.
- Added a Rust WebAssembly engine pinned to vossvolvox-rust v26.07.
- Added volume, surface, shape, center, grid, and atom results with PDB, MRC, and JSON downloads.
- Added an interactive NGL molecule and calculated-volume viewer.
- Added a package manifest dependency on NGL and a regenerated npm lockfile.
- Added automated GitHub Pages Rust/WASM build and deployment support.
- Added 2LYZ numerical parity and Playwright form-to-results tests.

### Behavior or Interface Changes

- Set the browser calculation limit to 64 million bounding-grid voxels.
- Display both filled molecular voxels and total bounding-grid voxels in results.
- Run calculations in a cancellable Web Worker to keep the page responsive.

### Fixes and Maintenance

- Replaced the contraction step's duplicate-heavy index vector with a bounded bit-packed mask.
- Replaced the assumed-capacity WASM input vector with an exact-size boxed allocation.
- Ignored the local Rust build target directory.

### Decisions and Failures

- Kept the 64-million limit after measuring that one bit-packed grid uses 8 MB and that the
  contraction algorithm needs three bounded bit-packed grids.
- Distinguished compact computation grids from the dense mode-0 MRC result and NGL viewer memory.
- Corrected the Playwright smoke test to click the visible segmented-control label.

### Developer Tests and Notes

- Confirmed 2LYZ at a 0.5 A grid and 1.5 A probe uses a 112 x 104 x 124 bounding grid:
  1,444,352 total positions and 142,668 filled voxels.
- Confirmed the WASM result matches vossvolvox-rust v26.07 for 2LYZ volume and surface area.
- Confirmed grids above 64 million bounding voxels stop before grid allocation.
- Confirmed the production build and full paste-form-to-results browser workflow.
