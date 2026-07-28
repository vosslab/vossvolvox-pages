# Development and deployment

Build, verification, resource-limit, benchmark, and deployment notes for maintainers of the 3vee
browser tools.

## Local environment

Prerequisites are Node.js with npm, stable Rust, the `wasm32-unknown-unknown` Rust target, and
Python 3.12 for the local static server.

```bash
npm ci
rustup target add wasm32-unknown-unknown
./build_github_pages.sh
source source_me.sh && ./run_web_server.sh
```

Open the displayed local URL, select **Volume Calculation**, and keep the 2LYZ defaults for a quick
manual check. The 0.5 &Aring; grid and 1.5 &Aring; probe produce a 112 x 104 x 124 bounding grid with
142,668 filled voxels.

All JavaScript development and runtime packages are declared in `package.json`;
`package-lock.json` records the resolved installation.

## Browser resource boundary

The calculation stops before allocating a bounding grid above 64 million voxels. This limit applies
to the total `x * y * z` grid, not the number of filled molecular voxels.

- Each computational grid is bit-packed: 64 million positions use about 8 MB.
- Probe contraction has a bounded three-grid peak of about 24 MB.
- Filling internal cavities also uses at most three simultaneous bit-packed grids, although its
  double-probe padding can create a larger bounding grid than ordinary Volume.
- A mode-0 MRC map stores one byte per grid position before gzip compression and can approach 64 MB
  in browser memory.
- NGL uses the full-resolution map through 8 million voxels, then displays a normalized bin-2
  preview. Numerical results and the downloaded map retain the selected grid.
- Channel Finder does not retain one protein-sized MRC grid per result. Each selected channel is
  cropped to its occupied bounds with one voxel of padding, its dimensions are aligned to
  multiples of four, and its MRC origin is shifted to preserve the original Cartesian placement.
- The browser also holds WebAssembly memory, input coordinates, result data, and NGL viewer data.

The default 2LYZ calculation uses 1,444,352 bounding-grid positions, about 2.26% of the limit. The
64-million value is an allocation ceiling, not a guarantee that every accepted job fits every
browser and GPU. The audit concern about multiple Channel Finder layers exhausting memory is
therefore a low-severity pathological case rather than an expected cost of the shared viewer. A
long channel can still have a large rectangular crop, and several unusually large full-resolution
channel layers have no aggregate byte cap.

## Grid-size benchmarks

The production WebAssembly benchmark for 2LYZ with a 1.5 &Aring; probe measured 2,715,648 bounding
voxels at 0.40 &Aring; and 8,915,712 at 0.25 &Aring;.

```bash
./build_github_pages.sh
./tools/benchmark_grid_sizes.mjs /path/to/2LYZ.pdb
```

For the 1JJ2 ribosomal subunit, the benchmark measured 1,951,488 voxels at 2.00 &Aring;,
12,300,800 at 1.00 &Aring;, and 27,713,664 at 0.75 &Aring;. A 0.50 &Aring; request was rejected
before grid allocation because its 90.9 million voxels exceed the browser ceiling.

```bash
./tools/benchmark_grid_sizes.mjs /path/to/1JJ2.pdb 2 1 0.75 0.5
```

## Source verification

Run the normal source checks and production build:

```bash
./check_codebase.sh
./build_github_pages.sh
```

The scientific parity check always runs a translated, non-unit-grid reference and validates the
MRC2014 placement fields. When the nested 2LYZ fixture exists under
`OTHER_REPOS/vossvolvox-rust/OTHER_REPOS/vossvolvox-cpp/xyzr/`, it also runs the full v26.07
protein reference:

```bash
node tests/e2e/e2e_volume_parity.mjs
```

Pass another compatible PDB path explicitly to run the 2LYZ assertions from a different checkout:

```bash
node tests/e2e/e2e_volume_parity.mjs /path/to/2LYZ.pdb
```

## Browser verification

Install the Playwright browsers once, then run the browser suite against the production build:

```bash
bash devel/setup_playwright.sh
./run_playwright_tests.sh --build
```

The suite covers tool selection, RCSB and local inputs, coordinate filters, validation, resource
limits, cancellation, presets, help, color modes, MRC/NGL placement, result controls, downloads,
selector artwork, viewer reset, Volume Range, and the shared internal-volume WASM path.

Run each of the six tools as its own local uploaded-PDB calculation:

```bash
./run_playwright_tests.sh --build tests/playwright/ported_tools.spec.ts
```

Volume Calculation, Volume Range, and Solvent Extraction use inline PDB inputs. Channel Finder,
Single Channel Extraction, and Exit Tunnel Extraction use the ignored native reference fixture at
`OTHER_REPOS/vossvolvox-rust/OTHER_REPOS/vossvolvox-cpp/xyzr/1JJ2.pdb`; those three tests report a
skip with the expected path when that local fixture is absent.

Refresh the documentation screenshots from the current production build:

```bash
./tools/capture_readme_screenshots.sh
```

## Activate Pages deployment

The repository-root `deploy-pages.yml` is the reviewed workflow seed. GitHub discovers workflows
only after a maintainer places the file under `.github/workflows/`:

```bash
mkdir -p .github/workflows
git mv deploy-pages.yml .github/workflows/deploy-pages.yml
```

Then set **Settings -> Pages -> Build and deployment -> Source** to **GitHub Actions**.
