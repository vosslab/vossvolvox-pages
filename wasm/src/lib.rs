use std::cell::RefCell;
use std::io::Cursor;

use vossvolvox::voxel_grid::geometry::GridParams;
use vossvolvox::voxel_grid::grid::Grid3D;
use vossvolvox::voxel_grid::pdb::{Filters, PdbOptions, load_atoms_from_reader};
use vossvolvox::voxel_grid::raster::Atom;

const MAX_GRID_VOXELS: usize = 64_000_000;
const MRC_HEADER_BYTES: usize = 1024;
const MRC_MODE_SIGNED_BYTE: i32 = 0;
const MRC_SPACE_GROUP: i32 = 1;
const MRC_EXTRA_HEADER_WORDS: usize = 25;
const MRC_VERSION_EXTRA_INDEX: usize = 3;
const MRC_MAP_ID: i32 = 542_130_509;
const MRC_MACHINE_STAMP: i32 = 0x0000_4144;
const MRC_VERSION: i32 = 20_140;
const MRC_LABEL: &[u8] = b"MRC2014: ORIGIN used for placement; NSTART zeroed";

thread_local! {
    static RESULT_JSON: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static RESULT_MRC: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn wasm_input_alloc(length: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; length].into_boxed_slice()).cast::<u8>()
}

#[unsafe(no_mangle)]
/// Calculate a volume from bytes previously returned by [`wasm_input_alloc`].
///
/// # Safety
///
/// `input_pointer` must be the unmodified pointer returned by `wasm_input_alloc`
/// for the same `input_length`, and this function must consume it exactly once.
pub unsafe extern "C" fn wasm_calculate(
    input_pointer: *mut u8,
    input_length: usize,
    probe: f32,
    grid_size: f32,
    include_hetatm: i32,
    exclude_water: i32,
) -> i32 {
    let input_slice = std::ptr::slice_from_raw_parts_mut(input_pointer, input_length);
    let input = unsafe { Box::from_raw(input_slice) };
    let calculation = calculate_volume(
        &input,
        probe,
        grid_size,
        include_hetatm != 0,
        exclude_water != 0,
    );

    match calculation {
        Ok((json, mrc)) => {
            store_results(json, mrc);
            0
        }
        Err(message) => {
            let json = format!("{{\"ok\":false,\"error\":\"{}\"}}", escape_json(&message));
            store_results(json.into_bytes(), Vec::new());
            1
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn wasm_result_pointer() -> *const u8 {
    RESULT_JSON.with(|result| result.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn wasm_result_length() -> usize {
    RESULT_JSON.with(|result| result.borrow().len())
}

#[unsafe(no_mangle)]
pub extern "C" fn wasm_mrc_pointer() -> *const u8 {
    RESULT_MRC.with(|result| result.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn wasm_mrc_length() -> usize {
    RESULT_MRC.with(|result| result.borrow().len())
}

fn calculate_volume(
    input: &[u8],
    probe: f32,
    grid_size: f32,
    include_hetatm: bool,
    exclude_water: bool,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    if !probe.is_finite() || !(0.0..=20.0).contains(&probe) {
        return Err("Probe radius must be between 0 and 20 A.".to_string());
    }
    if !grid_size.is_finite() || !(0.5..=2.0).contains(&grid_size) {
        return Err("Grid spacing must be between 0.5 and 2.0 A.".to_string());
    }
    if input.is_empty() {
        return Err("The PDB input is empty.".to_string());
    }

    let options = PdbOptions {
        use_united: true,
        filters: Filters {
            exclude_water,
            exclude_ions: false,
            exclude_ligands: false,
            exclude_hetatm: !include_hetatm,
            exclude_nucleic_acids: false,
            exclude_amino_acids: false,
        },
    };
    let atoms = load_atoms_from_reader(Cursor::new(input), &options)
        .map_err(|error| format!("Could not parse the PDB input: {error}"))?;
    if atoms.len() < 3 {
        return Err("The selected filters leave fewer than three valid atoms.".to_string());
    }

    let params = GridParams::from_atoms(&atoms, probe, grid_size)
        .ok_or_else(|| "The input could not produce a valid voxel grid.".to_string())?;
    let total_voxels = params
        .len_i
        .checked_mul(params.len_j)
        .and_then(|area| area.checked_mul(params.len_k))
        .ok_or_else(|| "The voxel grid dimensions overflow browser memory.".to_string())?;
    if total_voxels > MAX_GRID_VOXELS {
        let millions = total_voxels as f64 / 1_000_000.0;
        return Err(format!(
            "This job needs {:.1} million voxels; the browser limit is 64 million. \
             Choose a coarser grid, a smaller probe, or a smaller structure.",
            millions
        ));
    }

    let mut voxel_grid = params.build_grid();
    fill_accessible_sequential(&mut voxel_grid, &atoms, probe);
    if probe > 0.0 {
        contract_exclusion_sequential(&mut voxel_grid, probe);
    }

    let voxel_count = voxel_grid.count_filled();
    if voxel_count == 0 {
        return Err("The calculation produced an empty volume.".to_string());
    }
    let voxel_volume = f64::from(grid_size.powi(3));
    let volume = voxel_count as f64 * voxel_volume;
    let (surface_area, _) = voxel_grid.estimate_surface_area_with_edges();
    let sphericity = (36.0 * std::f64::consts::PI * volume.powi(2)).cbrt() / surface_area;
    let effective_radius = 3.0 * volume / surface_area;
    let center = center_of_mass(&voxel_grid, voxel_count);
    let mrc = write_mrc_bytes(&voxel_grid)?;

    let json = format!(
        concat!(
            "{{\"ok\":true,\"atomCount\":{},\"voxelCount\":{},",
            "\"totalGridVoxels\":{},\"volume\":{:.6},\"surfaceArea\":{:.6},",
            "\"sphericity\":{:.6},\"effectiveRadius\":{:.6},",
            "\"center\":{{\"x\":{:.6},\"y\":{:.6},\"z\":{:.6}}},",
            "\"dimensions\":{{\"x\":{},\"y\":{},\"z\":{}}},",
            "\"origin\":{{\"x\":{:.6},\"y\":{:.6},\"z\":{:.6}}},",
            "\"gridSize\":{:.6},\"probe\":{:.6},\"mrcBytes\":{}}}"
        ),
        atoms.len(),
        voxel_count,
        total_voxels,
        volume,
        surface_area,
        sphericity,
        effective_radius,
        center.0,
        center.1,
        center.2,
        voxel_grid.len_i,
        voxel_grid.len_j,
        voxel_grid.len_k,
        voxel_grid.x_shift,
        voxel_grid.y_shift,
        voxel_grid.z_shift,
        grid_size,
        probe,
        mrc.len(),
    );
    Ok((json.into_bytes(), mrc))
}

fn fill_accessible_sequential(grid: &mut Grid3D, atoms: &[Atom], probe: f32) {
    grid.data.fill(false);
    let plane_size = grid.len_i * grid.len_j;
    for atom in atoms {
        let radius_grid = (atom.radius + probe) / grid.grid_size;
        if radius_grid <= 0.0 {
            continue;
        }
        let cutoff = radius_grid * radius_grid;
        let atom_i = (atom.x - grid.x_shift) / grid.grid_size;
        let atom_j = (atom.y - grid.y_shift) / grid.grid_size;
        let atom_k = (atom.z - grid.z_shift) / grid.grid_size;
        let minimum_i = bounded_floor(atom_i - radius_grid - 1.0, grid.len_i);
        let minimum_j = bounded_floor(atom_j - radius_grid - 1.0, grid.len_j);
        let minimum_k = bounded_floor(atom_k - radius_grid - 1.0, grid.len_k);
        let maximum_i = bounded_ceil(atom_i + radius_grid + 1.0, grid.len_i);
        let maximum_j = bounded_ceil(atom_j + radius_grid + 1.0, grid.len_j);
        let maximum_k = bounded_ceil(atom_k + radius_grid + 1.0, grid.len_k);

        for i in minimum_i..=maximum_i {
            let distance_i = atom_i - i as f32;
            for j in minimum_j..=maximum_j {
                let distance_j = atom_j - j as f32;
                for k in minimum_k..=maximum_k {
                    let distance_k = atom_k - k as f32;
                    let distance_squared =
                        distance_i * distance_i + distance_j * distance_j + distance_k * distance_k;
                    if distance_squared < cutoff {
                        let index = i + j * grid.len_i + k * plane_size;
                        grid.fill_voxel_index(index);
                    }
                }
            }
        }
    }
}

fn contract_exclusion_sequential(grid: &mut Grid3D, probe: f32) {
    let radius_units = probe / grid.grid_size;
    if radius_units <= 0.0 {
        return;
    }
    let mut accessible = Grid3D::new(grid.len_i, grid.len_j, grid.len_k, grid.grid_size);
    accessible.data = grid.data.clone();
    let mut cleared = Grid3D::new(grid.len_i, grid.len_j, grid.len_k, grid.grid_size);
    let offsets = compute_offsets(radius_units);
    for index in 0..grid.total_voxels {
        if accessible.data[index] || !has_filled_neighbor(index, &accessible) {
            continue;
        }
        let (i, j, k) = grid.index_to_ijk(index);
        for (offset_i, offset_j, offset_k) in &offsets {
            let neighbor_i = i as isize + offset_i;
            let neighbor_j = j as isize + offset_j;
            let neighbor_k = k as isize + offset_k;
            if neighbor_i >= 0
                && neighbor_j >= 0
                && neighbor_k >= 0
                && neighbor_i < grid.len_i as isize
                && neighbor_j < grid.len_j as isize
                && neighbor_k < grid.len_k as isize
            {
                let neighbor = grid.ijk_to_index(
                    neighbor_i as usize,
                    neighbor_j as usize,
                    neighbor_k as usize,
                );
                cleared.fill_voxel_index(neighbor);
            }
        }
    }
    for index in cleared.data.iter_ones() {
        grid.set_voxel_index(index, false);
    }
}

fn has_filled_neighbor(index: usize, accessible: &Grid3D) -> bool {
    let len_i = accessible.len_i;
    let len_j = accessible.len_j;
    let len_k = accessible.len_k;
    let stride_j = len_i;
    let stride_k = len_i * len_j;
    let i = index % len_i;
    let j = (index / len_i) % len_j;
    let k = index / stride_k;
    (i > 0 && accessible.data[index - 1])
        || (i + 1 < len_i && accessible.data[index + 1])
        || (j > 0 && accessible.data[index - stride_j])
        || (j + 1 < len_j && accessible.data[index + stride_j])
        || (k > 0 && accessible.data[index - stride_k])
        || (k + 1 < len_k && accessible.data[index + stride_k])
}

fn compute_offsets(radius_units: f32) -> Vec<(isize, isize, isize)> {
    let cutoff = radius_units * radius_units;
    let maximum = radius_units.ceil() as isize;
    let mut offsets = Vec::<(isize, isize, isize)>::new();
    for i in -maximum..=maximum {
        for j in -maximum..=maximum {
            for k in -maximum..=maximum {
                let distance_squared = (i * i + j * j + k * k) as f32;
                if distance_squared < cutoff {
                    offsets.push((i, j, k));
                }
            }
        }
    }
    offsets
}

fn center_of_mass(grid: &Grid3D, voxel_count: usize) -> (f64, f64, f64) {
    let mut i_sum = 0.0f64;
    let mut j_sum = 0.0f64;
    let mut k_sum = 0.0f64;
    for index in grid.data.iter_ones() {
        let (i, j, k) = grid.index_to_ijk(index);
        i_sum += i as f64;
        j_sum += j as f64;
        k_sum += k as f64;
    }
    let count = voxel_count as f64;
    let x = i_sum / count * f64::from(grid.grid_size) + f64::from(grid.x_shift);
    let y = j_sum / count * f64::from(grid.grid_size) + f64::from(grid.y_shift);
    let z = k_sum / count * f64::from(grid.grid_size) + f64::from(grid.z_shift);
    (x, y, z)
}

fn write_mrc_bytes(grid: &Grid3D) -> Result<Vec<u8>, String> {
    // Preserve the native writer's guard plane/row after the declared MRC data.
    // Readers use NX*NY*NZ bytes and ignore this compatibility payload.
    let guard_bytes = grid.len_i * grid.len_j + grid.len_i + 1;
    let capacity = MRC_HEADER_BYTES
        .checked_add(grid.total_voxels)
        .and_then(|size| size.checked_add(guard_bytes))
        .ok_or_else(|| "The MRC output size exceeds browser memory.".to_string())?;
    let mut output = Vec::<u8>::with_capacity(capacity);

    // MRC2014 words 1-10: dimensions, signed-byte mode, zero NSTART, and sampling.
    for value in [
        grid.len_i as i32,
        grid.len_j as i32,
        grid.len_k as i32,
        MRC_MODE_SIGNED_BYTE,
        0,
        0,
        0,
        grid.len_i as i32,
        grid.len_j as i32,
        grid.len_k as i32,
    ] {
        output.extend_from_slice(&value.to_le_bytes());
    }

    // Words 11-18: orthogonal cell dimensions in Angstroms and XYZ axis mapping.
    for value in [
        grid.len_i as f32 * grid.grid_size,
        grid.len_j as f32 * grid.grid_size,
        grid.len_k as f32 * grid.grid_size,
        90.0,
        90.0,
        90.0,
    ] {
        output.extend_from_slice(&value.to_le_bytes());
    }
    for value in [1i32, 2, 3] {
        output.extend_from_slice(&value.to_le_bytes());
    }

    // Words 19-24: density statistics, space group, and no symmetry payload.
    for value in [0.0f32, 0.0, 0.0] {
        output.extend_from_slice(&value.to_le_bytes());
    }
    output.extend_from_slice(&MRC_SPACE_GROUP.to_le_bytes());
    output.extend_from_slice(&0i32.to_le_bytes());

    // Words 25-49 are reserved; word 28 carries the MRC2014 version marker.
    for index in 0..MRC_EXTRA_HEADER_WORDS {
        let value = if index == MRC_VERSION_EXTRA_INDEX {
            MRC_VERSION
        } else {
            0
        };
        output.extend_from_slice(&value.to_le_bytes());
    }

    // Words 50-52: ORIGIN is the first voxel's Cartesian position in Angstroms.
    // NSTART stays zero so NGL applies this translation exactly once.
    for value in [grid.x_shift, grid.y_shift, grid.z_shift] {
        output.extend_from_slice(&value.to_le_bytes());
    }

    // Words 53-56: file marker, little-endian stamp, RMS, and one label.
    output.extend_from_slice(&MRC_MAP_ID.to_le_bytes());
    output.extend_from_slice(&MRC_MACHINE_STAMP.to_le_bytes());
    output.extend_from_slice(&0.0f32.to_le_bytes());
    output.extend_from_slice(&1i32.to_le_bytes());
    let mut labels = [0u8; 800];
    labels[..MRC_LABEL.len()].copy_from_slice(MRC_LABEL);
    output.extend_from_slice(&labels);
    if output.len() != MRC_HEADER_BYTES {
        return Err("The MRC header was not exactly 1024 bytes.".to_string());
    }
    for bit in &grid.data {
        output.push(u8::from(*bit));
    }
    output.resize(capacity, 0);
    Ok(output)
}

fn bounded_floor(value: f32, length: usize) -> usize {
    (value.floor() as isize).clamp(0, length as isize - 1) as usize
}

fn bounded_ceil(value: f32, length: usize) -> usize {
    (value.ceil() as isize).clamp(0, length as isize - 1) as usize
}

fn store_results(json: Vec<u8>, mrc: Vec<u8>) {
    RESULT_JSON.with(|result| *result.borrow_mut() = json);
    RESULT_MRC.with(|result| *result.borrow_mut() = mrc);
}

fn escape_json(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            value if value.is_control() => escaped.push(' '),
            value => escaped.push(value),
        }
    }
    escaped
}
