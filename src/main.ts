import { Stage } from "ngl";
import type { RepresentationElement } from "ngl";

import type {
  InputMode,
  VolumeRequest,
  VolumeResult,
  WorkerRequest,
  WorkerResponse,
} from "./volume_types";

type CompletedRun = {
  request: VolumeRequest;
  result: VolumeResult;
  mrc: ArrayBuffer;
  elapsedSeconds: number;
};

type NglVolumeObject = {
  matrix?: {
    elements?: ArrayLike<number>;
  };
};

type Theme = "dark" | "light";

type ViewerTheme = {
  backgroundColor: string;
  surfaceColor: string;
  chainColors: string[];
};

const ANGSTROM = "\u00c5";
const ANGSTROM_SQUARED = `${ANGSTROM}\u00b2`;
const ANGSTROM_CUBED = `${ANGSTROM}\u00b3`;
const VIEWER_THEMES: Record<Theme, ViewerTheme> = {
  dark: {
    backgroundColor: "#07131f",
    surfaceColor: "#2dd4bf",
    chainColors: ["#7dd3fc", "#f9a8d4", "#fde68a", "#c4b5fd", "#86efac", "#fdba74"],
  },
  light: {
    backgroundColor: "#edf4f5",
    surfaceColor: "#08766d",
    chainColors: ["#0369a1", "#a21caf", "#8a5d00", "#6d28d9", "#08783e", "#a13b00"],
  },
};

const form = requireElement<HTMLFormElement>("volume-form");
const toolSelectorPanel = requireElement<HTMLElement>("tool-selector-panel");
const setupPanel = requireElement<HTMLElement>("setup-panel");
const runningPanel = requireElement<HTMLElement>("running-panel");
const resultsPanel = requireElement<HTMLElement>("results-panel");
const errorPanel = requireElement<HTMLElement>("error-panel");
const consoleOutput = requireElement<HTMLOutputElement>("console-output");
const progressLabel = requireElement<HTMLElement>("progress-label");
const submitButton = requireElement<HTMLButtonElement>("calculate-button");
const fileInput = requireElement<HTMLInputElement>("pdb-file");
const pdbIdInput = requireElement<HTMLInputElement>("pdb-id");
const biologicalUnitInput = requireElement<HTMLInputElement>("biological-unit");
const cancelButton = requireElement<HTMLButtonElement>("cancel-button");
const newCalculationButton = requireElement<HTMLButtonElement>("new-calculation");
const retryButton = requireElement<HTMLButtonElement>("retry-button");
const errorMessage = requireElement<HTMLElement>("error-message");
const elapsedOutput = requireElement<HTMLElement>("elapsed-output");
const viewerElement = requireElement<HTMLElement>("viewer");
const surfaceToggle = requireElement<HTMLInputElement>("surface-toggle");
const moleculeToggle = requireElement<HTMLInputElement>("molecule-toggle");
const opacityInput = requireElement<HTMLInputElement>("surface-opacity");
const opacityOutput = requireElement<HTMLOutputElement>("surface-opacity-value");
const recenterButton = requireElement<HTMLButtonElement>("recenter-button");
const fullscreenButton = requireElement<HTMLButtonElement>("fullscreen-button");
const themeToggle = requireElement<HTMLButtonElement>("theme-toggle");

let worker: Worker | undefined;
let inputAbortController: AbortController | undefined;
let startedAt = 0;
let currentRun: CompletedRun | undefined;
let stage: Stage | undefined;
let moleculeComponent: Awaited<ReturnType<Stage["loadFile"]>> | undefined;
let surfaceComponent: Awaited<ReturnType<Stage["loadFile"]>> | undefined;
let moleculeRepresentation: RepresentationElement | undefined;
let surfaceRepresentation: RepresentationElement | undefined;
const downloadUrls: string[] = [];

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} is missing.`);
  }
  return element as T;
}

function applyTheme(theme: Theme): void {
  const isLight = theme === "light";
  document.documentElement.dataset["theme"] = theme;
  themeToggle.ariaPressed = String(isLight);
  themeToggle.textContent = isLight ? "Dark mode" : "Light mode";
  applyViewerTheme(theme);
}

function loadTheme(): Theme {
  try {
    return window.localStorage.getItem("3vee-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem("3vee-theme", theme);
  } catch {
    // The selected theme still applies to this page when browser storage is unavailable.
  }
}

function currentTheme(): Theme {
  return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

function setInputMode(mode: InputMode): void {
  for (const panel of document.querySelectorAll<HTMLElement>("[data-input-panel]")) {
    panel.hidden = panel.dataset["inputPanel"] !== mode;
  }
}

function activeInputMode(): InputMode {
  const checked = form.querySelector<HTMLInputElement>('input[name="input-mode"]:checked');
  if (checked === null) {
    throw new Error("Choose an input source.");
  }
  return checked.value as InputMode;
}

async function fetchPdb(signal: AbortSignal): Promise<{ text: string; label: string }> {
  const id = pdbIdInput.value.trim().toUpperCase();
  if (!/^[0-9][A-Z0-9]{3}$/.test(id)) {
    throw new Error("Enter a valid four-character RCSB PDB ID, such as 2LYZ.");
  }
  pdbIdInput.value = id;
  appendConsole(`Fetching ${id} from RCSB Protein Data Bank...`);
  if (!biologicalUnitInput.checked) {
    const response = await fetch(`https://files.rcsb.org/download/${id}.pdb`, { signal });
    if (!response.ok) {
      throw new Error(`RCSB returned HTTP ${response.status} for ${id}.`);
    }
    const text = await response.text();
    return { text, label: `${id}.pdb` };
  }

  const response = await fetch(`https://files.rcsb.org/download/${id}.pdb1.gz`, { signal });
  if (!response.ok) {
    throw new Error(`RCSB returned HTTP ${response.status} for biological assembly ${id}.`);
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress an RCSB biological assembly.");
  }
  const decompressed = response.body?.pipeThrough(new DecompressionStream("gzip"));
  if (decompressed === undefined) {
    throw new Error("The biological-assembly response did not contain a readable body.");
  }
  const text = await new Response(decompressed).text();
  return { text, label: `${id}-assembly1.pdb` };
}

async function readInput(signal: AbortSignal): Promise<{ text: string; label: string }> {
  const mode = activeInputMode();
  if (mode === "rcsb") {
    return fetchPdb(signal);
  }
  const file = fileInput.files?.[0];
  if (file === undefined) {
    throw new Error("Choose a PDB file to upload.");
  }
  if (file.size > 30_000_000) {
    throw new Error("The PDB file is larger than the 30 MB input limit.");
  }
  return { text: await file.text(), label: file.name };
}

function readNumber(id: string, minimum: number, maximum: number): number {
  const input = requireElement<HTMLInputElement>(id);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${input.labels?.[0]?.textContent ?? id} must be ${minimum} to ${maximum}.`);
  }
  return value;
}

async function buildRequest(signal: AbortSignal): Promise<VolumeRequest> {
  const input = await readInput(signal);
  const request: VolumeRequest = {
    pdbText: input.text,
    inputLabel: input.label,
    probe: readNumber("probe-radius", 0, 20),
    gridSize: readNumber("grid-size", 0.5, 2),
    includeHetatm: requireElement<HTMLInputElement>("include-hetatm").checked,
    excludeWater: requireElement<HTMLInputElement>("exclude-water").checked,
  };
  return request;
}

function appendConsole(message: string): void {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  consoleOutput.textContent += `[${timestamp}] ${message}\n`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  progressLabel.textContent = message;
}

function showPanel(panel: HTMLElement): void {
  for (const candidate of [toolSelectorPanel, setupPanel, runningPanel, resultsPanel, errorPanel]) {
    candidate.hidden = candidate !== panel;
  }
  window.scrollTo({ top: 0 });
}

function stopWorker(): void {
  worker?.terminate();
  worker = undefined;
}

function stopActiveCalculation(): void {
  inputAbortController?.abort();
  inputAbortController = undefined;
  stopWorker();
}

async function startCalculation(): Promise<void> {
  stopActiveCalculation();
  const controller = new AbortController();
  inputAbortController = controller;
  consoleOutput.textContent = "";
  showPanel(runningPanel);
  appendConsole("Preparing the Volume calculation...");
  submitButton.disabled = true;
  try {
    const request = await buildRequest(controller.signal);
    if (controller.signal.aborted || inputAbortController !== controller) {
      return;
    }
    inputAbortController = undefined;
    appendConsole(`Input ready: ${request.inputLabel}`);
    appendConsole(
      `Probe ${request.probe.toFixed(2)} ${ANGSTROM}; ` +
        `grid ${request.gridSize.toFixed(2)} ${ANGSTROM}`,
    );
    startedAt = performance.now();
    worker = new Worker(new URL("./volume_worker.js", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      handleWorkerMessage(event.data, request);
    });
    worker.addEventListener("error", (event: ErrorEvent) => {
      showError(event.message || "The WebAssembly worker stopped unexpectedly.");
    });
    const message: WorkerRequest = { type: "calculate", request };
    worker.postMessage(message);
  } catch (error: unknown) {
    if (controller.signal.aborted || inputAbortController !== controller) {
      return;
    }
    inputAbortController = undefined;
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
  }
}

function handleWorkerMessage(response: WorkerResponse, request: VolumeRequest): void {
  if (response.type === "progress") {
    appendConsole(response.message);
    return;
  }
  if (response.type === "error") {
    showError(response.message);
    return;
  }
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  currentRun = {
    request,
    result: response.result,
    mrc: response.mrc,
    elapsedSeconds,
  };
  appendConsole("Program completed successfully.");
  stopWorker();
  void renderResults(currentRun).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
  });
}

function showError(message: string): void {
  stopActiveCalculation();
  submitButton.disabled = false;
  errorMessage.textContent = message;
  showPanel(errorPanel);
}

function setResultText(id: string, value: string): void {
  requireElement<HTMLElement>(id).textContent = value;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatCoordinate(value: number): string {
  return value.toFixed(1);
}

async function renderResults(run: CompletedRun): Promise<void> {
  const result = run.result;
  setResultText("result-input", run.request.inputLabel);
  setResultText("result-volume", `${formatInteger(result.volume)} ${ANGSTROM_CUBED}`);
  setResultText("result-surface", `${formatInteger(result.surfaceArea)} ${ANGSTROM_SQUARED}`);
  setResultText("result-sphericity", result.sphericity.toFixed(3));
  setResultText("result-radius", `${result.effectiveRadius.toFixed(2)} ${ANGSTROM}`);
  setResultText(
    "result-center",
    `(${formatCoordinate(result.center.x)}, ${formatCoordinate(result.center.y)}, ` +
      `${formatCoordinate(result.center.z)}) ${ANGSTROM}`,
  );
  setResultText("result-atoms", formatInteger(result.atomCount));
  setResultText("result-voxels", formatInteger(result.voxelCount));
  setResultText("result-total-voxels", formatInteger(result.totalGridVoxels));
  setResultText(
    "result-grid",
    `${result.dimensions.x} x ${result.dimensions.y} x ${result.dimensions.z}`,
  );
  setResultText("result-spacing", `${result.gridSize.toFixed(2)} ${ANGSTROM}`);
  setResultText("result-probe", `${result.probe.toFixed(2)} ${ANGSTROM}`);
  elapsedOutput.textContent = `${run.elapsedSeconds.toFixed(2)} seconds`;
  wireDownloads(run);
  showPanel(resultsPanel);
  await renderViewer(run);
  submitButton.disabled = false;
}

function createDownload(id: string, blob: Blob, filename: string): void {
  const anchor = requireElement<HTMLAnchorElement>(id);
  const url = URL.createObjectURL(blob);
  downloadUrls.push(url);
  anchor.href = url;
  anchor.download = filename;
}

function wireDownloads(run: CompletedRun): void {
  for (const url of downloadUrls.splice(0)) {
    URL.revokeObjectURL(url);
  }
  const stem = run.request.inputLabel.replace(/\.pdb$/i, "").replace(/[^a-z0-9_-]+/gi, "_");
  createDownload(
    "download-pdb",
    new Blob([run.request.pdbText], { type: "chemical/x-pdb" }),
    `${stem}.pdb`,
  );
  createDownload(
    "download-mrc",
    new Blob([run.mrc], { type: "application/octet-stream" }),
    `${stem}-volume.mrc`,
  );
  const report = {
    input: run.request.inputLabel,
    elapsedSeconds: run.elapsedSeconds,
    parameters: {
      probe: run.request.probe,
      gridSize: run.request.gridSize,
      includeHetatm: run.request.includeHetatm,
      excludeWater: run.request.excludeWater,
    },
    results: run.result,
  };
  createDownload(
    "download-json",
    new Blob([JSON.stringify(report, undefined, 2)], { type: "application/json" }),
    `${stem}-volume-results.json`,
  );
}

async function renderViewer(run: CompletedRun): Promise<void> {
  stage?.dispose();
  const viewerTheme = VIEWER_THEMES[currentTheme()];
  stage = new Stage(viewerElement, {
    backgroundColor: viewerTheme.backgroundColor,
    quality: "medium",
  });
  stage.setParameters({ cameraType: "orthographic" });
  const loadedMolecule = await stage.loadFile(
    new Blob([run.request.pdbText], { type: "chemical/x-pdb" }),
    { ext: "pdb", defaultRepresentation: false },
  );
  if (loadedMolecule === undefined) {
    throw new Error("NGL did not return a molecule component.");
  }
  moleculeComponent = loadedMolecule;
  moleculeRepresentation = loadedMolecule.addRepresentation("cartoon", {
    colorScheme: "chainname",
    colorScale: viewerTheme.chainColors,
  }) as RepresentationElement;
  loadedMolecule.addRepresentation("ball+stick", {
    sele: "hetero and not water",
    colorScheme: "element",
  });
  const loadedSurface = await stage.loadFile(
    new Blob([run.mrc], { type: "application/octet-stream" }),
    { ext: "mrc", defaultRepresentation: false },
  );
  if (loadedSurface === undefined) {
    throw new Error("NGL did not return a volume component.");
  }
  surfaceComponent = loadedSurface;
  verifyVolumePlacement(loadedSurface.object as NglVolumeObject, run.result);
  surfaceRepresentation = loadedSurface.addRepresentation("surface", {
    isolevel: 0.5,
    color: viewerTheme.surfaceColor,
    opacity: Number(opacityInput.value),
    depthWrite: false,
    opaqueBack: false,
    side: "double",
  }) as RepresentationElement;
  applyViewerTheme(currentTheme());
  updateSurfaceOpacity();
  stage.autoView();
  updateViewerVisibility();
}

function verifyVolumePlacement(volume: NglVolumeObject, result: VolumeResult): void {
  const elements = volume.matrix?.elements;
  if (elements === undefined || elements.length < 16) {
    throw new Error("NGL did not expose the density-map placement matrix.");
  }
  const parsedOrigin = [Number(elements[12]), Number(elements[13]), Number(elements[14])];
  const expectedOrigin = [result.origin.x, result.origin.y, result.origin.z];
  const tolerance = Math.max(result.gridSize * 0.0001, 0.00001);
  if (parsedOrigin.some((value, index) => Math.abs(value - expectedOrigin[index]!) > tolerance)) {
    throw new Error("NGL placed the density map at coordinates that differ from the WASM result.");
  }
  viewerElement.dataset["volumeOrigin"] = parsedOrigin.join(",");
}

function applyViewerTheme(theme: Theme): void {
  const viewerTheme = VIEWER_THEMES[theme];
  stage?.setParameters({ backgroundColor: viewerTheme.backgroundColor });
  moleculeRepresentation?.setParameters({
    colorScheme: "chainname",
    colorScale: viewerTheme.chainColors,
  });
  surfaceRepresentation?.setParameters({ color: viewerTheme.surfaceColor });
  viewerElement.dataset["viewerTheme"] = theme;
  viewerElement.dataset["viewerBackground"] = viewerTheme.backgroundColor;
  viewerElement.dataset["surfaceColor"] = viewerTheme.surfaceColor;
  stage?.viewer.requestRender();
}

function updateViewerVisibility(): void {
  moleculeComponent?.setVisibility(moleculeToggle.checked);
  surfaceComponent?.setVisibility(surfaceToggle.checked);
}

function updateSurfaceOpacity(): void {
  const opacity = Number(opacityInput.value);
  surfaceRepresentation?.setParameters({ opacity });
  opacityOutput.value = `${Math.round(opacity * 100)}%`;
  const appliedOpacity = surfaceRepresentation?.getParameters().opacity;
  if (typeof appliedOpacity === "number") {
    viewerElement.dataset["surfaceOpacity"] = String(appliedOpacity);
  }
  stage?.viewer.requestRender();
}

function clearCalculationState(): void {
  stopActiveCalculation();
  stage?.dispose();
  stage = undefined;
  moleculeComponent = undefined;
  surfaceComponent = undefined;
  moleculeRepresentation = undefined;
  surfaceRepresentation = undefined;
  delete viewerElement.dataset["surfaceOpacity"];
  delete viewerElement.dataset["volumeOrigin"];
  currentRun = undefined;
  submitButton.disabled = false;
}

function resetForNewCalculation(): void {
  clearCalculationState();
  showPanel(setupPanel);
}

function showToolSelector(): void {
  clearCalculationState();
  showPanel(toolSelectorPanel);
}

function syncToolRoute(): void {
  if (window.location.hash === "#volume") {
    showPanel(setupPanel);
    return;
  }
  showToolSelector();
}

function applyPreset(id: string, probe: string, grid: string): void {
  requireElement<HTMLInputElement>("mode-rcsb").checked = true;
  setInputMode("rcsb");
  pdbIdInput.value = id;
  biologicalUnitInput.checked = false;
  requireElement<HTMLInputElement>("include-hetatm").checked = false;
  requireElement<HTMLInputElement>("probe-radius").value = probe;
  requireElement<HTMLInputElement>("grid-size").value = grid;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void startCalculation();
});

for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="input-mode"]')) {
  radio.addEventListener("change", () => setInputMode(radio.value as InputMode));
}

for (const preset of document.querySelectorAll<HTMLButtonElement>("[data-preset-id]")) {
  preset.addEventListener("click", () => {
    const id = preset.dataset["presetId"];
    const probe = preset.dataset["presetProbe"];
    const grid = preset.dataset["presetGrid"];
    if (id !== undefined && probe !== undefined && grid !== undefined) {
      applyPreset(id, probe, grid);
    }
  });
}

cancelButton.addEventListener("click", () => {
  appendConsole("Calculation cancelled.");
  resetForNewCalculation();
});
newCalculationButton.addEventListener("click", resetForNewCalculation);
retryButton.addEventListener("click", resetForNewCalculation);
surfaceToggle.addEventListener("change", updateViewerVisibility);
moleculeToggle.addEventListener("change", updateViewerVisibility);
opacityInput.addEventListener("input", updateSurfaceOpacity);
recenterButton.addEventListener("click", () => stage?.autoView());
fullscreenButton.addEventListener("click", () => {
  void viewerElement.requestFullscreen();
});
themeToggle.addEventListener("click", () => {
  const nextTheme: Theme = document.documentElement.dataset["theme"] === "light" ? "dark" : "light";
  saveTheme(nextTheme);
  applyTheme(nextTheme);
});
window.addEventListener("resize", () => stage?.handleResize());
window.addEventListener("hashchange", syncToolRoute);
window.addEventListener("beforeunload", () => {
  stopActiveCalculation();
  for (const url of downloadUrls) {
    URL.revokeObjectURL(url);
  }
});

applyTheme(loadTheme());
setInputMode("rcsb");
syncToolRoute();
