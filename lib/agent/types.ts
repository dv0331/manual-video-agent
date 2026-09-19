export type JobStatus = "queued" | "running" | "completed" | "failed";

export type AgentStage =
  | "queued"
  | "ingest"
  | "understand"
  | "plan"
  | "generate"
  | "evaluate"
  | "stitch"
  | "done";

export type MediaProviderName = "openai" | "gemini" | "demo";

export type StartFrameStrategy =
  | "human-assembly"
  | "manual-figure"
  | "generated-isometric";

export type MotionSource = "sora" | "veo" | "kenburns";

export type CameraMotion =
  | "slow_left_to_right"
  | "slow_zoom_in"
  | "slow_zoom_out"
  | "static";

export type FailureType = "visual" | "audio" | "none";

export interface Part {
  id: string;
  name: string;
  qty: number;
}

export interface AssemblyStep {
  index: number;
  title: string;
  instruction: string;
  figureRef?: string;
  fasteners: string[];
  tools: string[];
  warnings: string[];
  torque?: string;
  dependsOn?: number[];
}

export interface AssemblyGraph {
  title: string;
  documentId?: string;
  tools: string[];
  parts: Part[];
  steps: AssemblyStep[];
  notes: string[];
}

export interface Scene {
  id: string;
  index: number;
  title: string;
  narration: string;
  onScreenCallouts: string[];
  motionPrompt: string;
  framePrompt: string;
  startFrameStrategy: StartFrameStrategy;
  figurePath?: string;
  warnings: string[];
  allowedPartIds: string[];
  durationSeconds?: number;
  cameraMotion?: CameraMotion;
  voiceProfile?: string;
  soundEffects?: string;
  visualDescription?: string;
}

export interface EvaluationScores {
  similarity: number;
  promptAdherence: number;
  visualQuality: number;
  partIdentity: number;
  safetyCoverage: number;
  inventedParts: boolean;
  warningPresent: boolean;
  sequenceCorrect: boolean;
  temporalConsistency: number;
  passed: boolean;
  critique: string;
  failureType?: FailureType;
  narrationAlignment?: number;
  motionCoherence?: number;
  cheapGate?: number;
}

export interface SceneResult {
  scene: Scene;
  framePath: string;
  clipPath: string;
  attempts: number;
  evaluation: EvaluationScores;
  motionSource: MotionSource;
  durationSeconds: number;
}

export interface JobLog {
  at: string;
  message: string;
}

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  stage: AgentStage;
  stageLabel: string;
  progress: number;
  sourceName: string;
  sourceKind: "sample" | "upload";
  sampleId?: string;
  provider: MediaProviderName;
  error?: string;
  graph?: AssemblyGraph;
  scenes?: Scene[];
  sceneResults?: SceneResult[];
  videoPath?: string;
  vttPath?: string;
  captionsPath?: string;
  logs: JobLog[];
}

export interface IngestResult {
  pageImages: string[];
  figureImages: string[];
  text: string;
  pageTexts: string[];
}

export const MAX_SCENES = 8;
/** L5/L6: rewrite the prompt once, do not triple the stack. */
export const MAX_RETRIES = 1;
export const MAX_VIDEO_RETRIES = 1;
export const SCENE_SECONDS = 8;
