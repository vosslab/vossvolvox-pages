# Human guidance

Durable project decisions for the browser implementation of 3vee tools.

## Product identity

- Treat this repository as an independent GitHub Pages WebAssembly implementation alongside the
  C++ and Rust codebases, not merely as a frontend for either one.
- Pursue feature parity selectively. Browser constraints, scientific usefulness, and available
  validation determine which features are ported and when.
- Design for protein structure specialists. Prefer compact scientific controls and terminology
  over general-audience explanation or promotional interface elements.
- Design and validate primarily for desktop and laptop browsers. Keep responsive fallback behavior
  functional where practical, and do not block or label phone use as unsupported, but do not make
  phone-specific UX a product or acceptance target.
- Preserve the existing 3vee tools, content, artwork, help, and publication context when porting
  them into the all-in-one site. Keep polish when it improves the scientific workflow; omit
  decoration and interface structure that do not.
- Keep the landing page as the tool selector as additional tools become available.

## Scientific implementation

- Keep every application-owned operation proportional to the voxel count in low-level Rust/WASM
  running in a Web Worker. TypeScript coordinates input, buffers, interface state, downloads, and
  third-party visualization.
- Keep WASM calculation variables, data flow, and operation order close to `vossvolvox-rust` when
  browser constraints permit. Isolate necessary browser divergences at the ABI, worker, sequential
  execution, and browser-artifact boundaries so future feature parity remains straightforward.
- Use native browser streaming APIs for compression and decompression when they already perform
  the large-byte operation outside application JavaScript.
- Base calculation limits on total voxel and memory cost rather than imposing an arbitrary
  grid-spacing cutoff. Treat exact limits and preview thresholds as evidence-driven policies that
  may evolve.
- Preserve coordinate placement, physical extent, density normalization, and full-resolution
  numerical outputs when creating reduced visualization artifacts.

## Inputs and formats

- Provide realistic PDB input through RCSB retrieval and local file upload. A pasted-PDB textarea
  is not a primary scientific workflow for large structures.
- Use MRC and gzip-compressed MRC for density-map output. EZD is a dead format and is not a porting
  priority.

## Review priorities

- Review scientific correctness, memory ownership, browser responsiveness, maintainability,
  validation, and deployability before visual or naming refinements.
- Prefer adaptable ownership boundaries and replaceable components so later tools can reuse the
  shell, navigation, worker, result, download, and visualization patterns without forced
  uniformity.
