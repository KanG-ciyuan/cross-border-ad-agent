import type { ProductAnalysisV1 } from "@ad-agent/contracts";
import type { ProductVisionInput, ProductVisionProvider } from "../../providers/product-vision";
import type { AgentSkill, SkillContext, SkillResult } from "../harness";

export class ProductImageAnalysisSkill implements AgentSkill<ProductVisionInput, ProductAnalysisV1> {
  readonly id = "product-image-analysis";

  constructor(private readonly provider: ProductVisionProvider) {}

  async run(input: ProductVisionInput, context: SkillContext): Promise<SkillResult<ProductAnalysisV1>> {
    const output = await this.provider.analyze(input);
    return {
      kind: "awaiting_approval",
      runId: context.runId,
      approvalKind: "product_facts",
      output
    };
  }
}
