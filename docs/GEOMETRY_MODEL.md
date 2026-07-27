# Geometry model

## Coordinate contract

- Calculations operate on static three-dimensional Cartesian PDB coordinates in angstroms.
- The voxel grid uses equal spacing on X, Y, and Z.
- MRC axis order is X, Y, Z, with `ORIGIN` equal to the first voxel position.
- Occupied voxels represent the probe-derived molecular volume.

## Volume methods

The ordinary Volume method:

1. Builds a grid padded for the selected probe.
2. Rasterizes the probe-accessible atom spheres.
3. Contracts the accessible grid by the probe radius.

The VolumeNoCav method:

1. Builds a grid padded for twice the selected probe.
2. Rasterizes the same probe-accessible atom spheres.
3. Finds empty components within the occupied bounds using 26-neighbor connectivity.
4. Preserves the exterior components reached from the first and last empty candidates.
5. Fills every remaining enclosed component.
6. Contracts the cavity-filled accessible grid by the probe radius.

The browser checkbox selects between these methods before calculation. It does not modify an
already calculated density map.

## Numerical contract

- Atom coordinates, radii, probe radius, and grid spacing use 32-bit floating point to match the
  released native implementation.
- Occupancy and connectivity are discrete voxel decisions; no geometric epsilon is used.
- Probe rasterization and contraction use strict squared-distance comparisons.
- Empty or invalid atom selections stop before grid construction.
- The engine accepts any finite positive grid spacing; the form provides curated choices.
- Bounding grids above 64 million voxels stop before allocation.

## Degenerate behavior

- Ordinary Volume preserves enclosed empty components.
- VolumeNoCav fills a one-voxel enclosed component.
- Exterior empty space remains empty.
- Empty occupied grids contain no cavities.
- Connectivity must not wrap between grid rows, planes, or opposite boundaries.

## Oracle and artifacts

- `vossvolvox-rust` v26.07 is the implementation oracle.
- `VolumeNoCav.exe` defines cavity filling before probe contraction and double-probe padding.
- Rust tests use a hollow voxel cube to distinguish filled and unfilled modes.
- The gzip-compressed MRC download expands to the exact full-resolution occupancy map.
- NGL uses that map directly through 8 million voxels. Larger accepted maps use bin 2 for display.
- Native grid dimensions are aligned to multiples of four, so every bin-2 preview contains complete
  2 x 2 x 2 source blocks and preserves the full physical extent.
- Each binned preview voxel is the source block's normalized mean occupancy in a mode-2 float MRC.
  The isosurface remains at 0.5 for every bin factor.
- The binned origin shifts by half the source-block span so the first preview sample remains at
  the first block's physical center.
- Preview selection, block summation, normalization, density statistics, and mode-2 MRC
  serialization run in the Rust WebAssembly worker. TypeScript only transfers the returned map and
  metadata to NGL.
- This repository is an independent WebAssembly implementation alongside the C++ and Rust
  codebases. Features may be ported between them when useful, but browser constraints and release
  priorities determine which features reach parity.
- Preview binning does not change reported measurements or the downloadable MRC.
