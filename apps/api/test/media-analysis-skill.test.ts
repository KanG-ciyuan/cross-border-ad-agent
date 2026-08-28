import { describe, expect, it } from "vitest";
import { MediaAnalysisSkill } from "../src/agent/skills/media-analysis-skill";
import type { AnalysisInput, FullVideoAnalysisProvider } from "../src/providers/types";

const input: AnalysisInput = {
  taskId: "tsk_1", goal: "edit_only", market: "ID", platform: "tiktok", assets: [{ id: "asset_1", kind: "source_video" }],
  allowedOperations: ["trim"], referenceGeneration: [], costLimitFen: 1000
};

describe("MediaAnalysisSkill", () => {
  it("delegates analysis to the configured provider and returns its map", async () => {
    const analysis = { version: "analysis_map.v1", taskId: input.taskId, segments: [] } as never;
    const provider: FullVideoAnalysisProvider = { provider: "test_provider", analyze: async () => analysis };
    const skill = new MediaAnalysisSkill(provider);

    const result = await skill.run(input, { runId: "run_1" });

    expect(result).toEqual({ kind: "completed", runId: "run_1", output: analysis });
  });
});
