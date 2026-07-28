# Full codebase review

## Review status

This document records the complete LLM-assisted review performed on 2026-07-27. The review began
with the request to inspect the entire codebase and prioritize substantive issues over style. It
then incorporated human corrections and a focused investigation of local uploaded-file handling.

The review used:

- [docs/REPO_STYLE.md](../../REPO_STYLE.md) as the repository decision framework.
- [docs/HUMAN_GUIDANCE.md](../../HUMAN_GUIDANCE.md) for scientific and product priorities.
- The local language, test, and Markdown style guides.
- `ChatGPT_External_Plan_Reviewer_Guidance.md` as the external-review format guide.

Classification: **needs work**. The application has strong local behavior and scientific parity
coverage, but several scientific-output, parser, and deployment-gate issues remain.

This report is LLM reviewer feedback. Final decisions remain with the human reviewer.

## Executive summary

The application has a clear browser architecture: TypeScript owns the interface and artifact
coordination, a Web Worker isolates calculation work, and Rust/WASM owns voxel-scale operations.
The complete local validation suite passes, including native Volume parity. The review initially
found incorrect MRC density statistics, incomplete deployment coverage for the internal tools, and
scientifically ambiguous handling of unknown atom radii. The MRC defect and the missing Rust
deployment gate are now corrected; direct deployment execution of every internal mode remains open.

Local file uploads do not create an image, text, script, or executable execution vulnerability.
Invalid files are processed only as data and normally fail in the PDB parser. The important upload
gaps initially included misleading error classification, silent fallback radii for PDB-like input,
unclear gzip handling, and incomplete privacy verification. The invalid-file, gzip, and privacy
cases are now corrected; structured parser details and unknown-radius policy remain upstream work.

Memory-limit concerns were investigated and then explicitly deferred by the human reviewer. They
are retained as review history rather than active recommendations.

## Review scope

The review covered:

- TypeScript application state, input, cancellation, download, and NGL viewer paths.
- Worker request construction, WASM loading, byte transfer, and artifact ownership.
- Rust/WASM calculation entry points, validation, PDB parsing, voxel algorithms, and MRC output.
- The pinned `vossvolvox-rust` PDB parser used as an upstream source of truth.
- Unit, characterization, end-to-end, and Playwright tests.
- Production build and GitHub Pages deployment workflows.
- Documentation claims about scientific behavior, privacy, limits, and validation.
- Package audit and repository cleanliness.

The review prioritized:

1. Scientific correctness.
2. Invalid-input behavior and parser boundaries.
3. Deployment and regression gates.
4. Browser responsiveness and cancellation.
5. Maintainability and source-of-truth ownership.

Formatting-only and naming-only observations were excluded.

## Architecture summary

The main data flow is:

```text
RCSB response or local File
        |
        v
src/main.ts
  - reads input
  - validates controls
  - owns cancellation and interface state
        |
        v
src/volume_worker.ts
  - loads WASM
  - encodes PDB text
  - invokes one or more calculation entry points
        |
        v
wasm/src/lib.rs
  - parses atoms through vossvolvox-rust
  - validates grid dimensions
  - runs voxel algorithms
  - serializes JSON and MRC artifacts
        |
        v
src/main.ts
  - renders values
  - creates downloads
  - loads the molecule and maps into NGL
```

Important ownership boundaries:

- [src/main.ts](../../../src/main.ts) owns user interaction and completed-run state.
- [src/volume_worker.ts](../../../src/volume_worker.ts) owns the asynchronous WASM boundary.
- [wasm/src/lib.rs](../../../wasm/src/lib.rs) owns browser-specific scientific calculations.
- The pinned upstream PDB implementation owns atom parsing and radius assignment.
- NGL owns third-party molecule and density-map visualization.

These boundaries generally match [docs/HUMAN_GUIDANCE.md](../../HUMAN_GUIDANCE.md).

## Findings summary

| ID | Priority | Finding | Status |
| --- | --- | --- | --- |
| F1 | High | MRC density statistics contradict the map data | Resolved 2026-07-27 |
| F2 | High | The production gate omits internal-tool scientific execution | Partially resolved |
| F3 | High | Unknown atom types silently receive `0.01` angstrom radii | Open upstream |
| F4 | Medium | Invalid uploads share a misleading filter error | Invalid-file case resolved |
| F5 | Medium | Local gzip PDB input receives an unrelated non-ASCII error | Resolved 2026-07-27 |
| F6 | Medium | Unicode in ignored PDB metadata rejects usable coordinates | Open upstream |
| F7 | Medium | The local-processing privacy test does not prove locality | Resolved 2026-07-27 |
| K1 | Known | `MODEL` and `ENDMDL` have input-dependent meaning | Deferred |
| D1 | Deferred | Browser artifact and retained-buffer memory concerns | Human-deferred |

## Confirmed findings

### F1. MRC statistics are incorrect

`write_mrc_bytes()` in [wasm/src/lib.rs](../../../wasm/src/lib.rs) writes the full-resolution
mode-0 occupancy map with:

- `DMIN = 0`
- `DMAX = 0`
- `DMEAN = 0`
- `RMS = 0`

The voxel payload contains both zero and one values for a nonempty molecular map. The header
therefore describes a constant-zero map even when occupied voxels exist.

The [MRC2014 specification](https://www.ccpem.ac.uk/mrc-format/mrc2014/) defines these fields as
data statistics and provides conventions for unknown statistics. Incorrect values can mislead
offline validators, automatic display scaling, and programs that trust the header.

Investigation recommendation:

- Decide whether to calculate exact binary-map statistics or mark them unknown according to the
  format specification.
- Extend the existing MRC behavior test beyond dimensions, axes, sampling, and origin.
- Keep the correction in the Rust MRC writer so every browser tool receives consistent output.

Resolution on 2026-07-27:

- The Rust writer now calculates exact binary-map `DMIN`, `DMAX`, `DMEAN`, and RMS values over the
  declared voxel payload.
- A focused Rust test checks a nontrivial 25-percent occupancy map and its expected RMS deviation.

### F2. Deployment misses internal tools

At review time, the production `deploy-pages.yml` workflow ran:

- `./check_codebase.sh`
- `./build_github_pages.sh`
- `node tests/e2e/e2e_volume_parity.mjs`

The parity script calls `wasm_calculate`, which covers the core Volume calculation and cavity
behavior. It does not call `wasm_calculate_internal`, execute Volume Range orchestration, or run
the Rust test suite.

The published site exposes:

- Volume Calculation.
- Volume Range.
- Channel Finder.
- Single Channel Extraction.
- Solvent Extraction.
- Exit Tunnel Extraction.

Most user-facing procedures can therefore regress scientifically while the Pages deployment
succeeds. The full Playwright suite exercises these paths locally, but it is intentionally absent
from deployment. Several internal-tool browser cases also depend on an ignored local 1JJ2 file and
skip in a clean checkout.

Investigation recommendation:

- Add clean-checkout, inline-input characterization for `wasm_calculate_internal`.
- Run `cargo test --manifest-path wasm/Cargo.toml --locked` in the deployment build job.
- Protect meaningful numerical or behavioral invariants rather than adding the entire browser
  suite to deployment.

Progress on 2026-07-27:

- Both the active workflow and its repository-root seed now run
  `cargo test --manifest-path wasm/Cargo.toml --locked` before the production build.
- This closes the missing Rust-test gate and protects the current internal channel selection,
  cropping, and extraction-coordinate invariants.
- A compact clean-checkout test that directly exercises each `wasm_calculate_internal` mode remains
  open; the full finding is therefore only partially resolved.

### F3. Unknown atom radii are silent

The pinned upstream `radius_for()` returns `0.01` angstrom whenever no radius-table pattern matches
the residue and atom name. The pages wrapper counts those records as normal atoms and reports no
fallback count.

A production-browser characterization used three syntactically valid but unrecognized `ATOM`
records. The application:

- Counted all three records as atoms.
- Reported a successful calculation.
- Returned a molecular volume of zero.
- Displayed no warning about unsupported atom types.

This can silently affect modified residues, custom ligands, unusual atom naming, or coarse-grained
coordinates. It is a scientific parser problem, not an invalid-file execution problem.

The durable source-of-truth fix belongs in `vossvolvox-rust`. Policies to investigate include:

- Use a radius derived from a recognized element when scientifically justified.
- Reject records whose radii cannot be determined.
- Return an unknown-radius count and representative residue or atom names.

At minimum, every-atom fallback or zero occupied voxels should not produce unexplained success.

### F4. Invalid files share one error

The pages wrapper receives only the final filtered atom vector. It cannot distinguish:

- A file with no `ATOM` or `HETATM` coordinate records.
- A PDB containing only one or two atoms.
- A PDB where the selected filters remove most atoms.

All three can produce:

> The selected filters leave fewer than three valid atoms.

For an image, executable, shell script, or unrelated text document, this message incorrectly
suggests that the input was recognized as a PDB and then reduced by filters.

The upstream parser boundary should expose enough structured information to classify:

- No coordinate records.
- Malformed coordinate records.
- Parsed atom count before filters.
- Retained atom count after filters.
- Unknown-radius records.

Suggested user-facing distinctions:

- "This file does not contain PDB coordinate records."
- "PDB coordinate record on line N is malformed."
- "This PDB contains fewer than three atoms."
- "The selected filters leave fewer than three atoms."

This fixes the parser design instead of accumulating browser-side extension checks.

Progress on 2026-07-27:

- The browser-specific Rust boundary now inspects record tags and rejects bytes with no `ATOM` or
  `HETATM` records before invoking the pinned upstream parser.
- Images, executables, shell scripts, and unrelated text now receive the direct no-coordinate-record
  message instead of a filter message.
- Structured malformed-record, pre-filter-count, and unknown-radius reporting still belongs
  upstream, so the broader parser-design recommendation remains open.

### F5. Local gzip input is unclear

At review time, the RCSB biological-assembly path in [src/main.ts](../../../src/main.ts) used
`DecompressionStream`, while the local input path always called `File.text()`.

A local `.pdb.gz` or `.pdb1.gz` file therefore produces a generic non-ASCII PDB error. This is safe
but misleading. RCSB distributes legacy biological assemblies in this compressed form, as shown
in its [File Download Services](https://www.rcsb.org/docs/programmatic-access/file-download-services)
documentation.

Investigation recommendation:

- Reuse one browser-native PDB decoding boundary for remote and local input.
- Prefer gzip detection by bytes or recognized filename, followed by `DecompressionStream`.
- If local gzip remains unsupported, detect it and return a direct format message.
- Add compressed/uncompressed behavior parity using inline generated test input.

Resolution on 2026-07-27:

- Remote biological assemblies and local files now use one browser-native gzip decoder.
- Local gzip detection recognizes `.gz`, `application/gzip`, or the gzip magic bytes.
- The file selector advertises common PDB gzip forms, invalid gzip has a direct decompression
  message, and a generated inline gzip PDB completes the same calculation as plain input.

### F6. Ignored Unicode metadata rejects input

The upstream parser checks whether each complete line is ASCII before checking whether the record
is `ATOM` or `HETATM`.

A characterization added one non-ASCII name to a `REMARK` line followed by otherwise usable ASCII
coordinates. The parser rejected line one before considering any coordinate records.

Strict fixed-column validation remains appropriate for coordinate records. Metadata that the
calculation does not consume need not block those coordinates.

Investigation recommendation:

- Identify the record tag before validating coordinate-record character constraints.
- Continue rejecting non-ASCII or malformed `ATOM` and `HETATM` records.
- Ignore unrelated metadata records that do not participate in the calculation.

### F7. Privacy coverage is incomplete

At review time, the Playwright test named "uploaded PDB stays local" in
[tests/playwright/input_modes.spec.ts](../../../tests/playwright/input_modes.spec.ts) checked the
result filename and atom count but did not observe network requests.

Source inspection found no upload-to-server path, so this is a validation gap rather than a
confirmed privacy defect.

Investigation recommendation:

- Observe requests made after local file selection.
- Verify that no coordinate-bearing remote request occurs.
- Keep the test behavior-focused and independent of a fixed request count for static assets.

Resolution on 2026-07-27:

- The durable local-upload browser test now observes post-load requests and verifies that no
  off-origin request occurs during file selection, calculation, or result rendering.
- A deterministic delayed-`File.text()` regression also verifies that cancellation prevents the
  stale local calculation from resuming.

## Upload security review

### Processing boundary

The local-file path performs these operations:

1. The file control in [src/index.html](../../../src/index.html) suggests PDB or text input.
2. `readInput()` checks selection and the existing size policy.
3. `File.text()` decodes the selected file.
4. `startCalculation()` verifies cancellation state.
5. The browser sends structured request data to the Web Worker.
6. The worker encodes the text and copies it into WASM.
7. Rust parses PDB coordinate records.
8. NGL receives the molecule only after successful calculation.

### Invalid content behavior

| Selected content | Current behavior | Security result |
| --- | --- | --- |
| PNG, JPEG, or binary image | Usually rejected as non-ASCII PDB text | Not executed |
| Binary executable | Usually rejected as non-ASCII PDB text | Not executed |
| ASCII executable or script | Rejected after finding too few atoms | Not executed |
| Ordinary non-PDB text | Rejected after finding too few atoms | Not executed |
| Malformed PDB | Rejected with coordinate and line context | Controlled error |
| Gzip PDB | Rejected as non-ASCII text | Safe but misleading |
| PDB-like text with three coordinate records | Parsed as coordinate data | Expected |
| Unknown atom patterns | Accepted with fallback radii | Scientific gap |

### Security conclusion

No executable-upload vulnerability was found.

- `File.text()` reads content as data.
- The application does not use `eval`, shell execution, or dynamic code import.
- Worker messages contain structured data.
- Uploaded PDB text is not assigned to `innerHTML`.
- The displayed input label uses `textContent`.
- Generated download stems replace unsafe filename characters.
- Invalid input does not reach NGL unless it satisfies the coordinate parser.
- The File API exposes the selected file, not an arbitrary filesystem path.

An executable-specific regression test would duplicate the binary-input behavior and add little
value. One inline binary case and one unrelated ASCII-text case cover the important distinction.

## Corrected findings

### `MODEL` and `ENDMDL`

The initial review classified unconditional model merging as a high-severity defect. A controlled
WASM experiment showed that two translated `MODEL` blocks were combined into one calculation.

That interpretation was incomplete. RCSB documents that legacy biological-assembly PDB files use
`MODEL` records to separate symmetry-generated parts of one assembly. For the application's
biological-unit path, combining all such records is correct. The experiment reproduced a valid
assembly pattern rather than proving a defect.

Current disposition:

- RCSB biological assembly: use every model block.
- Ordinary NMR ensemble: first model, every model, or ensemble envelope is a scientific policy.
- Arbitrary upload: the intent cannot be inferred reliably from `MODEL` alone.

The human reviewer directed that this remain a known issue without a current fix. It is not an
active readiness blocker.

Official background:

- [RCSB guide to coordinate records](https://pdb101.rcsb.org/learn/guide-to-understanding-pdb-data/dealing-with-coordinates)
- [RCSB guide to biological assemblies](https://pdb101.rcsb.org/learn/guide-to-understanding-pdb-data/biological-assemblies)

### Memory findings

The initial review raised:

- No aggregate byte cap for Channel Finder layer MRC payloads.
- Retention of full-resolution `downloadMrc` buffers after Blob creation.
- Repeated compression of the representative Volume Range layer.
- No explicit size limit for remote RCSB response text after decompression.

Repository documentation already classifies multi-channel exhaustion as a pathological risk, and
the human reviewer stated that the existing memory limits are fine for now. These concerns are
therefore deferred and excluded from the active recommendations in this report.

This disposition does not claim that every accepted near-limit workload fits every browser. It
records that further memory work is not a current project priority.

## Confirmed strengths

The review found the following behavior sound:

- Calculation work runs in a Web Worker rather than blocking the main interface thread.
- Cancelling a delayed RCSB request aborts the fetch.
- Cancelling a delayed local `File.text()` read cannot later start a stale worker.
- Worker termination cancels in-flight WASM calculation work.
- WASM input allocation is consumed exactly once with `Box::from_raw`.
- PDB coordinate parsing rejects malformed and non-finite coordinates with line context.
- Empty input produces a controlled error.
- Grid dimensions are rejected before allocation when they exceed the 64-million policy.
- TypeScript uses strict types across source, tests, and tools.
- MRC origins and dimensions preserve Cartesian placement.
- Preview binning preserves full-resolution numerical and download artifacts.
- Volume Range and Channel Finder retain distinct, coordinate-preserving surface layers.
- Download and viewer state is invalidated when a calculation becomes stale.
- User-provided filenames are displayed with `textContent` and sanitized for generated downloads.
- Source inspection finds no path that uploads a local coordinate file to a calculation server.
- Package audit found no current production dependency vulnerability.

## Validation evidence

The review ran the following current checks:

| Validation | Result |
| --- | --- |
| `./check_codebase.sh` | Passed all TypeScript source gates |
| `source source_me.sh && python3 -m pytest tests/` | 497 passed |
| `cargo test --manifest-path wasm/Cargo.toml --locked` | 9 passed |
| `cargo clippy --manifest-path wasm/Cargo.toml --all-targets --locked -- -D warnings` | Passed |
| `./build_github_pages.sh` | Production build passed |
| `node tests/e2e/e2e_volume_parity.mjs` | All available parity cases passed |
| `./run_playwright_tests.sh` | 39 passed locally |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | Passed |

The optional 2LYZ and 1JJ2 files were present in the local review environment, so the broader local
suite exercised cases that skip in a clean checkout.

### Characterization experiments

Two sets of disposable tests reduced uncertainty:

1. A production-WASM multi-model experiment confirmed that every `MODEL` block contributes atoms.
   Follow-up RCSB documentation changed the interpretation from defect to known ambiguity.
2. Six disposable Playwright cases characterized empty input, malformed coordinates, gzip input,
   Unicode metadata, unknown atom radii, and cancellation during a delayed local read.

The initial characterization files were removed after the review. Corrected gzip, invalid-file,
privacy, and local-cancellation behavior now has focused durable coverage; cases that still
describe current upstream behavior were not committed as desired behavior.

## Test recommendations

New tests should protect corrected behavior and follow
[docs/PYTEST_STYLE.md](../../PYTEST_STYLE.md) and
[docs/PLAYWRIGHT_TEST_STYLE.md](../../PLAYWRIGHT_TEST_STYLE.md).

High-value durable cases:

1. Validate the chosen unknown-radius policy with inline upstream Rust parser input.
2. Exercise every internal WASM tool from a clean checkout with compact inline coordinate input.
3. Upload ordinary ASCII text and expect the same clear no-PDB-records behavior already covered for
   a short inline image signature.

Tests to avoid:

- One test per executable or image format when they exercise the same binary-input path.
- Assertions tied to the exact input-size or memory-limit constants.
- Tests that freeze gzip rejection, Unicode-metadata rejection, or zero-volume fallback success.
- External fixtures when short inline data expresses the behavior.
- Full browser-suite deployment when focused scientific ABI characterization is sufficient.

## Suggested priority

The reviewer recommends that the manager investigate work in this order:

1. Resolve unknown atom-radius policy in upstream `vossvolvox-rust`.
2. Add clean-checkout deployment coverage for every internal WASM entry-point mode.
3. Return structured upstream PDB parse outcomes for malformed records, filter counts, and unknown
   radii.
4. Decide whether ignored Unicode metadata should be accepted upstream.

The `MODEL` ambiguity and memory concerns remain documented deferrals.

## Final assessment

The codebase is substantially stronger than a typical browser scientific port: it has explicit
scientific documentation, native parity evidence, strict TypeScript, Rust ownership of voxel work,
worker isolation, reproducible builds, and broad browser behavior coverage.

The remaining highest-value improvements are narrow and identifiable. They concern atom-radius
validity, upstream structured parser outcomes, ignored Unicode metadata, and clean deployment proof
for every internal-tool entry mode. Images, ordinary text, and executables do not create a
code-execution path and now receive a direct no-coordinate-record error in the current upload
architecture.

This report is LLM reviewer feedback, not human approval. The human reviewer owns final scope,
scientific policy, implementation decisions, and release readiness.
