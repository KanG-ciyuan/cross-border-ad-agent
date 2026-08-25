import type { EditPlanV1, TaskGoal } from "@ad-agent/contracts";

export type ProviderAssetKind = "product_image" | "source_video";
export type ProviderOperation =
  | "trim" | "concat" | "captions" | "voiceover"
  | "stickers" | "transitions" | "music";

export interface AnalysisInput {
  taskId: string;
  goal: TaskGoal;
  market: "ID";
  platform: "tiktok";
  product?: {
    name: string;
    facts: readonly string[];
    approvedClaims: readonly string[];
  };
  assets: ReadonlyArray<{ id: string; kind: ProviderAssetKind }>;
  allowedOperations: readonly ProviderOperation[];
  referenceGeneration: ReadonlyArray<"three_view" | "nine_grid">;
  costLimitFen: number;
}

export interface ReferenceCandidate {
  assetId: string;
  view: "front" | "side" | "back";
  origin: "generated";
  provenance: {
    provider: string;
    sourceAssetIds: string[];
  };
}

export interface StoryboardShot {
  id: string;
  order: number;
  durationMs: number;
  visual: string;
  voiceover: string;
  generatedAssetId: string;
}

export interface AnalysisResult {
  language: "id-ID";
  script: string;
  references: ReferenceCandidate[];
  storyboard: StoryboardShot[];
  appliedOperations: ProviderOperation[];
  estimateFen: number;
  simulatedPosterAssetId: string;
  editPlan: EditPlanV1;
}

export interface RenderReceipt {
  id: string;
  provider: string;
  planHash: string;
  outputAssetId: string;
  completedAt: number;
}

export interface AnalysisProvider {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

export interface RenderProvider {
  render(plan: EditPlanV1): Promise<RenderReceipt>;
}

export interface VideoGenerationInput {
  prompt: string;
  referenceImageUrls: readonly string[];
  referenceVideoUrls?: readonly string[];
  durationSeconds: number;
  ratio?: "9:16" | "16:9" | "1:1";
  resolution?: "720p" | "1080p" | "768P" | "2K";
  generateAudio?: boolean;
}

export type VideoGenerationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled";

export interface VideoGenerationTask {
  id: string;
  model: string;
  status: VideoGenerationStatus;
  videoUrl?: string;
  errorCode?: string;
  durationSeconds?: number;
  ratio?: string;
  resolution?: string;
}

export interface VideoGenerationProvider {
  createTask(input: VideoGenerationInput): Promise<VideoGenerationTask>;
  getTask(taskId: string): Promise<VideoGenerationTask>;
}
