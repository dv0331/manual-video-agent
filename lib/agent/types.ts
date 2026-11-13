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

export type MotionSource = "sora" | "veo" | "kenburns" | "still";

export type CameraMotion =
  | "slow_left_to_right"
  | "slow_right_to_left"
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
  /** Manual step numbers this scene covers, as printed. Empty for intro or guide scenes. */
  steps?: number[];
  /** Name of the build when one manual holds several (e.g. "Rectangular table"). */
  build?: string;
  /** 1-based manual page with this scene's drawing, and its vertical span (0–1). */
  page?: number;
  crop?: { top: number; bottom: number };
  /** Seconds of spoken narration inside the clip. */
  speechSeconds?: number;
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
  /** Manual drawing the still was made from. */
  referencePath?: string;
  /** Per-scene motion clip; empty when the film holds one picture per scene. */
  clipPath: string;
  /** Finished 720p picture (photo plus labels) held for the whole scene in a still-frame film. */
  stillPath?: string;
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
  /** SHA-256 of the uploaded file; keys the saved-film library. */
  sourceHash?: string;
  /** Saved film this job was opened from, if it did not render. */
  filmId?: string;
  /** Wall-clock seconds per stage. */
  timings?: Partial<Record<"ingest" | "storyboard" | "scenes" | "stitch" | "total", number>>;
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
