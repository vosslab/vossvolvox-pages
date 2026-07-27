import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const defaultPdbPath = path.join(
  repoRoot,
  "OTHER_REPOS/vossvolvox-rust/OTHER_REPOS/vossvolvox-cpp/xyzr/2LYZ.pdb",
);
const pdbPath = process.argv[2] ?? defaultPdbPath;
const wasmPath = path.join(repoRoot, "dist/vossvolvox_wasm.wasm");
const translatedReferencePdb = [
  "ATOM      1  N   ALA A   1      98.800 -30.000  25.000  1.00 20.00           N",
  "ATOM      2  CA  ALA A   1     100.000 -30.000  25.000  1.00 20.00           C",
  "ATOM      3  C   ALA A   1     101.300 -29.500  25.000  1.00 20.00           C",
  "ATOM      4  O   ALA A   1     102.300 -30.100  25.000  1.00 20.00           O",
  "ATOM      5  CB  ALA A   1      99.800 -31.500  25.300  1.00 20.00           C",
  "END",
].join("\n");

function resultBytes(exports, pointerName, lengthName) {
  const pointer = exports[pointerName]();
  const length = exports[lengthName]();
  return new Uint8Array(exports.memory.buffer, pointer, length);
}

async function calculateVolume(pdbBytes, probe = 1.5, gridSize = 0.5) {
  const wasmBytes = await readFile(wasmPath);
  const module = await WebAssembly.instantiate(wasmBytes, {});
  const exports = module.instance.exports;
  const pointer = exports.wasm_input_alloc(pdbBytes.length);
  new Uint8Array(exports.memory.buffer, pointer, pdbBytes.length).set(pdbBytes);

  const status = exports.wasm_calculate(pointer, pdbBytes.length, probe, gridSize, 0, 1);
  const jsonBytes = resultBytes(exports, "wasm_result_pointer", "wasm_result_length");
  const result = JSON.parse(new TextDecoder().decode(jsonBytes));
  const mrc = resultBytes(exports, "wasm_mrc_pointer", "wasm_mrc_length");
  return { status, result, mrc };
}

function readMrcHeader(mrc) {
  const header = new DataView(mrc.buffer, mrc.byteOffset, mrc.byteLength);
  return {
    dimensions: [0, 4, 8].map((offset) => header.getInt32(offset, true)),
    mode: header.getInt32(12, true),
    starts: [16, 20, 24].map((offset) => header.getInt32(offset, true)),
    sampling: [28, 32, 36].map((offset) => header.getInt32(offset, true)),
    cell: [40, 44, 48].map((offset) => header.getFloat32(offset, true)),
    axes: [64, 68, 72].map((offset) => header.getInt32(offset, true)),
    origin: [196, 200, 204].map((offset) => header.getFloat32(offset, true)),
    mapId: new TextDecoder().decode(mrc.subarray(208, 212)),
  };
}

async function pathExists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const referenceBytes = new TextEncoder().encode(translatedReferencePdb);
  const reference = await calculateVolume(referenceBytes, 1.5, 0.75);

  assert.equal(reference.status, 0);
  assert.equal(reference.result.ok, true);
  assert.equal(reference.result.atomCount, 5);
  assert.equal(reference.result.voxelCount, 257);
  assert.equal(reference.result.volume, 108.421875);
  assert.ok(Math.abs(reference.result.surfaceArea - 109.233) < 0.001);
  assert.deepEqual(reference.result.origin, { x: 87, y: -42, z: 12 });
  assert.deepEqual(readMrcHeader(reference.mrc), {
    dimensions: [36, 36, 36],
    mode: 0,
    starts: [0, 0, 0],
    sampling: [36, 36, 36],
    cell: [27, 27, 27],
    axes: [1, 2, 3],
    origin: [87, -42, 12],
    mapId: "MAP ",
  });

  const overLimitPdb = [
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N",
    "ATOM      2  CA  ALA A   1     200.000   0.000   0.000  1.00 20.00           C",
    "ATOM      3  C   ALA A   1       0.000 200.000 200.000  1.00 20.00           C",
    "END",
  ].join("\n");
  const overLimit = await calculateVolume(new TextEncoder().encode(overLimitPdb));
  assert.equal(overLimit.status, 1);
  assert.equal(overLimit.result.ok, false);
  assert.match(overLimit.result.error, /browser limit is 64 million/);
  assert.equal(overLimit.mrc.byteLength, 0);

  console.log("PASS: WASM matches the native reference for a translated, non-unit grid.");
  console.log("PASS: MRC2014 dimensions, axes, sampling, and ORIGIN placement are correct.");
  console.log("PASS: WASM rejects bounding grids above 64 million voxels.");

  if (!(await pathExists(pdbPath))) {
    console.log("SKIP: optional 2LYZ reference fixture is not available.");
    return;
  }
  const pdbBytes = await readFile(pdbPath);
  const calculation = await calculateVolume(pdbBytes);
  assert.equal(calculation.status, 0);
  assert.equal(calculation.result.ok, true);
  assert.equal(calculation.result.atomCount, 1001);
  assert.equal(calculation.result.voxelCount, 142_668);
  assert.equal(calculation.result.totalGridVoxels, 1_444_352);
  assert.equal(calculation.result.volume, 17_833.5);
  assert.ok(Math.abs(calculation.result.surfaceArea - 5_493.514) < 0.001);
  assert.deepEqual(calculation.result.dimensions, { x: 112, y: 104, z: 124 });
  assert.deepEqual(readMrcHeader(calculation.mrc).dimensions, [112, 104, 124]);
  console.log("PASS: WASM matches the v26.07 2LYZ reference calculation.");
}

await main();
