import { Stage } from "ngl";
import type { RepresentationElement } from "ngl";

import type {
  CalculationRequest,
  CalculationResult,
  ChannelComponent,
  ChannelFilter,
  ChannelFinderResult,
  InputMode,
  ToolId,
  ViewerSurface,
  VolumeRangeResult,
  VolumeRequest,
  WorkerRequest,
  WorkerResponse,
} from "./volume_types";

type CompletedRun = {
  request: CalculationRequest;
  result: CalculationResult;
  mrc: ArrayBuffer;
  viewerSurfaces: ViewerSurface[];
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

type RenderedSurface = {
  artifact: ViewerSurface;
  component: Awaited<ReturnType<Stage["loadFile"]>>;
  representation: RepresentationElement;
  color: string;
  visible: boolean;
};

type SurfaceMetrics = {
  volume: number;
  surfaceArea: number;
  sphericity: number;
  effectiveRadius: number;
  center: { x: number; y: number; z: number };
  voxelCount: number;
};

type ToolDefinition = {
  id: ToolId;
  hash: string;
  title: string;
  description: string;
  parameterDescription: string;
  action: string;
  runningTitle: string;
  resultTitle: string;
};

const ANGSTROM = "\u00c5";
const ANGSTROM_SQUARED = `${ANGSTROM}\u00b2`;
const ANGSTROM_CUBED = `${ANGSTROM}\u00b3`;
const INTERNAL_TOOLS: readonly ToolId[] = ["channel-finder", "channel", "solvent", "tunnel"];
const VOLUME_RANGE_COLORS = [
  "#eab308",
  "#ea7c14",
  "#e0526f",
  "#b05ed7",
  "#548ad8",
  "#159cb0",
] as const;
const CHANNEL_COLORS = [
  "#159cb0",
  "#e07816",
  "#ad5bd3",
  "#34965a",
  "#d14d87",
  "#4b79d1",
  "#d4544c",
  "#aa7b05",
  "#168a76",
  "#7357c7",
  "#a55e3b",
  "#64748b",
] as const;
const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  volume: {
    id: "volume",
    hash: "#volume",
    title: "Volume Calculation",
    description:
      "Voxel-based solvent-excluded volume and surface-area calculation for PDB coordinates.",
    parameterDescription: "Probe radius, voxel spacing, and coordinate-record filters.",
    action: "Calculate volume",
    runningTitle: "Building the molecular volume...",
    resultTitle: "Volume information",
  },
  "volume-range": {
    id: "volume-range",
    hash: "#volume-range",
    title: "Volume Range",
    description:
      "Compare molecular volume and surface area across a controlled series of probe radii.",
    parameterDescription: "Probe range, voxel spacing, and coordinate-record filters.",
    action: "Calculate volume range",
    runningTitle: "Calculating the probe series...",
    resultTitle: "Volume range information",
  },
  "channel-finder": {
    id: "channel-finder",
    hash: "#channel-finder",
    title: "Channel Finder",
    description: "Find major connected internal solvent regions and rank them by accessible size.",
    parameterDescription: "Outer shell, inner solvent probe, size filter, and voxel spacing.",
    action: "Find channels",
    runningTitle: "Finding connected internal channels...",
    resultTitle: "Selected channel union",
  },
  channel: {
    id: "channel",
    hash: "#channel",
    title: "Single Channel Extraction",
    description:
      "Extract the connected internal solvent region containing a known Cartesian coordinate.",
    parameterDescription: "Outer shell, inner solvent probe, seed coordinate, and voxel spacing.",
    action: "Extract channel",
    runningTitle: "Extracting the selected channel...",
    resultTitle: "Channel information",
  },
  solvent: {
    id: "solvent",
    hash: "#solvent",
    title: "Solvent Extraction",
    description:
      "Extract all internal solvent volume between outer-shell and inner-probe surfaces.",
    parameterDescription: "Outer shell, inner solvent probe, trim radius, and voxel spacing.",
    action: "Extract solvent",
    runningTitle: "Extracting internal solvent...",
    resultTitle: "Internal solvent information",
  },
  tunnel: {
    id: "tunnel",
    hash: "#tunnel",
    title: "Exit Tunnel Extraction",
    description:
      "Extract the polypeptide exit tunnel from the deposited H. marismortui 50S structure.",
    parameterDescription: "Ribosomal shell, tunnel probe, trim radius, and voxel spacing.",
    action: "Extract exit tunnel",
    runningTitle: "Extracting the ribosomal exit tunnel...",
    resultTitle: "Exit tunnel information",
  },
};
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
const surfaceToggleLabel = requireElement<HTMLElement>("surface-toggle-label");
const moleculeToggle = requireElement<HTMLInputElement>("molecule-toggle");
const opacityInput = requireElement<HTMLInputElement>("surface-opacity");
const opacityOutput = requireElement<HTMLOutputElement>("surface-opacity-value");
const recenterButton = requireElement<HTMLButtonElement>("recenter-button");
const fullscreenButton = requireElement<HTMLButtonElement>("fullscreen-button");
const themeToggle = requireElement<HTMLButtonElement>("theme-toggle");
const breadcrumbs = requireElement<HTMLElement>("breadcrumbs");
const toolTitle = requireElement<HTMLElement>("tool-title");
const toolDescription = requireElement<HTMLElement>("tool-description");
const parameterDescription = requireElement<HTMLElement>("parameter-description");
const calculateButtonLabel = requireElement<HTMLElement>("calculate-button-label");
const runningTitle = requireElement<HTMLElement>("running-title");
const resultSummaryTitle = requireElement<HTMLElement>("result-summary-title");
const resultProbeLabel = requireElement<HTMLElement>("result-probe-label");
const resultMethodLabel = requireElement<HTMLElement>("result-method-label");
const viewerResolution = requireElement<HTMLElement>("viewer-resolution");
const surfaceLayerPanel = requireElement<HTMLElement>("surface-layer-panel");
const surfaceLayerCount = requireElement<HTMLElement>("surface-layer-count");
const surfaceLayerList = requireElement<HTMLElement>("surface-layer-list");
const showAllSurfacesButton = requireElement<HTMLButtonElement>("show-all-surfaces");
const isolateSurfaceButton = requireElement<HTMLButtonElement>("isolate-surface");
const seriesCard = requireElement<HTMLElement>("series-card");
const seriesTitle = requireElement<HTMLElement>("series-title");
const seriesHead = requireElement<HTMLElement>("series-head");
const seriesBody = requireElement<HTMLElement>("series-body");
const seriesNote = requireElement<HTMLElement>("series-note");
const csvDownload = requireElement<HTMLAnchorElement>("download-csv");

let activeTool: ToolId = "volume";
let worker: Worker | undefined;
let inputAbortController: AbortController | undefined;
let startedAt = 0;
let currentRun: CompletedRun | undefined;
let stage: Stage | undefined;
let moleculeComponent: Awaited<ReturnType<Stage["loadFile"]>> | undefined;
let moleculeRepresentation: RepresentationElement | undefined;
let renderedSurfaces: RenderedSurface[] = [];
let selectedSurfaceId: string | undefined;
const downloadUrls: string[] = [];

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} is missing.`);
  }
  return element as T;
}

function isInternalTool(tool: ToolId): boolean {
  return INTERNAL_TOOLS.includes(tool);
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
    // The selected theme still applies when browser storage is unavailable.
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

async function readGzipText(
  stream: ReadableStream<BufferSource> | null,
  sourceLabel: string,
): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(`This browser cannot decompress ${sourceLabel}.`);
  }
  if (stream === null) {
    throw new Error(`${sourceLabel} did not contain a readable body.`);
  }
  try {
    const decompressed = stream.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(decompressed).text();
  } catch {
    throw new Error(`Could not decompress ${sourceLabel}.`);
  }
}

async function fileIsGzipped(file: File): Promise<boolean> {
  if (/\.gz$/i.test(file.name) || file.type === "application/gzip") {
    return true;
  }
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return signature[0] === 0x1f && signature[1] === 0x8b;
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
  const text = await readGzipText(response.body, "the RCSB biological assembly");
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
  const gzipped = await fileIsGzipped(file);
  signal.throwIfAborted();
  const text = gzipped
    ? await readGzipText(file.stream(), `the uploaded file ${file.name}`)
    : await file.text();
  signal.throwIfAborted();
  return { text, label: file.name };
}

function readNumber(id: string, minimum: number, maximum: number): number {
  const input = requireElement<HTMLInputElement>(id);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${input.labels?.[0]?.textContent ?? id} must be ${minimum} to ${maximum}.`);
  }
  return value;
}

function readFiniteNumber(id: string): number {
  const input = requireElement<HTMLInputElement>(id);
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(`${input.labels?.[0]?.textContent ?? id} must be a finite number.`);
  }
  return value;
}

function readPositiveNumber(id: string): number {
  const input = requireElement<HTMLInputElement>(id);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${input.labels?.[0]?.textContent ?? id} must be greater than 0.`);
  }
  return value;
}

function commonRequest(input: { text: string; label: string }): {
  pdbText: string;
  inputLabel: string;
  gridSize: number;
  includeHetatm: boolean;
  excludeWater: boolean;
} {
  return {
    pdbText: input.text,
    inputLabel: input.label,
    gridSize: readPositiveNumber("grid-size"),
    includeHetatm: requireElement<HTMLInputElement>("include-hetatm").checked,
    excludeWater: requireElement<HTMLInputElement>("exclude-water").checked,
  };
}

function channelFilter(): ChannelFilter {
  const mode = requireElement<HTMLSelectElement>("channel-filter-mode").value;
  const value = readPositiveNumber("channel-filter-value");
  if (mode === "largest") {
    return { mode, value: Math.round(value) };
  }
  if (mode === "minimum-volume" || mode === "minimum-percent") {
    return { mode, value };
  }
  throw new Error("Choose a valid Channel Finder filter.");
}

async function buildRequest(signal: AbortSignal): Promise<CalculationRequest> {
  const input = await readInput(signal);
  const shared = commonRequest(input);
  if (activeTool === "volume") {
    const request: VolumeRequest = {
      tool: "volume",
      ...shared,
      probe: readNumber("probe-radius", 0, 20),
      fillInternalCavities: requireElement<HTMLInputElement>("fill-internal-cavities").checked,
    };
    return request;
  }
  if (activeTool === "volume-range") {
    const minimumProbe = readNumber("minimum-probe", 0, 20);
    const maximumProbe = readNumber("maximum-probe", 0, 20);
    const probeStep = readPositiveNumber("probe-step");
    if (maximumProbe < minimumProbe) {
      throw new Error("Maximum probe radius must be at least the minimum probe radius.");
    }
    return {
      tool: "volume-range",
      ...shared,
      minimumProbe,
      maximumProbe,
      probeStep,
    };
  }

  const bigProbe = readNumber("big-probe", 0.1, 40);
  const smallProbe = readNumber("small-probe", 0, 40);
  const trimProbe = readNumber("trim-probe", 0, 20);
  if (smallProbe > bigProbe) {
    throw new Error("Inner probe radius must not exceed the outer probe radius.");
  }
  const internal = { ...shared, bigProbe, smallProbe, trimProbe };
  if (activeTool === "channel") {
    return {
      tool: "channel",
      ...internal,
      coordinate: {
        x: readFiniteNumber("coordinate-x"),
        y: readFiniteNumber("coordinate-y"),
        z: readFiniteNumber("coordinate-z"),
      },
    };
  }
  if (activeTool === "channel-finder") {
    return { tool: "channel-finder", ...internal, filter: channelFilter() };
  }
  if (activeTool === "solvent") {
    return { tool: "solvent", ...internal };
  }
  return { tool: "tunnel", ...internal };
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
  updateBreadcrumbs(panel);
  window.scrollTo({ top: 0 });
}

function updateBreadcrumbs(panel: HTMLElement): void {
  if (panel === toolSelectorPanel) {
    breadcrumbs.hidden = true;
    breadcrumbs.replaceChildren();
    return;
  }

  const definition = TOOL_DEFINITIONS[activeTool];
  const list = document.createElement("ol");
  const toolsItem = document.createElement("li");
  const toolsLink = document.createElement("a");
  toolsLink.href = "#";
  toolsLink.textContent = "All tools";
  toolsItem.append(toolsLink);
  list.append(toolsItem);

  const toolItem = document.createElement("li");
  if (panel === setupPanel) {
    const current = document.createElement("span");
    current.textContent = definition.title;
    current.ariaCurrent = "page";
    toolItem.append(current);
  } else {
    const toolLink = document.createElement("a");
    toolLink.href = definition.hash;
    toolLink.textContent = definition.title;
    toolLink.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.replaceState(null, "", definition.hash);
      resetForNewCalculation();
    });
    toolItem.append(toolLink);
  }
  list.append(toolItem);

  if (panel !== setupPanel) {
    const stateItem = document.createElement("li");
    const current = document.createElement("span");
    current.ariaCurrent = "page";
    if (panel === runningPanel) {
      current.textContent = "Running";
    } else if (panel === resultsPanel) {
      current.textContent = "Results";
    } else {
      current.textContent = "Needs attention";
    }
    stateItem.append(current);
    list.append(stateItem);
  }
  breadcrumbs.replaceChildren(list);
  breadcrumbs.hidden = false;
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

function parameterSummary(request: CalculationRequest): string {
  if (request.tool === "volume") {
    return `Probe ${request.probe.toFixed(2)} ${ANGSTROM}; grid ${request.gridSize.toFixed(2)} ${ANGSTROM}`;
  }
  if (request.tool === "volume-range") {
    return (
      `Probes ${request.minimumProbe.toFixed(2)}-${request.maximumProbe.toFixed(2)} ` +
      `${ANGSTROM}; step ${request.probeStep.toFixed(2)} ${ANGSTROM}`
    );
  }
  return (
    `Outer probe ${request.bigProbe.toFixed(2)} ${ANGSTROM}; ` +
    `inner probe ${request.smallProbe.toFixed(2)} ${ANGSTROM}; ` +
    `grid ${request.gridSize.toFixed(2)} ${ANGSTROM}`
  );
}

async function startCalculation(): Promise<void> {
  stopActiveCalculation();
  const controller = new AbortController();
  inputAbortController = controller;
  consoleOutput.textContent = "";
  showPanel(runningPanel);
  appendConsole(`Preparing the ${TOOL_DEFINITIONS[activeTool].title} calculation...`);
  submitButton.disabled = true;
  try {
    const request = await buildRequest(controller.signal);
    if (controller.signal.aborted || inputAbortController !== controller) {
      return;
    }
    inputAbortController = undefined;
    appendConsole(`Input ready: ${request.inputLabel}`);
    appendConsole(parameterSummary(request));
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

function handleWorkerMessage(response: WorkerResponse, request: CalculationRequest): void {
  if (response.type === "progress") {
    appendConsole(response.message);
    return;
  }
  if (response.type === "error") {
    showError(response.message);
    return;
  }
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const completedRun: CompletedRun = {
    request,
    result: response.result,
    mrc: response.mrc,
    viewerSurfaces: response.viewerSurfaces,
    elapsedSeconds,
  };
  currentRun = completedRun;
  appendConsole("Program completed successfully.");
  stopWorker();
  void renderResults(completedRun).catch((error: unknown) => {
    if (currentRun !== completedRun) {
      return;
    }
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

function probeResultText(run: CompletedRun): string {
  const result = run.result;
  if (result.tool === "volume") {
    return `${result.probe.toFixed(2)} ${ANGSTROM}`;
  }
  if (result.tool === "volume-range") {
    return `${result.minimumProbe.toFixed(2)}-${result.maximumProbe.toFixed(2)} ${ANGSTROM}`;
  }
  return (
    `${result.bigProbe.toFixed(2)} ${ANGSTROM} outer; ` +
    `${result.smallProbe.toFixed(2)} ${ANGSTROM} inner; ` +
    `${result.trimProbe.toFixed(2)} ${ANGSTROM} trim`
  );
}

function methodResultText(result: CalculationResult): string {
  if (result.tool === "volume") {
    return result.fillInternalCavities
      ? `Filled (${formatInteger(result.cavityVoxelsFilled)} accessible-grid voxels)`
      : "Not filled";
  }
  if (result.tool === "volume-range") {
    return `${result.points.length} probe surfaces`;
  }
  if (result.tool === "channel-finder") {
    return `${result.selectedComponentCount} of ${result.matchedComponentCount} matching`;
  }
  return `${formatInteger(result.accessibleVolume)} ${ANGSTROM_CUBED} accessible`;
}

function configureResultLabels(result: CalculationResult): void {
  resultSummaryTitle.textContent = TOOL_DEFINITIONS[result.tool].resultTitle;
  if (result.tool === "volume") {
    resultProbeLabel.textContent = "Probe radius";
    resultMethodLabel.textContent = "Internal cavities";
  } else if (result.tool === "volume-range") {
    resultProbeLabel.textContent = "Probe range";
    resultMethodLabel.textContent = "Layered surfaces";
  } else {
    resultProbeLabel.textContent = "Probe radii";
    resultMethodLabel.textContent =
      result.tool === "channel-finder" ? "Selected components" : "Accessible volume";
  }
}

function renderMetrics(metrics: SurfaceMetrics): void {
  setResultText("result-volume", `${formatInteger(metrics.volume)} ${ANGSTROM_CUBED}`);
  setResultText("result-surface", `${formatInteger(metrics.surfaceArea)} ${ANGSTROM_SQUARED}`);
  setResultText("result-sphericity", metrics.sphericity.toFixed(3));
  setResultText("result-radius", `${metrics.effectiveRadius.toFixed(2)} ${ANGSTROM}`);
  setResultText(
    "result-center",
    `(${formatCoordinate(metrics.center.x)}, ${formatCoordinate(metrics.center.y)}, ` +
      `${formatCoordinate(metrics.center.z)}) ${ANGSTROM}`,
  );
  setResultText("result-voxels", formatInteger(metrics.voxelCount));
}

async function renderResults(run: CompletedRun): Promise<void> {
  const result = run.result;
  setResultText("result-input", run.request.inputLabel);
  renderMetrics(result);
  setResultText("result-atoms", formatInteger(result.atomCount));
  setResultText("result-total-voxels", formatInteger(result.totalGridVoxels));
  setResultText(
    "result-grid",
    `${result.dimensions.x} x ${result.dimensions.y} x ${result.dimensions.z}`,
  );
  setResultText("result-spacing", `${result.gridSize.toFixed(2)} ${ANGSTROM}`);
  setResultText("result-probe", probeResultText(run));
  setResultText("result-cavities", methodResultText(result));
  configureResultLabels(result);
  renderSeries(run);
  renderLayerControls(run);
  surfaceToggleLabel.textContent = run.viewerSurfaces.length > 1 ? "Surfaces" : "Surface";
  elapsedOutput.textContent = `${run.elapsedSeconds.toFixed(2)} seconds`;
  const firstSurface = run.viewerSurfaces[0];
  if (firstSurface === undefined) {
    throw new Error("The completed calculation did not provide a viewer surface.");
  }
  const binnedSurfaces = run.viewerSurfaces.filter((surface) => surface.binFactor > 1);
  viewerElement.dataset["previewBin"] = String(
    Math.max(...run.viewerSurfaces.map((surface) => surface.binFactor)),
  );
  if (run.viewerSurfaces.length === 1) {
    viewerResolution.textContent =
      firstSurface.binFactor === 1
        ? `Surface preview uses the full ${result.gridSize.toFixed(2)} ${ANGSTROM} grid.`
        : `Surface preview is binned ${firstSurface.binFactor}x to ` +
          `${firstSurface.spacing.toFixed(2)} ${ANGSTROM}; values and downloads remain full resolution.`;
  } else {
    viewerResolution.textContent =
      binnedSurfaces.length === 0
        ? `Surface layers use their full ${result.gridSize.toFixed(2)} ${ANGSTROM} grids.`
        : `${binnedSurfaces.length} surface layer previews are binned; ` +
          "measurements and downloads remain full resolution.";
  }
  showPanel(resultsPanel);
  if (!(await wireDownloads(run))) {
    return;
  }
  run.mrc = new ArrayBuffer(0);
  if (!(await renderViewer(run))) {
    return;
  }
  submitButton.disabled = false;
}

function appendTableRow(values: string[], header = false): void {
  const row = document.createElement("tr");
  for (const value of values) {
    const cell = document.createElement(header ? "th" : "td");
    cell.textContent = value;
    row.append(cell);
  }
  if (header) {
    seriesHead.append(row);
  } else {
    seriesBody.append(row);
  }
}

function surfaceColor(surface: ViewerSurface, index: number): string {
  if (surface.kind === "probe") {
    return VOLUME_RANGE_COLORS[index % VOLUME_RANGE_COLORS.length]!;
  }
  if (surface.kind === "channel") {
    return CHANNEL_COLORS[(surface.value - 1) % CHANNEL_COLORS.length]!;
  }
  return VIEWER_THEMES[currentTheme()].surfaceColor;
}

function appendLayerLabel(cell: HTMLTableCellElement, surface: ViewerSurface): void {
  const wrapper = document.createElement("span");
  wrapper.className = "layer-label";
  const swatch = document.createElement("span");
  swatch.className = "surface-swatch";
  swatch.style.backgroundColor = surfaceColor(surface, runSurfaceIndex(surface.id));
  const button = document.createElement("button");
  button.className = "layer-action";
  button.type = "button";
  button.textContent = surface.label;
  button.addEventListener("click", () => selectSurface(surface.id));
  wrapper.append(swatch, button);
  cell.append(wrapper);
}

function appendLayerDownload(cell: HTMLTableCellElement, surface: ViewerSurface): void {
  const anchor = document.createElement("a");
  anchor.className = "layer-download";
  anchor.dataset["surfaceDownload"] = surface.id;
  anchor.href = "#";
  anchor.textContent = "Preparing MRC";
  cell.append(anchor);
}

function appendChannelHandoff(cell: HTMLTableCellElement, component: ChannelComponent): void {
  const button = document.createElement("button");
  button.className = "layer-action";
  button.type = "button";
  button.textContent = "Extract this channel";
  button.addEventListener("click", () => portChannelToExtractor(component));
  cell.append(button);
}

function renderSeries(run: CompletedRun): void {
  const result = run.result;
  seriesHead.replaceChildren();
  seriesBody.replaceChildren();
  seriesCard.hidden = result.tool !== "volume-range" && result.tool !== "channel-finder";
  if (result.tool === "volume-range") {
    seriesTitle.textContent = "Probe-radius series";
    appendTableRow(["Layer", "Volume", "Surface area", "Filled voxels", "Offline map"], true);
    for (const point of result.points) {
      const surface = requireViewerSurface(run, `probe-${point.probe.toFixed(6)}`);
      const row = document.createElement("tr");
      row.dataset["surfaceRow"] = surface.id;
      const labelCell = document.createElement("td");
      appendLayerLabel(labelCell, surface);
      const values = [
        `${formatInteger(point.volume)} ${ANGSTROM_CUBED}`,
        `${formatInteger(point.surfaceArea)} ${ANGSTROM_SQUARED}`,
        formatInteger(point.voxelCount),
      ];
      row.append(labelCell);
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      const downloadCell = document.createElement("td");
      appendLayerDownload(downloadCell, surface);
      row.append(downloadCell);
      seriesBody.append(row);
    }
    seriesNote.textContent =
      "All probe surfaces share one molecule and camera. Select a layer for its measurements.";
  } else if (result.tool === "channel-finder") {
    seriesTitle.textContent = "Ranked selected channels";
    appendTableRow(["Layer", "Excluded volume", "Center of mass", "Offline map", "Continue"], true);
    for (const component of result.components) {
      const surface = requireViewerSurface(run, `channel-${component.rank}`);
      const row = document.createElement("tr");
      row.dataset["surfaceRow"] = surface.id;
      const labelCell = document.createElement("td");
      appendLayerLabel(labelCell, surface);
      const volumeCell = document.createElement("td");
      volumeCell.textContent = `${formatInteger(component.volume)} ${ANGSTROM_CUBED}`;
      const centerCell = document.createElement("td");
      centerCell.textContent =
        `(${formatCoordinate(component.center.x)}, ${formatCoordinate(component.center.y)}, ` +
        `${formatCoordinate(component.center.z)}) ${ANGSTROM}`;
      const downloadCell = document.createElement("td");
      appendLayerDownload(downloadCell, surface);
      const handoffCell = document.createElement("td");
      appendChannelHandoff(handoffCell, component);
      row.append(labelCell, volumeCell, centerCell, downloadCell, handoffCell);
      seriesBody.append(row);
    }
    seriesNote.textContent =
      `${result.matchedComponentCount} components matched; ${result.selectedComponentCount} ` +
      "are colored separately, with a combined union available in Surface layers.";
  }
}

function requireViewerSurface(run: CompletedRun, id: string): ViewerSurface {
  const surface = run.viewerSurfaces.find((candidate) => candidate.id === id);
  if (surface === undefined) {
    throw new Error(`Viewer surface ${id} is missing from the completed result.`);
  }
  return surface;
}

function runSurfaceIndex(id: string): number {
  const index = currentRun?.viewerSurfaces.findIndex((surface) => surface.id === id) ?? -1;
  return Math.max(index, 0);
}

function setLayerVisibility(id: string, visible: boolean): void {
  const rendered = renderedSurfaces.find((surface) => surface.artifact.id === id);
  if (rendered !== undefined) {
    rendered.visible = visible;
    rendered.component?.setVisibility(surfaceToggle.checked && visible);
  }
  const checkbox = surfaceLayerList.querySelector<HTMLInputElement>(
    `input[data-surface-visibility="${id}"]`,
  );
  if (checkbox !== null) {
    checkbox.checked = visible;
  }
  updateViewerLayerState();
}

function showAllSurfaceLayers(): void {
  const run = currentRun;
  if (run === undefined) {
    return;
  }
  surfaceToggle.checked = true;
  for (const surface of run.viewerSurfaces) {
    setLayerVisibility(surface.id, surface.kind !== "channel-union");
  }
  updateViewerVisibility();
}

function isolateSelectedSurface(): void {
  const run = currentRun;
  if (run === undefined || selectedSurfaceId === undefined) {
    return;
  }
  surfaceToggle.checked = true;
  for (const surface of run.viewerSurfaces) {
    setLayerVisibility(surface.id, surface.id === selectedSurfaceId);
  }
  updateViewerVisibility();
}

function renderSelectedSurfaceDetails(run: CompletedRun, surface: ViewerSurface): void {
  const result = run.result;
  if (surface.kind === "probe" && result.tool === "volume-range") {
    const point = result.points.find((candidate) => candidate.probe === surface.value);
    if (point === undefined) {
      throw new Error(`${surface.label} measurements are missing.`);
    }
    resultSummaryTitle.textContent = `${surface.label} information`;
    renderMetrics(point);
    setResultText("result-total-voxels", formatInteger(point.totalGridVoxels));
    setResultText(
      "result-grid",
      `${point.dimensions.x} x ${point.dimensions.y} x ${point.dimensions.z}`,
    );
    resultProbeLabel.textContent = "Probe radius";
    setResultText("result-probe", `${point.probe.toFixed(2)} ${ANGSTROM}`);
    resultMethodLabel.textContent = "Layered surfaces";
    setResultText("result-cavities", `${result.points.length} in this range`);
    return;
  }
  if (surface.kind === "channel" && result.tool === "channel-finder") {
    const component = result.components.find((candidate) => candidate.rank === surface.value);
    if (component === undefined) {
      throw new Error(`${surface.label} measurements are missing.`);
    }
    resultSummaryTitle.textContent = `${surface.label} information`;
    renderMetrics(component);
    resultProbeLabel.textContent = "Probe radii";
    setResultText("result-probe", probeResultText(run));
    resultMethodLabel.textContent = "Extractor coordinate";
    setResultText(
      "result-cavities",
      `(${formatCoordinate(component.extractionCoordinate.x)}, ` +
        `${formatCoordinate(component.extractionCoordinate.y)}, ` +
        `${formatCoordinate(component.extractionCoordinate.z)}) ${ANGSTROM}`,
    );
    return;
  }
  resultSummaryTitle.textContent = TOOL_DEFINITIONS[result.tool].resultTitle;
  renderMetrics(result);
  setResultText("result-total-voxels", formatInteger(result.totalGridVoxels));
  setResultText(
    "result-grid",
    `${result.dimensions.x} x ${result.dimensions.y} x ${result.dimensions.z}`,
  );
  setResultText("result-probe", probeResultText(run));
  setResultText("result-cavities", methodResultText(result));
  configureResultLabels(result);
}

function selectSurface(id: string): void {
  const run = currentRun;
  if (run === undefined) {
    return;
  }
  const surface = requireViewerSurface(run, id);
  selectedSurfaceId = id;
  for (const item of surfaceLayerList.querySelectorAll<HTMLElement>("[data-surface-item]")) {
    item.dataset["selected"] = String(item.dataset["surfaceItem"] === id);
  }
  for (const row of seriesBody.querySelectorAll<HTMLTableRowElement>("[data-surface-row]")) {
    row.dataset["selected"] = String(row.dataset["surfaceRow"] === id);
  }
  viewerElement.dataset["selectedSurfaceId"] = id;
  renderSelectedSurfaceDetails(run, surface);
  updateSurfaceOpacity();
}

function renderLayerControls(run: CompletedRun): void {
  surfaceLayerList.replaceChildren();
  const isLayered = run.viewerSurfaces.length > 1;
  surfaceLayerPanel.hidden = !isLayered;
  surfaceLayerCount.textContent = `${run.viewerSurfaces.length} available`;
  showAllSurfacesButton.textContent =
    run.result.tool === "channel-finder" ? "Show channels" : "Show all";
  if (!isLayered) {
    selectedSurfaceId = run.viewerSurfaces[0]?.id;
    return;
  }
  for (const [index, surface] of run.viewerSurfaces.entries()) {
    const item = document.createElement("div");
    item.className = "surface-layer-item";
    item.dataset["surfaceItem"] = surface.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = surface.initiallyVisible;
    checkbox.dataset["surfaceVisibility"] = surface.id;
    checkbox.setAttribute("aria-label", `Show ${surface.label}`);
    checkbox.addEventListener("change", () => setLayerVisibility(surface.id, checkbox.checked));
    const swatch = document.createElement("span");
    swatch.className = "surface-swatch";
    swatch.style.backgroundColor = surfaceColor(surface, index);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = surface.label;
    button.addEventListener("click", () => selectSurface(surface.id));
    item.append(checkbox, swatch, button);
    surfaceLayerList.append(item);
  }
  const firstVisible = run.viewerSurfaces.find(
    (surface) => surface.initiallyVisible && surface.kind !== "channel-union",
  );
  selectSurface(firstVisible?.id ?? run.viewerSurfaces[0]!.id);
}

function portChannelToExtractor(component: ChannelComponent): void {
  const run = currentRun;
  if (run === undefined || run.request.tool !== "channel-finder") {
    return;
  }
  setInputValue("big-probe", String(run.request.bigProbe));
  setInputValue("small-probe", String(run.request.smallProbe));
  setInputValue("trim-probe", String(run.request.trimProbe));
  setInputValue("grid-size", String(run.request.gridSize));
  setInputValue("coordinate-x", String(component.extractionCoordinate.x));
  setInputValue("coordinate-y", String(component.extractionCoordinate.y));
  setInputValue("coordinate-z", String(component.extractionCoordinate.z));
  requireElement<HTMLInputElement>("include-hetatm").checked = run.request.includeHetatm;
  requireElement<HTMLInputElement>("exclude-water").checked = run.request.excludeWater;
  window.location.hash = TOOL_DEFINITIONS.channel.hash;
}

function createDownload(id: string, blob: Blob, filename: string): void {
  const anchor = requireElement<HTMLAnchorElement>(id);
  assignDownload(anchor, blob, filename);
}

function assignDownload(anchor: HTMLAnchorElement, blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrls.push(url);
  anchor.href = url;
  anchor.download = filename;
}

async function gzipBlob(blob: Blob): Promise<Blob | undefined> {
  if (typeof CompressionStream === "undefined") {
    return undefined;
  }
  try {
    const compressedStream = blob.stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = await new Response(compressedStream).blob();
    return compressed.slice(0, compressed.size, "application/gzip");
  } catch {
    return undefined;
  }
}

function clearDownloadUrls(): void {
  for (const url of downloadUrls.splice(0)) {
    URL.revokeObjectURL(url);
  }
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(".download-grid a")) {
    anchor.removeAttribute("download");
    anchor.href = "#";
  }
  csvDownload.hidden = true;
}

function resultStem(request: CalculationRequest): string {
  return request.inputLabel
    .replace(/\.(?:pdb(?:\d+)?|ent)(?:\.gz)?$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "_");
}

function methodName(request: CalculationRequest): string {
  if (request.tool === "volume") {
    return request.fillInternalCavities ? "volume-no-cav" : "volume";
  }
  return request.tool;
}

function requestParameters(request: CalculationRequest): object {
  const common = {
    tool: request.tool,
    gridSize: request.gridSize,
    includeHetatm: request.includeHetatm,
    excludeWater: request.excludeWater,
  };
  if (request.tool === "volume") {
    return {
      ...common,
      probe: request.probe,
      fillInternalCavities: request.fillInternalCavities,
    };
  }
  if (request.tool === "volume-range") {
    return {
      ...common,
      minimumProbe: request.minimumProbe,
      maximumProbe: request.maximumProbe,
      probeStep: request.probeStep,
    };
  }
  const probes = {
    ...common,
    bigProbe: request.bigProbe,
    smallProbe: request.smallProbe,
    trimProbe: request.trimProbe,
  };
  if (request.tool === "channel") {
    return { ...probes, coordinate: request.coordinate };
  }
  if (request.tool === "channel-finder") {
    return { ...probes, filter: request.filter };
  }
  return probes;
}

function csvText(result: VolumeRangeResult | ChannelFinderResult): string {
  if (result.tool === "volume-range") {
    const rows = ["probe_A,color_hex,volume_A3,surface_area_A2,filled_voxels,bounding_grid_voxels"];
    for (const [index, point] of result.points.entries()) {
      rows.push(
        [
          point.probe.toFixed(6),
          VOLUME_RANGE_COLORS[index % VOLUME_RANGE_COLORS.length]!,
          point.volume.toFixed(6),
          point.surfaceArea.toFixed(6),
          String(point.voxelCount),
          String(point.totalGridVoxels),
        ].join(","),
      );
    }
    return `${rows.join("\n")}\n`;
  }
  const rows = [
    "rank,color_hex,accessible_voxels,accessible_volume_A3,excluded_voxels," +
      "excluded_volume_A3,surface_area_A2,center_x_A,center_y_A,center_z_A," +
      "extractor_x_A,extractor_y_A,extractor_z_A",
  ];
  for (const component of result.components) {
    rows.push(
      [
        String(component.rank),
        CHANNEL_COLORS[(component.rank - 1) % CHANNEL_COLORS.length]!,
        String(component.accessibleVoxelCount),
        (component.accessibleVoxelCount * result.gridSize ** 3).toFixed(6),
        String(component.voxelCount),
        component.volume.toFixed(6),
        component.surfaceArea.toFixed(6),
        component.center.x.toFixed(6),
        component.center.y.toFixed(6),
        component.center.z.toFixed(6),
        component.extractionCoordinate.x.toFixed(6),
        component.extractionCoordinate.y.toFixed(6),
        component.extractionCoordinate.z.toFixed(6),
      ].join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

function surfaceDownloadFilename(
  run: CompletedRun,
  surface: ViewerSurface,
  extension: "mrc" | "mrc.gz",
): string {
  const stem = resultStem(run.request);
  if (surface.kind === "probe") {
    return `${stem}-volume-range-probe-${surface.value.toFixed(2)}.${extension}`;
  }
  if (surface.kind === "channel") {
    return `${stem}-channel-finder-channel-${String(surface.value).padStart(2, "0")}.${extension}`;
  }
  return `${stem}-${methodName(run.request)}.${extension}`;
}

async function wireSurfaceDownloads(run: CompletedRun): Promise<boolean> {
  for (const surface of run.viewerSurfaces) {
    if (surface.kind !== "probe" && surface.kind !== "channel") {
      continue;
    }
    const anchor = seriesBody.querySelector<HTMLAnchorElement>(
      `a[data-surface-download="${surface.id}"]`,
    );
    if (anchor === null) {
      continue;
    }
    const rawMrc = new Blob([surface.downloadMrc], { type: "application/octet-stream" });
    const compressedMrc = await gzipBlob(rawMrc);
    if (currentRun !== run) {
      return false;
    }
    if (compressedMrc === undefined) {
      assignDownload(anchor, rawMrc, surfaceDownloadFilename(run, surface, "mrc"));
      anchor.textContent = "MRC";
    } else {
      assignDownload(anchor, compressedMrc, surfaceDownloadFilename(run, surface, "mrc.gz"));
      anchor.textContent = "MRC (.gz)";
    }
    anchor.setAttribute("aria-label", `Download ${surface.label} MRC density map`);
  }
  return true;
}

async function wireDownloads(run: CompletedRun): Promise<boolean> {
  clearDownloadUrls();
  const stem = resultStem(run.request);
  const method = methodName(run.request);
  createDownload(
    "download-pdb",
    new Blob([run.request.pdbText], { type: "chemical/x-pdb" }),
    `${stem}.pdb`,
  );
  const rawMrc = new Blob([run.mrc], { type: "application/octet-stream" });
  const compressedMrc = await gzipBlob(rawMrc);
  if (currentRun !== run) {
    return false;
  }
  const mrcLabel = requireElement<HTMLElement>("download-mrc-label");
  const mrcDescription = requireElement<HTMLElement>("download-mrc-description");
  const mapDescription =
    run.result.tool === "channel-finder"
      ? "Combined occupancy map for the selected ranked channels"
      : run.result.tool === "volume-range"
        ? "Largest-probe occupancy map; every probe map is available in the series table"
        : "Occupancy map for the displayed result";
  if (compressedMrc === undefined) {
    mrcLabel.textContent = "MRC density map";
    mrcDescription.textContent = `${mapDescription}; gzip is unavailable in this browser`;
    createDownload("download-mrc", rawMrc, `${stem}-${method}.mrc`);
  } else {
    mrcLabel.textContent = "MRC density map (.gz)";
    mrcDescription.textContent = `${mapDescription}; decompress if required by your viewer`;
    createDownload("download-mrc", compressedMrc, `${stem}-${method}.mrc.gz`);
  }
  if (!(await wireSurfaceDownloads(run))) {
    return false;
  }
  const report = {
    input: run.request.inputLabel,
    elapsedSeconds: run.elapsedSeconds,
    parameters: requestParameters(run.request),
    results: run.result,
    viewerLayers: run.viewerSurfaces.map((surface, index) => ({
      id: surface.id,
      label: surface.label,
      color: surfaceColor(surface, index),
      initiallyVisible: surface.initiallyVisible,
      download: seriesBody.querySelector<HTMLAnchorElement>(
        `a[data-surface-download="${surface.id}"]`,
      )?.download,
    })),
  };
  createDownload(
    "download-json",
    new Blob([JSON.stringify(report, undefined, 2)], { type: "application/json" }),
    `${stem}-${method}-results.json`,
  );
  if (run.result.tool === "volume-range" || run.result.tool === "channel-finder") {
    csvDownload.hidden = false;
    createDownload(
      "download-csv",
      new Blob([csvText(run.result)], { type: "text/csv" }),
      `${stem}-${method}-results.csv`,
    );
  }
  return true;
}

async function renderViewer(run: CompletedRun): Promise<boolean> {
  const viewerTheme = VIEWER_THEMES[currentTheme()];
  const renderStage = new Stage(viewerElement, {
    backgroundColor: viewerTheme.backgroundColor,
    quality: "medium",
  });
  stage = renderStage;
  renderStage.setParameters({ cameraType: "orthographic" });
  const loadedMolecule = await renderStage.loadFile(
    new Blob([run.request.pdbText], { type: "chemical/x-pdb" }),
    { ext: "pdb", defaultRepresentation: false },
  );
  if (currentRun !== run) {
    renderStage.dispose();
    if (stage === renderStage) {
      stage = undefined;
    }
    return false;
  }
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
  const placements: Record<string, string> = {};
  renderedSurfaces = [];
  for (const [index, artifact] of run.viewerSurfaces.entries()) {
    const loadedSurface = await renderStage.loadFile(
      new Blob([artifact.mrc], { type: "application/octet-stream" }),
      { ext: "mrc", defaultRepresentation: false },
    );
    if (currentRun !== run) {
      renderStage.dispose();
      if (stage === renderStage) {
        stage = undefined;
      }
      return false;
    }
    if (loadedSurface === undefined) {
      throw new Error(`NGL did not return the ${artifact.label} volume component.`);
    }
    placements[artifact.id] = verifyVolumePlacement(
      loadedSurface.object as NglVolumeObject,
      artifact,
    );
    const representation = loadedSurface.addRepresentation("surface", {
      isolevel: artifact.isolevel,
      color: surfaceColor(artifact, index),
      opacity: Number(opacityInput.value),
      depthWrite: false,
      opaqueBack: false,
      side: "double",
    }) as RepresentationElement;
    loadedSurface.setVisibility(artifact.initiallyVisible);
    renderedSurfaces.push({
      artifact,
      component: loadedSurface,
      representation,
      color: surfaceColor(artifact, index),
      visible: artifact.initiallyVisible,
    });
    artifact.mrc = new ArrayBuffer(0);
  }
  if (run.result.tool === "volume-range") {
    opacityInput.value = "0.15";
  } else if (run.result.tool === "channel-finder") {
    opacityInput.value = "0.42";
  }
  viewerElement.dataset["surfaceOrigins"] = JSON.stringify(placements);
  applyViewerTheme(currentTheme());
  updateSurfaceOpacity();
  renderStage.autoView();
  updateViewerVisibility();
  return true;
}

function verifyVolumePlacement(volume: NglVolumeObject, preview: ViewerSurface): string {
  const elements = volume.matrix?.elements;
  if (elements === undefined || elements.length < 16) {
    throw new Error("NGL did not expose the density-map placement matrix.");
  }
  const parsedOrigin = [Number(elements[12]), Number(elements[13]), Number(elements[14])];
  const expectedOrigin = [preview.origin.x, preview.origin.y, preview.origin.z];
  const tolerance = Math.max(preview.spacing * 0.0001, 0.00001);
  if (parsedOrigin.some((value, index) => Math.abs(value - expectedOrigin[index]!) > tolerance)) {
    throw new Error("NGL placed the density map at coordinates that differ from the WASM result.");
  }
  viewerElement.dataset["volumeOrigin"] = parsedOrigin.join(",");
  return parsedOrigin.join(",");
}

function applyViewerTheme(theme: Theme): void {
  const viewerTheme = VIEWER_THEMES[theme];
  stage?.setParameters({ backgroundColor: viewerTheme.backgroundColor });
  moleculeRepresentation?.setParameters({
    colorScheme: "chainname",
    colorScale: viewerTheme.chainColors,
  });
  for (const [index, surface] of renderedSurfaces.entries()) {
    surface.color = surfaceColor(surface.artifact, index);
    surface.representation.setParameters({ color: surface.color });
  }
  viewerElement.dataset["viewerTheme"] = theme;
  viewerElement.dataset["viewerBackground"] = viewerTheme.backgroundColor;
  viewerElement.dataset["surfaceColors"] = renderedSurfaces
    .map((surface) => surface.color)
    .join(",");
  stage?.viewer.requestRender();
}

function updateViewerVisibility(): void {
  moleculeComponent?.setVisibility(moleculeToggle.checked);
  for (const surface of renderedSurfaces) {
    surface.component?.setVisibility(surfaceToggle.checked && surface.visible);
  }
  updateViewerLayerState();
}

function updateViewerLayerState(): void {
  const visibleCount = renderedSurfaces.filter(
    (surface) => surfaceToggle.checked && surface.visible,
  ).length;
  viewerElement.dataset["surfaceCount"] = String(renderedSurfaces.length);
  viewerElement.dataset["visibleSurfaceCount"] = String(visibleCount);
  surfaceLayerCount.textContent = `${visibleCount} of ${renderedSurfaces.length} shown`;
  stage?.viewer.requestRender();
}

function updateSurfaceOpacity(): void {
  const opacity = Number(opacityInput.value);
  for (const surface of renderedSurfaces) {
    const isSelected = renderedSurfaces.length > 1 && surface.artifact.id === selectedSurfaceId;
    const appliedOpacity = isSelected ? Math.min(opacity + 0.18, 1) : opacity;
    surface.representation.setParameters({ opacity: appliedOpacity });
  }
  opacityOutput.value = `${Math.round(opacity * 100)}%`;
  viewerElement.dataset["surfaceOpacity"] = String(opacity);
  stage?.viewer.requestRender();
}

function resetViewer(): void {
  stage?.dispose();
  stage = undefined;
  moleculeComponent = undefined;
  moleculeRepresentation = undefined;
  renderedSurfaces = [];
  selectedSurfaceId = undefined;
  viewerElement.replaceChildren();
  for (const key of [
    "surfaceOpacity",
    "volumeOrigin",
    "previewBin",
    "viewerTheme",
    "viewerBackground",
    "surfaceColors",
    "surfaceCount",
    "visibleSurfaceCount",
    "selectedSurfaceId",
    "surfaceOrigins",
  ]) {
    delete viewerElement.dataset[key];
  }
  surfaceToggle.checked = true;
  moleculeToggle.checked = true;
  opacityInput.value = "0.35";
  opacityOutput.value = "35%";
  surfaceLayerPanel.hidden = true;
  surfaceLayerList.replaceChildren();
  surfaceLayerCount.textContent = "";
  viewerResolution.textContent = "";
}

function clearCalculationState(): void {
  stopActiveCalculation();
  resetViewer();
  clearDownloadUrls();
  seriesCard.hidden = true;
  seriesHead.replaceChildren();
  seriesBody.replaceChildren();
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

function toolFromHash(): ToolId | undefined {
  for (const definition of Object.values(TOOL_DEFINITIONS)) {
    if (definition.hash === window.location.hash) {
      return definition.id;
    }
  }
  return undefined;
}

function configureToolForm(): void {
  const definition = TOOL_DEFINITIONS[activeTool];
  toolTitle.textContent = definition.title;
  toolDescription.textContent = definition.description;
  parameterDescription.textContent = definition.parameterDescription;
  calculateButtonLabel.textContent = definition.action;
  runningTitle.textContent = definition.runningTitle;

  for (const element of document.querySelectorAll<HTMLElement>("[data-tool-controls]")) {
    const group = element.dataset["toolControls"];
    const isActive = group === activeTool || (group === "internal" && isInternalTool(activeTool));
    element.hidden = !isActive;
    for (const control of element.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >("input, select, button")) {
      control.disabled = !isActive;
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-tool-presets]")) {
    const group = element.dataset["toolPresets"];
    element.hidden = group !== activeTool && !(group === "internal" && isInternalTool(activeTool));
  }
  if (activeTool === "tunnel") {
    requireElement<HTMLInputElement>("mode-rcsb").checked = true;
    setInputMode("rcsb");
    pdbIdInput.value = "1JJ2";
    biologicalUnitInput.checked = false;
    requireElement<HTMLInputElement>("big-probe").value = "10";
    requireElement<HTMLInputElement>("small-probe").value = "3";
    requireElement<HTMLInputElement>("trim-probe").value = "3";
    requireElement<HTMLSelectElement>("grid-size").value = "0.75";
  }
}

function syncToolRoute(): void {
  const tool = toolFromHash();
  if (tool === undefined) {
    showToolSelector();
    return;
  }
  activeTool = tool;
  clearCalculationState();
  configureToolForm();
  showPanel(setupPanel);
}

function setInputValue(id: string, value: string | undefined): void {
  if (value !== undefined) {
    requireElement<HTMLInputElement | HTMLSelectElement>(id).value = value;
  }
}

function applyPreset(button: HTMLButtonElement): void {
  const id = button.dataset["presetId"];
  if (id === undefined) {
    return;
  }
  requireElement<HTMLInputElement>("mode-rcsb").checked = true;
  setInputMode("rcsb");
  pdbIdInput.value = id;
  biologicalUnitInput.checked = false;
  requireElement<HTMLInputElement>("include-hetatm").checked = false;
  setInputValue("probe-radius", button.dataset["presetProbe"]);
  setInputValue("grid-size", button.dataset["presetGrid"]);
  setInputValue("minimum-probe", button.dataset["minimumProbe"]);
  setInputValue("maximum-probe", button.dataset["maximumProbe"]);
  setInputValue("probe-step", button.dataset["probeStep"]);
  setInputValue("big-probe", button.dataset["bigProbe"]);
  setInputValue("small-probe", button.dataset["smallProbe"]);
  setInputValue("trim-probe", button.dataset["trimProbe"]);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void startCalculation();
});

for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="input-mode"]')) {
  radio.addEventListener("change", () => setInputMode(radio.value as InputMode));
}

for (const preset of document.querySelectorAll<HTMLButtonElement>("[data-preset-id]")) {
  preset.addEventListener("click", () => applyPreset(preset));
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
showAllSurfacesButton.addEventListener("click", showAllSurfaceLayers);
isolateSurfaceButton.addEventListener("click", isolateSelectedSurface);
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
  clearDownloadUrls();
});

applyTheme(loadTheme());
setInputMode("rcsb");
syncToolRoute();
