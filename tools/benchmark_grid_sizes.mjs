#!/usr/bin/env node
// Measure candidate grid spacings with the shipped single-threaded WASM engine.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const pdbPath = process.argv[2];
if (pdbPath === undefined) {
  console.error("Usage: ./tools/benchmark_grid_sizes.mjs PDB_PATH [GRID_SIZE ...]");
  process.exit(2);
}
const requestedGridSizes =
  process.argv.length > 3 ? process.argv.slice(3).map(Number) : [2, 1, 0.75, 0.5, 0.4, 0.25];
const invalidGridSize = requestedGridSizes.find(
  (gridSize) => !Number.isFinite(gridSize) || gridSize <= 0,
);
if (invalidGridSize !== undefined) {
  throw new Error(`Invalid grid spacing: ${invalidGridSize}`);
}

const wasmBytes = await readFile(path.join(repoRoot, "dist/vossvolvox_wasm.wasm"));
const wasmModule = await WebAssembly.compile(wasmBytes);
const pdbBytes = await readFile(pdbPath);

async function calculate(gridSize) {
  const instance = await WebAssembly.instantiate(wasmModule, {});
  const exports = instance.exports;
  const pointer = exports.wasm_input_alloc(pdbBytes.length);
  new Uint8Array(exports.memory.buffer, pointer, pdbBytes.length).set(pdbBytes);
  const startedAt = performance.now();
  const status = exports.wasm_calculate(pointer, pdbBytes.length, 1.5, gridSize, 0, 1, 0);
  const elapsedMilliseconds = performance.now() - startedAt;
  const resultPointer = exports.wasm_result_pointer();
  const resultLength = exports.wasm_result_length();
  const resultBytes = new Uint8Array(exports.memory.buffer, resultPointer, resultLength);
  const result = JSON.parse(new TextDecoder().decode(resultBytes));
  return { elapsedMilliseconds, result, status };
}

console.log(`PDB: ${pdbPath}`);
console.log("Probe: 1.5 A; ordinary Volume method");
console.log("grid_A  dimensions         bounding_voxels  MRC_MB  elapsed_ms");
for (const gridSize of requestedGridSizes) {
  const { elapsedMilliseconds, result, status } = await calculate(gridSize);
  if (status !== 0 || !result.ok) {
    console.log(
      [
        gridSize.toFixed(2).padStart(6),
        "REJECTED".padEnd(18),
        "-".padStart(15),
        "-".padStart(7),
        elapsedMilliseconds.toFixed(1).padStart(10),
      ].join("  "),
    );
    console.log(`        ${result.error ?? `WASM calculation failed with status ${status}`}`);
    continue;
  }
  const dimensions = `${result.dimensions.x}x${result.dimensions.y}x${result.dimensions.z}`;
  const mrcMegabytes = result.mrcBytes / 1_000_000;
  console.log(
    [
      gridSize.toFixed(2).padStart(6),
      dimensions.padEnd(18),
      String(result.totalGridVoxels).padStart(15),
      mrcMegabytes.toFixed(2).padStart(7),
      elapsedMilliseconds.toFixed(1).padStart(10),
    ].join("  "),
  );
}
