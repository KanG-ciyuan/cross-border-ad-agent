import { describe, expect, it } from "vitest";
import { InMemoryAgentHarness, type AgentSkill } from "../src/agent/harness";

describe("InMemoryAgentHarness", () => {
  it("runs a registered skill with a stable run id", async () => {
    const harness = new InMemoryAgentHarness();
    const skill: AgentSkill<{ imageAssetId: string }, { facts: string[] }> = {
      id: "product-facts",
      async run(input, context) {
        return { kind: "completed", runId: context.runId, output: { facts: [input.imageAssetId] } };
      }
    };
    harness.register(skill);

    const result = await harness.run("product-facts", { imageAssetId: "asset_1" }, "run_1");

    expect(result).toEqual({ kind: "completed", runId: "run_1", output: { facts: ["asset_1"] } });
  });

  it("preserves an approval checkpoint returned by a skill", async () => {
    const harness = new InMemoryAgentHarness();
    harness.register({
      id: "asset-candidates",
      async run(_input, context) {
        return { kind: "awaiting_approval", runId: context.runId, approvalKind: "reference", output: { candidateCount: 3 } };
      }
    });

    const result = await harness.run("asset-candidates", {}, "run_2");

    expect(result.kind).toBe("awaiting_approval");
    if (result.kind === "awaiting_approval") expect(result.approvalKind).toBe("reference");
  });
});
