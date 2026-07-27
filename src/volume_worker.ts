import type {
  CalculationFailure,
  CalculationRequest,
  CalculationResult,
  InternalRequest,
  VolumeRangePoint,
  VolumeRangeRequest,
  VolumeRangeResult,
  VolumeRequest,
  VolumeResult,
  WorkerRequest,
  WorkerResponse,
} from "./volume_types";

type WasmExports = {
  memory: WebAssembly.Memory;
  wasm_input_alloc(length: number): number;
  wasm_calculate(
    inputPointer: number,
    inputLength: number,
    probe: number,
    gridSize: number,
    includeHetatm: number,
    excludeWater: number,
    fillInternalCavities: number,
  ): number;
  wasm_calculate_internal(
    inputPointer: number,
    inputLength: number,
    toolCode: number,
    bigProbe: number,
    smallProbe: number,
    trimProbe: number,
    gridSize: number,
    includeHetatm: number,
    excludeWater: number,
    coordinateX: number,
    coordinateY: number,
    coordinateZ: number,
    filterCode: number,
    filterValue: number,
  ): number;
  wasm_result_pointer(): number;
  wasm_result_length(): number;
  wasm_mrc_pointer(): number;
  wasm_mrc_length(): number;
  wasm_preview_mrc_pointer(): number;
  wasm_preview_mrc_length(): number;
};

type WasmArtifacts = {
  result: CalculationResult;
  mrc: ArrayBuffer;
  previewMrc: ArrayBuffer;
};

const INTERNAL_TOOL_CODES = {
  solvent: 1,
  channel: 2,
  "channel-finder": 3,
  tunnel: 4,
} as const;

let wasmPromise: Promise<WasmExports> | undefined;

function post(response: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, { transfer });
}

async function loadWasm(): Promise<WasmExports> {
  if (wasmPromise !== undefined) {
    return wasmPromise;
  }
  wasmPromise = WebAssembly.instantiateStreaming(fetch("vossvolvox_wasm.wasm"), {}).then(
    (module) => module.instance.exports as WasmExports,
  );
  return wasmPromise;
}

function allocateInput(wasm: WasmExports, pdbText: string): { pointer: number; length: number } {
  const input = new TextEncoder().encode(pdbText);
  const pointer = wasm.wasm_input_alloc(input.length);
  new Uint8Array(wasm.memory.buffer, pointer, input.length).set(input);
  return { pointer, length: input.length };
}

function readJson(wasm: WasmExports): CalculationResult | CalculationFailure {
  const pointer = wasm.wasm_result_pointer();
  const length = wasm.wasm_result_length();
  const bytes = new Uint8Array(wasm.memory.buffer, pointer, length);
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as CalculationResult | CalculationFailure;
  return parsed;
}

function copyWasmBytes(wasm: WasmExports, pointer: number, length: number): ArrayBuffer {
  const copy = new Uint8Array(length);
  copy.set(new Uint8Array(wasm.memory.buffer, pointer, length));
  return copy.buffer;
}

function readArtifacts(wasm: WasmExports): WasmArtifacts {
  const result = readJson(wasm);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const mrc = copyWasmBytes(wasm, wasm.wasm_mrc_pointer(), wasm.wasm_mrc_length());
  const previewMrc = copyWasmBytes(
    wasm,
    wasm.wasm_preview_mrc_pointer(),
    wasm.wasm_preview_mrc_length(),
  );
  return { result, mrc, previewMrc };
}

function runVolume(wasm: WasmExports, request: VolumeRequest): WasmArtifacts {
  const input = allocateInput(wasm, request.pdbText);
  wasm.wasm_calculate(
    input.pointer,
    input.length,
    request.probe,
    request.gridSize,
    request.includeHetatm ? 1 : 0,
    request.excludeWater ? 1 : 0,
    request.fillInternalCavities ? 1 : 0,
  );
  return readArtifacts(wasm);
}

function probeValues(request: VolumeRangeRequest): number[] {
  const values: number[] = [];
  const tolerance = request.probeStep * 0.000001;
  for (
    let probe = request.minimumProbe;
    probe <= request.maximumProbe + tolerance;
    probe += request.probeStep
  ) {
    values.push(Number(probe.toFixed(6)));
  }
  return values;
}

function rangePoint(result: VolumeResult): VolumeRangePoint {
  return {
    probe: result.probe,
    volume: result.volume,
    surfaceArea: result.surfaceArea,
    voxelCount: result.voxelCount,
    totalGridVoxels: result.totalGridVoxels,
  };
}

function calculateRange(wasm: WasmExports, request: VolumeRangeRequest): WasmArtifacts {
  const values = probeValues(request);
  if (values.length === 0 || values.length > 25) {
    throw new Error("Volume Range must contain between 1 and 25 probe values.");
  }

  const points: VolumeRangePoint[] = [];
  let finalArtifacts: WasmArtifacts | undefined;
  for (const [index, probe] of values.entries()) {
    post({
      type: "progress",
      message: `Calculating probe ${probe.toFixed(2)} A (${index + 1} of ${values.length})...`,
    });
    const volumeRequest: VolumeRequest = {
      tool: "volume",
      pdbText: request.pdbText,
      inputLabel: request.inputLabel,
      probe,
      gridSize: request.gridSize,
      includeHetatm: request.includeHetatm,
      excludeWater: request.excludeWater,
      fillInternalCavities: false,
    };
    const artifacts = runVolume(wasm, volumeRequest);
    points.push(rangePoint(artifacts.result as VolumeResult));
    finalArtifacts = artifacts;
  }
  if (finalArtifacts === undefined) {
    throw new Error("Volume Range did not produce a representative map.");
  }

  const representative = finalArtifacts.result as VolumeResult;
  const result: VolumeRangeResult = {
    ...representative,
    tool: "volume-range",
    representativeProbe: representative.probe,
    minimumProbe: request.minimumProbe,
    maximumProbe: request.maximumProbe,
    probeStep: request.probeStep,
    points,
  };
  return { result, mrc: finalArtifacts.mrc, previewMrc: finalArtifacts.previewMrc };
}

function internalFilter(request: CalculationRequest): { code: number; value: number } {
  if (request.tool !== "channel-finder") {
    return { code: 0, value: 0 };
  }
  const codes = {
    largest: 1,
    "minimum-volume": 2,
    "minimum-percent": 3,
  } as const;
  return { code: codes[request.filter.mode], value: request.filter.value };
}

function internalCoordinate(request: CalculationRequest): { x: number; y: number; z: number } {
  if (request.tool === "channel") {
    return request.coordinate;
  }
  return { x: 0, y: 0, z: 0 };
}

function runInternal(wasm: WasmExports, request: InternalRequest): WasmArtifacts {
  const input = allocateInput(wasm, request.pdbText);
  const coordinate = internalCoordinate(request);
  const filter = internalFilter(request);
  wasm.wasm_calculate_internal(
    input.pointer,
    input.length,
    INTERNAL_TOOL_CODES[request.tool],
    request.bigProbe,
    request.smallProbe,
    request.trimProbe,
    request.gridSize,
    request.includeHetatm ? 1 : 0,
    request.excludeWater ? 1 : 0,
    coordinate.x,
    coordinate.y,
    coordinate.z,
    filter.code,
    filter.value,
  );
  return readArtifacts(wasm);
}

async function calculate(message: WorkerRequest): Promise<void> {
  post({ type: "progress", message: "Loading the Rust WebAssembly engine..." });
  const wasm = await loadWasm();
  post({ type: "progress", message: "Parsing atoms and sizing the voxel grid..." });

  let artifacts: WasmArtifacts;
  if (message.request.tool === "volume") {
    post({ type: "progress", message: "Rolling the probe over the molecular surface..." });
    artifacts = runVolume(wasm, message.request);
  } else if (message.request.tool === "volume-range") {
    artifacts = calculateRange(wasm, message.request);
  } else {
    post({
      type: "progress",
      message: "Building the outer shell and internal solvent grids...",
    });
    artifacts = runInternal(wasm, message.request);
  }

  post({ type: "progress", message: "Transferring the MRC density maps..." });
  post(
    {
      type: "result",
      result: artifacts.result,
      mrc: artifacts.mrc,
      previewMrc: artifacts.previewMrc,
    },
    [artifacts.mrc, artifacts.previewMrc],
  );
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "calculate") {
    return;
  }
  calculate(event.data).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: "error", message });
  });
});
