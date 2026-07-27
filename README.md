# 3vee WASM tools

Run 3vee molecular-volume tools from PDB coordinates in a browser. Protein structure specialists
get a local Rust/WASM workflow without a calculation server.

Deployment target: [vosslab.github.io/vossvolvox-pages](https://vosslab.github.io/vossvolvox-pages/)

## Select a tool, then calculate

The landing page preserves the original 3vee external-volume and internal-volume tool selector.
Volume Calculation is the first complete browser port; the remaining legacy tools are shown with
their original artwork and port status rather than hidden.

<!-- screenshots:begin (managed by screenshot-docs) -->

![3vee tool selector showing external-volume and internal-volume procedures](docs/screenshots/tool_selector.png)
![Volume setup form with RCSB and local PDB file input choices](docs/screenshots/volume_setup.png)
![2LYZ molecular surface and calculated volume statistics in the browser](docs/screenshots/volume_results.png)
<!-- screenshots:end -->

## From structure to results

The page provides the complete Volume workflow rather than a thin WebAssembly demonstration:

- Load an RCSB PDB entry or select a local PDB file.
- Choose a probe radius, grid spacing, and HETATM/water filters.
- Use the original lysozyme and 50S ribosomal-subunit presets and ported 3vee help.
- Calculate in a cancellable Web Worker so the interface stays responsive.
- Inspect volume, surface area, sphericity, radius, center, atoms, and voxel counts.
- Rotate the molecule and calculated volume surface in the NGL viewer.
- Switch between persistent dark and light interface and NGL palettes.
- Download the exact input, a full MRC occupancy map, and a JSON report.

```text
PDB form -> Web Worker -> Rust/WASM voxel engine -> statistics + NGL + downloads
```

The selected local structure remains in the browser. RCSB mode fetches the selected structure
directly from the RCSB Protein Data Bank; no coordinate text is inserted into the page as HTML.

## Scope and browser limits

This repository currently implements the full Volume Calculation tool and keeps the legacy tool
selector as the site-level structure. GitHub Pages has no server-side compute, filesystem, native
threads, or process execution, so this build uses one Web Worker and a single-threaded WebAssembly
core.

Calculations stop before allocating a bounding grid above 64 million voxels. Large structures can
use a coarser grid or smaller probe. The RCSB biological-assembly option also requires browser
support for streaming gzip decompression; local upload mode does not. Local PDB files are limited
to 30 MB.

## Quick start

Prerequisites are Node.js with npm, stable Rust, the `wasm32-unknown-unknown` Rust target, and
Python 3.12 for the local static server.

```bash
npm ci
rustup target add wasm32-unknown-unknown
./build_github_pages.sh
source source_me.sh && ./run_web_server.sh
```

Open the displayed local URL, keep the 2LYZ defaults, and select **Calculate volume**. The default
0.5 &Aring; grid and 1.5 &Aring; probe produce a 112 x 104 x 124 bounding grid with 142,668
filled voxels.

All JavaScript development and runtime packages are declared in `package.json`; `package-lock.json`
records the resolved installation.

## Memory boundary

The calculation stops before allocating a bounding grid above 64 million voxels. This is the total
`x * y * z` grid size, not the number of filled molecular voxels.

- Each computational grid is bit-packed: 64 million positions use about 8 MB.
- Probe contraction has a bounded three-grid peak of about 24 MB.
- The downloadable mode-0 MRC map stores one byte per grid position and can approach 64 MB.
- The browser also holds WebAssembly memory, the input PDB, results, and NGL viewer data.

For scale, the default 2LYZ calculation uses 1,444,352 bounding-grid positions, about 2.26% of the
limit. The 64-million value is an allocation ceiling, not a promise that every accepted job will
fit every browser and GPU. Large structures can use a coarser grid or smaller probe to reduce the
bounding dimensions.

## Activate Pages deployment

The repository-root `deploy-pages.yml` is the reviewed workflow seed. GitHub discovers workflows
only after a human places them under `.github/workflows/`:

```bash
mkdir -p .github/workflows
git mv deploy-pages.yml .github/workflows/deploy-pages.yml
```

Then set **Settings -> Pages -> Build and deployment -> Source** to **GitHub Actions**.

## Verification

Run the normal source checks and production build:

```bash
./check_codebase.sh
./build_github_pages.sh
```

The scientific parity check always runs a built-in translated, non-unit-grid reference and validates
the MRC2014 placement fields. When the nested 2LYZ fixture exists under
`OTHER_REPOS/vossvolvox-rust/OTHER_REPOS/vossvolvox-cpp/xyzr/`, it also runs the full v26.07
protein reference:

```bash
node tests/e2e/e2e_volume_parity.mjs
```

Pass another compatible PDB path explicitly to run the 2LYZ assertions from a different checkout:

```bash
node tests/e2e/e2e_volume_parity.mjs /path/to/2LYZ.pdb
```

Install the Playwright browsers once, then run all 21 browser tests against the shipped build:

```bash
bash devel/setup_playwright.sh
./run_playwright_tests.sh --build
```

They cover the tool-selector-to-Volume route, RCSB asymmetric and biological-assembly inputs, local
upload, atom filters, validation and HTTP errors, the 64-million-voxel guard, cancellation,
presets, ported tooltips, persistent color modes, MRC/NGL placement, result controls, downloads,
original selector artwork, and the NGL viewer.

Refresh the documentation screenshots from the current production build:

```bash
./tools/capture_readme_screenshots.sh
```

## Documentation

- [docs/E2E_TESTS.md](docs/E2E_TESTS.md) - Whole-system and browser test organization.
- [docs/PLAYWRIGHT_USAGE.md](docs/PLAYWRIGHT_USAGE.md) - Browser-test installation and commands.
- [docs/CHANGELOG.md](docs/CHANGELOG.md) - Implementation decisions and verification history.

## License

The project is distributed under the
[GNU Lesser General Public License v3.0](LICENSE.LGPL-3.0.md).
