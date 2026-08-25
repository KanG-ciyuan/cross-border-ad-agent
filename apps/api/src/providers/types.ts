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
