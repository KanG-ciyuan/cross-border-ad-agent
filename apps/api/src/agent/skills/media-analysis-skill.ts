import type { AnalysisInput, FullVideoAnalysisProvider } from "../../providers/types";
import type { AgentSkill, SkillContext, SkillResult } from "../harness";

export class MediaAnalysisSkill implements AgentSkill<AnalysisInput, Awaited<ReturnType<FullVideoAnalysisProvider["analyze"]>>> {
  readonly id = "media-analysis";

  constructor(private readonly provider: FullVideoAnalysisProvider) {}

  async run(input: AnalysisInput, context: SkillContext): Promise<SkillResult<Awaited<ReturnType<FullVideoAnalysisProvider["analyze"]>>>> {
    const output = await this.provider.analyze(input);
    return { kind: "completed", runId: context.runId, output };
  }
}
