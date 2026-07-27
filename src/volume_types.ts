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

type GridResult = {
  ok: true;
  tool: ToolId;
  atomCount: number;
  voxelCount: number;
  totalGridVoxels: number;
  volume: number;
  surfaceArea: number;
  sphericity: number;
  effectiveRadius: number;
  center: { x: number; y: number; z: number };
  dimensions: { x: number; y: number; z: number };
  origin: { x: number; y: number; z: number };
  gridSize: number;
  mrcBytes: number;
  previewBinFactor: 1 | 2;
  previewIsolevel: number;
  previewGridSize: number;
  previewDimensions: { x: number; y: number; z: number };
  previewOrigin: { x: number; y: number; z: number };
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
  voxelCount: number;
  totalGridVoxels: number;
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
  origin: { x: number; y: number; z: number };
  dimensions: { x: number; y: number; z: number };
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
  previewMrc: ArrayBuffer;
};

export type WorkerFailure = {
  type: "error";
  message: string;
};

export type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure;
