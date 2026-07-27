export type InputMode = "rcsb" | "upload";

export type VolumeRequest = {
  pdbText: string;
  inputLabel: string;
  probe: number;
  gridSize: number;
  includeHetatm: boolean;
  excludeWater: boolean;
};

export type VolumeResult = {
  ok: true;
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
  probe: number;
  mrcBytes: number;
};

export type VolumeFailure = {
  ok: false;
  error: string;
};

export type WorkerRequest = {
  type: "calculate";
  request: VolumeRequest;
};

export type WorkerProgress = {
  type: "progress";
  message: string;
};

export type WorkerSuccess = {
  type: "result";
  result: VolumeResult;
  mrc: ArrayBuffer;
};

export type WorkerFailure = {
  type: "error";
  message: string;
};

export type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure;
