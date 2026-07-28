export type InputMode = "rcsb" | "upload";

export type ToolId =
  "volume" | "volume-range" | "channel-finder" | "channel" | "solvent" | "tunnel";

type BaseRequest = {
  tool: ToolId;
  pdbText: string;
  inputLabel: string;
  gridSize: number;
  includeHetatm: boolean;
  excludeWater: boolean;
};

export type VolumeRequest = BaseRequest & {
  tool: "volume";
  probe: number;
  fillInternalCavities: boolean;
};

export type VolumeRangeRequest = BaseRequest & {
  tool: "volume-range";
  minimumProbe: number;
  maximumProbe: number;
  probeStep: number;
};

type DualProbeRequest = BaseRequest & {
  bigProbe: number;
  smallProbe: number;
  trimProbe: number;
};

export type SolventRequest = DualProbeRequest & {
  tool: "solvent";
};

export type ChannelRequest = DualProbeRequest & {
  tool: "channel";
  coordinate: { x: number; y: number; z: number };
};

export type ChannelFilter =
  | { mode: "largest"; value: number }
  | { mode: "minimum-volume"; value: number }
  | { mode: "minimum-percent"; value: number };

export type ChannelFinderRequest = DualProbeRequest & {
  tool: "channel-finder";
  filter: ChannelFilter;
};

export type TunnelRequest = DualProbeRequest & {
  tool: "tunnel";
};

export type InternalRequest =
  SolventRequest | ChannelRequest | ChannelFinderRequest | TunnelRequest;

export type CalculationRequest = VolumeRequest | VolumeRangeRequest | InternalRequest;

export type CartesianCoordinate = {
  x: number;
  y: number;
  z: number;
};

export type GridDimensions = {
  x: number;
  y: number;
  z: number;
};

export type GridResult = {
  ok: true;
  tool: ToolId;
  atomCount: number;
  voxelCount: number;
  totalGridVoxels: number;
  volume: number;
  surfaceArea: number;
  sphericity: number;
  effectiveRadius: number;
  center: CartesianCoordinate;
  dimensions: GridDimensions;
  origin: CartesianCoordinate;
  gridSize: number;
  mrcBytes: number;
  previewBinFactor: 1 | 2;
  previewIsolevel: number;
  previewGridSize: number;
  previewDimensions: GridDimensions;
  previewOrigin: CartesianCoordinate;
  previewMrcBytes: number;
};

export type VolumeResult = GridResult & {
  tool: "volume";
  probe: number;
  fillInternalCavities: boolean;
  cavityVoxelsFilled: number;
};

export type VolumeRangePoint = {
  probe: number;
  volume: number;
  surfaceArea: number;
  sphericity: number;
  effectiveRadius: number;
  center: CartesianCoordinate;
  voxelCount: number;
  totalGridVoxels: number;
  dimensions: GridDimensions;
  origin: CartesianCoordinate;
};

export type VolumeRangeResult = GridResult & {
  tool: "volume-range";
  representativeProbe: number;
  minimumProbe: number;
  maximumProbe: number;
  probeStep: number;
  points: VolumeRangePoint[];
};

type InternalResult = GridResult & {
  tool: "solvent" | "channel" | "channel-finder" | "tunnel";
  bigProbe: number;
  smallProbe: number;
  trimProbe: number;
  accessibleVoxelCount: number;
  accessibleVolume: number;
};

export type SolventResult = InternalResult & {
  tool: "solvent";
};

export type ChannelResult = InternalResult & {
  tool: "channel";
  coordinate: { x: number; y: number; z: number };
};

export type ChannelComponent = {
  rank: number;
  accessibleVoxelCount: number;
  voxelCount: number;
  volume: number;
  surfaceArea: number;
  sphericity: number;
  effectiveRadius: number;
  center: CartesianCoordinate;
  extractionCoordinate: CartesianCoordinate;
  mrcOffset: number;
  mrcBytes: number;
  mrcDimensions: GridDimensions;
  mrcOrigin: CartesianCoordinate;
};

export type ChannelFinderResult = InternalResult & {
  tool: "channel-finder";
  totalComponentCount: number;
  matchedComponentCount: number;
  selectedComponentCount: number;
  components: ChannelComponent[];
};

export type TunnelResult = InternalResult & {
  tool: "tunnel";
  candidateVoxelCount: number;
  candidateVolume: number;
  accessiblePercent: number;
};

export type CalculationResult =
  | VolumeResult
  | VolumeRangeResult
  | SolventResult
  | ChannelResult
  | ChannelFinderResult
  | TunnelResult;

export type MrcPreview = {
  mrc: ArrayBuffer;
  binFactor: 1 | 2;
  isolevel: number;
  spacing: number;
  origin: CartesianCoordinate;
  dimensions: GridDimensions;
};

export type ViewerSurfaceKind = "result" | "probe" | "channel" | "channel-union";

export type ViewerSurface = MrcPreview & {
  id: string;
  label: string;
  kind: ViewerSurfaceKind;
  value: number;
  downloadMrc: ArrayBuffer;
  initiallyVisible: boolean;
};

export type CalculationFailure = {
  ok: false;
  error: string;
};

export type WorkerRequest = {
  type: "calculate";
  request: CalculationRequest;
};

export type WorkerProgress = {
  type: "progress";
  message: string;
};

export type WorkerSuccess = {
  type: "result";
  result: CalculationResult;
  mrc: ArrayBuffer;
  viewerSurfaces: ViewerSurface[];
};

export type WorkerFailure = {
  type: "error";
  message: string;
};

export type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure;
