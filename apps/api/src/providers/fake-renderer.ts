import type { EditPlanV1 } from "@ad-agent/contracts";
import type { RenderProvider, RenderReceipt } from "./types";

export async function hashEditPlan(plan: EditPlanV1): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class FakeRenderProvider implements RenderProvider {
  async render(plan: EditPlanV1): Promise<RenderReceipt> {
    const planHash = await hashEditPlan(plan);
    return {
      id: `rcp_${planHash.slice(0, 16)}`,
      provider: "fake_renderer",
      planHash,
      outputAssetId: `ast_${planHash.slice(16, 32)}`,
      completedAt: 1_787_630_400_000
    };
  }
}
