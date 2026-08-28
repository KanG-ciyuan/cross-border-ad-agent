import { AnalysisMapV1, EditPlanV1, type EditPlanV1 as EditPlan } from "@ad-agent/contracts";
import type { AnalysisMapV1 as AnalysisMap } from "@ad-agent/contracts";

export interface AgentPlanRequirements {
  taskId: string;
  editInstructions: string;
  targetDurationSeconds: number;
  ratio: "9:16" | "16:9";
  mustUseClipIds?: readonly string[];
  productFacts?: readonly string[];
}

interface JsonGeneratorInput {
  instruction: string;
  context: {
    requirements: AgentPlanRequirements;
    targetDurationSeconds: number;
    ratio: AgentPlanRequirements["ratio"];
    analysisMap: AnalysisMap;
  };
}

export interface AgentPlanGenerator {
  generateJson(input: JsonGeneratorInput): Promise<unknown>;
}

export interface PlanRevision {
  plan: EditPlan;
  diff: {
    addedClipIds: string[];
    removedClipIds: string[];
    changedClipIds: string[];
    movedClipIds: string[];
    durationChanged: boolean;
    audioChanged: boolean;
    captionChanged: boolean;
  };
}

function compactInstruction(requirements: AgentPlanRequirements): string {
  return [
    "根据素材价值地图重新策划广告，不要按来源视频交替拼接。",
    `用户要求：${requirements.editInstructions}`,
    `目标时长：${requirements.targetDurationSeconds} 秒；画幅：${requirements.ratio}。`,
    requirements.mustUseClipIds?.length
      ? `必须保留素材区间：${requirements.mustUseClipIds.join(", ")}`
      : "没有额外必须使用的素材区间。",
    "只返回 edit_plan.v1 JSON；不得返回费用估算、任意命令或未在素材地图中的来源。"
  ].join("\n");
}

function validatePlan(plan: unknown, requirements: AgentPlanRequirements, analysisMap: AnalysisMap): EditPlan {
  const parsed = EditPlanV1.safeParse(plan);
  if (!parsed.success || parsed.data.taskId !== requirements.taskId ||
    parsed.data.output.ratio !== requirements.ratio ||
    Math.abs(parsed.data.output.durationSeconds - requirements.targetDurationSeconds) > 0.05) {
    throw new Error("AGENT_PLAN_INVALID");
  }

  const segments = new Map(analysisMap.segments.map((segment) => [segment.id, segment]));
  const sourceRanges = new Map<string, Array<{ startMs: number; endMs: number }>>();
  for (const segment of analysisMap.segments) {
    const ranges = sourceRanges.get(segment.sourceAssetId) ?? [];
    ranges.push({ startMs: segment.startMs, endMs: segment.endMs });
    sourceRanges.set(segment.sourceAssetId, ranges);
  }
  const used = new Set<string>();
  const usedClips = parsed.data.tracks.flatMap((track) => track.clips);
  for (const track of parsed.data.tracks) {
    for (const clip of track.clips) {
      const ranges = sourceRanges.get(clip.sourceAssetId);
      if (!ranges?.some((range) => clip.startMs >= range.startMs && clip.endMs <= range.endMs)) {
        throw new Error("AGENT_PLAN_INVALID");
      }
      used.add(clip.sourceAssetId);
      if (clip.id && segments.has(clip.id)) used.add(clip.id);
    }
  }
  for (const required of requirements.mustUseClipIds ?? []) {
    const requiredSegment = segments.get(required);
    if (!requiredSegment || !usedClips.some((clip) =>
      clip.sourceAssetId === requiredSegment.sourceAssetId &&
      clip.startMs <= requiredSegment.startMs && clip.endMs >= requiredSegment.endMs
    )) throw new Error("AGENT_PLAN_INVALID");
  }
  return parsed.data;
}

export class AgentEditPlanner {
  constructor(private readonly generator: AgentPlanGenerator) {}

  async plan(requirements: AgentPlanRequirements, analysisMapInput: AnalysisMap): Promise<EditPlan> {
    const analysisMap = AnalysisMapV1.parse(analysisMapInput);
    const generated = await this.generator.generateJson({
      instruction: compactInstruction(requirements),
      context: { requirements, targetDurationSeconds: requirements.targetDurationSeconds,
        ratio: requirements.ratio, analysisMap }
    });
    return validatePlan(generated, requirements, analysisMap);
  }

  async revisePlan(input: {
    currentPlan: EditPlan;
    userInstruction: string;
    analysisMap: AnalysisMap;
  }): Promise<PlanRevision> {
    const current = EditPlanV1.parse(input.currentPlan);
    const durationMatch = input.userInstruction.match(/(?:到|为|至|成)\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i);
    const requirements: AgentPlanRequirements = {
      taskId: current.taskId,
      editInstructions: input.userInstruction,
      targetDurationSeconds: durationMatch ? Number(durationMatch[1]) : current.output.durationSeconds,
      ratio: current.output.ratio
    };
    const next = await this.plan(requirements, input.analysisMap);
    const before = current.tracks.flatMap((track) => track.clips);
    const after = next.tracks.flatMap((track) => track.clips);
    const beforeById = new Map(before.map((clip) => [clip.id, clip]));
    const afterById = new Map(after.map((clip) => [clip.id, clip]));
    const addedClipIds = after.filter((clip) => !beforeById.has(clip.id)).map((clip) => clip.id);
    const removedClipIds = before.filter((clip) => !afterById.has(clip.id)).map((clip) => clip.id);
    const changedClipIds = after.filter((clip) => {
      const prior = beforeById.get(clip.id);
      return prior && (prior.startMs !== clip.startMs || prior.endMs !== clip.endMs || prior.sourceAssetId !== clip.sourceAssetId);
    }).map((clip) => clip.id);
    return {
      plan: next,
      diff: {
        addedClipIds,
        removedClipIds,
        changedClipIds,
        movedClipIds: changedClipIds,
        durationChanged: current.output.durationSeconds !== next.output.durationSeconds,
        audioChanged: current.processing.voiceover !== next.processing.voiceover || current.processing.music !== next.processing.music,
        captionChanged: current.processing.captions !== next.processing.captions
      }
    };
  }
}
