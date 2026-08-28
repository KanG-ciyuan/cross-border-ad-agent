import type { ProductAnalysisV1 } from "@ad-agent/contracts";
import { describe, expect, it } from "vitest";
import { ProductImageAnalysisSkill } from "../src/agent/skills/product-image-analysis-skill";
import type { ProductVisionProvider } from "../src/providers/product-vision";

const analysis: ProductAnalysisV1 = {
  version: "product_analysis.v1",
  taskId: "tsk_12345678",
  sourceAssetId: "ast_12345678",
  quality: { score: 0.9, decision: "usable", issues: [] },
  factCandidates: [{
    field: "capacity", value: "500 ml", certainty: "observed",
    confidence: 0.95, evidence: "正面标签"
  }],
  immutableConstraints: ["保持包装颜色"],
  missingFacts: ["背标文字"],
  recommendation: { action: "use_original", reason: "正面主体和标签清晰" },
  requiresHumanConfirmation: true
};

describe("ProductImageAnalysisSkill", () => {
  it("returns provider findings as a product-facts approval checkpoint", async () => {
    const provider: ProductVisionProvider = {
      provider: "test-vision",
      analyze: async () => analysis
    };
    const skill = new ProductImageAnalysisSkill(provider);

    const result = await skill.run({
      taskId: "tsk_12345678",
      asset: { id: "ast_12345678", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      product: { name: "Kitchen Cleaner", suppliedFacts: ["500 ml"] }
    }, { runId: "run_product_1" });

    expect(result).toEqual({
      kind: "awaiting_approval",
      runId: "run_product_1",
      approvalKind: "product_facts",
      output: analysis
    });
  });
});
