import { describe, expect, it, vi } from "vitest";
import { EditPlanV1, type AnalysisMapV1 } from "@ad-agent/contracts";
import { AgentEditPlanner } from "../src/providers/agent-edit-planner";

const analysisMap: AnalysisMapV1 = {
  version: "analysis_map.v1",
  taskId: "tsk_planner01",
  segments: [
    { id: "seg_product001", sourceAssetId: "ast_video001", startMs: 0, endMs: 4_000,
      valueLabel: "high", confidence: 0.94, risks: [] },
    { id: "seg_action0001", sourceAssetId: "ast_video002", startMs: 5_000, endMs: 11_000,
      valueLabel: "usable", confidence: 0.82, risks: [] }
  ]
};

const requirements = {
  taskId: "tsk_planner01",
  editInstructions: "做成印尼 TikTok 广告，前 3 秒突出产品",
  targetDurationSeconds: 10,
  ratio: "16:9" as const,
  mustUseClipIds: ["seg_product001"],
  productFacts: ["500 ml"]
};

const plan = EditPlanV1.parse({
  version: "edit_plan.v1",
  taskId: "tsk_planner01",
  output: { width: 1280, height: 720, fps: 30, language: "id-ID", ratio: "16:9", durationSeconds: 10 },
  tracks: [{ id: "trk_video001", type: "video", clips: [
    { id: "clp_product001", sourceAssetId: "ast_video001", startMs: 0, endMs: 4_000, origin: "uploaded", transition: "cut" },
    { id: "clp_action0001", sourceAssetId: "ast_video002", startMs: 5_000, endMs: 11_000, origin: "uploaded", transition: "crossfade" }
  ] }],
  processing: { cropMode: "contain", muteOriginalAudio: true, captions: "generate", voiceover: "replace", music: "replace" },
  explanations: [
    { clipId: "clp_product001", reason: "开头展示产品" },
    { clipId: "clp_action0001", reason: "展示使用动作" }
  ],
  approvals: []
});

describe("AgentEditPlanner", () => {
  it("plans from natural-language requirements and preserves must-use segments", async () => {
    const generateJson = vi.fn().mockResolvedValue(plan);
    const result = await new AgentEditPlanner({ generateJson }).plan(requirements, analysisMap);

    expect(generateJson).toHaveBeenCalledWith(expect.objectContaining({
      instruction: expect.stringContaining("前 3 秒突出产品"),
      context: expect.objectContaining({ targetDurationSeconds: 10, ratio: "16:9" })
    }));
    expect(result.output.ratio).toBe("16:9");
    expect(result.tracks[0]?.clips).toHaveLength(2);
  });

  it("rejects source windows outside the analysis map", async () => {
    const invalid = structuredClone(plan);
    invalid.tracks[0]!.clips[1]!.endMs = 20_000;
    const planner = new AgentEditPlanner({ generateJson: vi.fn().mockResolvedValue(invalid) });

    await expect(planner.plan(requirements, analysisMap)).rejects.toThrow("AGENT_PLAN_INVALID");
  });

  it("creates a new immutable plan and a readable revision diff", async () => {
    const revised = structuredClone(plan);
    revised.output.durationSeconds = 8;
    revised.tracks[0]!.clips[1]!.endMs = 9_000;
    const planner = new AgentEditPlanner({ generateJson: vi.fn().mockResolvedValue(revised) });

    const result = await planner.revisePlan({
      currentPlan: plan,
      userInstruction: "缩短到 8 秒",
      analysisMap
    });

    expect(plan.output.durationSeconds).toBe(10);
    expect(result.plan.output.durationSeconds).toBe(8);
    expect(result.diff.durationChanged).toBe(true);
    expect(result.diff.changedClipIds).toContain("clp_action0001");
  });
});
