# Changelog

## 2026-07-27

### Additions and New Features

- Ported Volume Range, Channel Finder, Single Channel Extraction, Solvent Extraction, and Exit
  Tunnel Extraction into the GitHub Pages application with shared Rust/WASM calculation,
  Web Worker, result, MRC, JSON, CSV, and NGL viewer paths.
- Added Rust characterization coverage for ranked channel selection and strict native-style volume
  and percentage cutoffs.
- Added `docs/HUMAN_GUIDANCE.md` to preserve the project's scientific audience, independent WASM
  ownership, selective feature-parity goals, low-level voxel-processing boundary, supported
  inputs and formats, and review priorities.
- Added an opt-in "Fill internal cavities" Volume control matching the released
  `VolumeNoCav.exe` calculation order.
- Added `docs/GEOMETRY_MODEL.md` to define coordinates, voxel connectivity, cavity treatment,
  numerical behavior, and the native oracle.
- Expanded Playwright coverage from one smoke test to 26 browser tests across every input mode,
  atom filters, validation and HTTP errors, the voxel limit, cancellation, presets, result
  controls, ported help, color-mode persistence, original artwork, MRC/NGL placement, downloads,
  and the NGL viewer.
- Added reproducible tool-selector, Volume setup, and 2LYZ result screenshots under
  `docs/screenshots/`.
- Added `tools/capture_readme_screenshots.sh` to rebuild, serve, and refresh all three
  documentation screenshots through Playwright, plus a temporary light-mode NGL result for
  visual QA.
- Added `tools/benchmark_grid_sizes.mjs` to measure candidate voxel spacings with the production
  WASM engine and a real PDB structure.
- Added a shared project footer linking the tool selector, source repository, and 3V publication.
- Added route-aware breadcrumbs for setup, running, result, and error states.
- Added browser-native gzip compression for MRC downloads with an uncompressed fallback.
- Added adaptive, coordinate-preserving MRC binning for the NGL preview so maps above 8 million
  voxels do not expand directly into full-resolution `Float32Array` density data.
- Ported the applicable 3vee-server Volume tooltips and restored the 50S ribosomal-subunit preset.
- Restored the site landing page as the original 3vee external-volume and internal-volume tool
  selector, with Volume Calculation available and later ports identified explicitly.
- Restored the six original 3vee selector images as compact identifiers inside their corresponding
  tool cards.

### Behavior or Interface Changes

- Reworked the repeat-use tool selector into a stable one-to-two category grid with equal-width,
  image-first cards, measured per-tool color identities in dark and light modes, and more useful
  vertical spacing; removed the redundant "Available" label from all six working tools.
- Replaced three full-width README screenshots with compact dark- and light-mode pairs for the
  selector, Volume setup, and 2LYZ result so both themes are visible without doubling page length.
- Marked all six selector tools available and added tool-specific probe ranges, coordinates,
  channel-size filters, presets, status text, measurement tables, and download descriptions.
- Kept the browser calculation variables and operation order close to `vossvolvox-rust`; isolated
  browser-specific behavior to the C ABI, worker, sequential execution, combined map, and
  representative-map boundaries.
- Represented a Volume Range as a complete numerical CSV/JSON series plus the final-probe MRC, and
  represented Channel Finder as a ranked component table plus one combined MRC capped at 12
  selected channels.
- Added "Very high - 0.40 A" and "Ultra - 0.25 A" grid choices while retaining 0.50 angstrom as
  the default, with approximate relative voxel costs shown beside the selector.
- Removed hard minimum and maximum grid-spacing checks from WASM; any finite positive spacing is
  valid, while the computed 64-million bounding-grid ceiling remains the allocation guard.
- Replaced panel-specific "All tools" links with one state-derived breadcrumb component so future
  tools can inherit navigation without duplicating markup.
- Report cavity treatment in the result summary and JSON report, and distinguish cavity-filled
  MRC and JSON filenames with `volume-no-cav`.
- Restored the original server's compressed MRC delivery as `.mrc.gz` without changing the
  full-resolution occupancy artifact.
- Kept calculations, measurements, and downloads at the selected grid while treating the NGL
  surface as a clearly labeled display artifact: full resolution through 8 million voxels and
  exact bin 2 through the current 64-million ceiling.
- Normalized binned preview density to fractional occupancy so every NGL surface retains the 0.5
  isolevel, and placed binned samples at their source-block centers.
- Removed unreachable bin-3 scaffolding and require complete bin blocks, preserving the original
  MRC extent instead of creating ambiguous partial edge cells.
- Made RCSB downloads abortable so cancelling during a pending fetch cannot resume an old
  calculation.
- Refreshed the README around the complete browser workflow, explicit shell commands, current
  screenshots, browser limits, and verified test coverage.
- Reframed the README for structural biologists around the biological importance of internal
  macromolecular volumes, rolling-probe theory, the two-surface 3V method, result interpretation,
  and a browser-based 2LYZ example; moved deployment, memory-cap, benchmark, and developer-test
  detail from the scientific landing page into `docs/DEVELOPMENT.md`.
- Restored the confirmed live GitHub Pages link near the README opening and removed the stale
  statement that the browser tool had no public address.
- Removed unavailable live-site links from the README and kept the current deployment status
  explicit before the worked example.
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

- Prevented delayed gzip or NGL result rendering from restoring stale downloads or viewer data
  after New calculation or tool navigation invalidates the completed run.
- Cleared and disposed the NGL stage, viewer DOM, viewer metadata, control state, result tables,
  downloads, and calculation references whenever a user selects New calculation or changes tools.
- Documented that the fixed deposited-1JJ2 tunnel seeds originated in Dr. Neil Voss's PhD thesis
  work and remain specific to the H. marismortui 50S coordinate system.
- Removed the Chromium installation and Playwright browser suite from the GitHub Pages deployment
  path; the workflow now builds, runs the focused scientific parity gate, and publishes `dist/`.
- Made Playwright's managed static server invoke Bash explicitly so Linux does not run the
  `source source_me.sh` command through a `/bin/sh` implementation that lacks `source`.
- Moved adaptive preview block summation, normalization, density statistics, and mode-2 MRC
  serialization from TypeScript into the Rust WebAssembly worker. TypeScript now only transfers
  the full-resolution and preview artifacts, so no application-owned JavaScript loop traverses
  every voxel.
- Clarified that the WASM implementation owns its browser-specific behavior independently from the
  C++ and Rust codebases.
- Updated the GitHub Pages workflow seed to use current action majors and `npm ci`.
- Scoped Pages write and OpenID Connect permissions to the deployment job.
- Kept source checks as a required pre-deployment gate while leaving the Chromium suite behind its
  explicit `run_playwright_tests.sh` command.
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

- Set desktop and laptop browsers as the interface design and acceptance target while retaining
  responsive fallback behavior and allowing phone access; phone-specific UX and screenshot
  acceptance remain outside the product target.
- Exposed both 0.40- and 0.25-angstrom choices after measuring real 2LYZ workloads; the finer
  option remains safe because total bounding voxels, not spacing, control pre-allocation rejection.
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

- Measured all six selector title accents against their real card surfaces: dark-mode ratios range
  from 10.41:1 to 13.44:1 and light-mode ratios range from 6.27:1 to 7.60:1, exceeding the
  repository's 5.5:1 house target.
- Confirmed the complete TypeScript check gate and all 34 Playwright tests pass, including opening
  every tool and returning through "All tools", then refreshed and visually inspected the managed
  1600 by 1000 screenshots through `./tools/capture_readme_screenshots.sh`.
- Expanded light-mode verification so the browser suite preserves the theme through tool entry,
  "All tools" return navigation, and reload, while the repository screenshot harness now captures
  and commits the selector, setup form, and calculated result in both modes.
- Confirmed all 30 focused Markdown-link and README checks pass with the three new light-mode PNGs
  included as tracked documentation assets.
- Audited the test suite against `docs/PYTEST_STYLE.md`: all 490 fast pytest checks pass, each
  remains well under one second, the browser tests remain in the designated Playwright lane, and
  no tests need deletion or relocation.
- Added separate local uploaded-PDB Playwright calculations for all six tools. Channel Finder,
  Single Channel, and Exit Tunnel reuse the ignored native 1JJ2 reference when it is available and
  otherwise skip with its expected local path.
- Added a delayed-gzip browser regression proving New calculation invalidates asynchronous result
  rendering before stale downloads or NGL viewer state can return.
- Matched the production WASM internal tools against the native v26.07 Rust binaries on 1JJ2 at a
  2.00-angstrom grid: Solvent returned 266,328 cubic angstroms, 146,035.438 square angstroms, and
  7,451 accessible voxels; Single Channel returned 12,224 cubic angstroms, 4,773.046 square
  angstroms, and 394 accessible voxels; the two largest Channel Finder results were 26,944 and
  19,648 cubic angstroms; and Exit Tunnel returned 16,472 cubic angstroms, 5,956.040 square
  angstroms, 4,760 accessible cubic angstroms, and 5.013 percent accessibility.
- Added browser regression coverage for clearing NGL DOM and metadata on New calculation, all
  newly available tool routes, a three-point Volume Range with CSV and representative MRC, and a
  deterministic internal Solvent Extraction through production WASM.
- Refreshed the managed `tool_selector.png`, `volume_setup.png`, and `volume_results.png`
  documentation captures through `./tools/capture_readme_screenshots.sh`; the selector now records
  all six procedures as available.
- Confirmed all 34 Playwright tests pass against a fresh production build.
- Added Rust characterization tests for opt-in cavity filling and for preview resolution
  selection, normalized bin-2 density, coordinate/extent preservation, and incomplete-block
  rejection.
- Added a cavity-sensitive 2LYZ parity case matching the C++ `VolumeNoCav.exe` oracle: four
  accessible-grid voxels filled, 17,863.000 cubic angstroms, and 5,430.653 square angstroms.
- Added a compact cavity-sensitive cage oracle that runs in clean checkouts and matches the C++
  Volume result (1,411.250 cubic angstroms) and VolumeNoCav result (27 accessible voxels filled,
  1,450.125 cubic angstroms).
- Measured production WASM 2LYZ grids at 2,715,648 voxels for 0.40 angstrom and 8,915,712 voxels
  for 0.25 angstrom, versus 1,444,352 at the 0.50-angstrom default.
- Measured 1JJ2 at 1,951,488 voxels for 2.00 angstrom, 12,300,800 for 1.00 angstrom, and
  27,713,664 for 0.75 angstrom; confirmed its 90.9-million-voxel 0.50-angstrom grid is rejected
  before allocation.
- Confirmed all 26 Playwright tests pass against the production `dist/` build, including
  independent gzip validation and the adaptive binned-NGL path above 8 million voxels.
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
