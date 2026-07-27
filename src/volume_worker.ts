import type { VolumeFailure, VolumeResult, WorkerRequest, WorkerResponse } from "./volume_types";

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
  wasm_result_pointer(): number;
  wasm_result_length(): number;
  wasm_mrc_pointer(): number;
  wasm_mrc_length(): number;
  wasm_preview_mrc_pointer(): number;
  wasm_preview_mrc_length(): number;
};

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

function readJson(wasm: WasmExports): VolumeResult | VolumeFailure {
  const pointer = wasm.wasm_result_pointer();
  const length = wasm.wasm_result_length();
  const bytes = new Uint8Array(wasm.memory.buffer, pointer, length);
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as VolumeResult | VolumeFailure;
  return parsed;
}

function copyWasmBytes(wasm: WasmExports, pointer: number, length: number): ArrayBuffer {
  const copy = new Uint8Array(length);
  copy.set(new Uint8Array(wasm.memory.buffer, pointer, length));
  return copy.buffer;
}

async function calculate(message: WorkerRequest): Promise<void> {
  post({ type: "progress", message: "Loading the Rust WebAssembly engine..." });
  const wasm = await loadWasm();
  post({ type: "progress", message: "Parsing atoms and sizing the voxel grid..." });

  const input = new TextEncoder().encode(message.request.pdbText);
  const pointer = wasm.wasm_input_alloc(input.length);
  new Uint8Array(wasm.memory.buffer, pointer, input.length).set(input);

  post({ type: "progress", message: "Rolling the probe over the molecular surface..." });
  wasm.wasm_calculate(
    pointer,
    input.length,
    message.request.probe,
    message.request.gridSize,
    message.request.includeHetatm ? 1 : 0,
    message.request.excludeWater ? 1 : 0,
    message.request.fillInternalCavities ? 1 : 0,
  );

  const result = readJson(wasm);
  if (!result.ok) {
    post({ type: "error", message: result.error });
    return;
  }

  post({ type: "progress", message: "Transferring the MRC density maps..." });
  const mrc = copyWasmBytes(wasm, wasm.wasm_mrc_pointer(), wasm.wasm_mrc_length());
  const previewMrc = copyWasmBytes(
    wasm,
    wasm.wasm_preview_mrc_pointer(),
    wasm.wasm_preview_mrc_length(),
  );
  post({ type: "result", result, mrc, previewMrc }, [mrc, previewMrc]);
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
