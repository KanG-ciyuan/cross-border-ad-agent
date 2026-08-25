import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../src/providers/fake-analysis";
import { FakeRenderProvider, hashEditPlan } from "../src/providers/fake-renderer";

const completeInput = {
  taskId: "tsk_fixture01",
  goal: "complete_creation" as const,
  market: "ID" as const,
  platform: "tiktok" as const,
  product: {
    name: "Pembersih Dapur 500ml",
    facts: ["500 ml", "Untuk noda minyak"],
    approvedClaims: ["Membantu membersihkan minyak"]
  },
  assets: [{ id: "ast_front001", kind: "product_image" as const }],
  allowedOperations: ["captions", "transitions"] as const,
  referenceGeneration: ["three_view", "nine_grid"] as const,
  costLimitFen: 20_000
};

describe("FakeAnalysisProvider", () => {
  it("returns byte-equivalent Indonesian kitchen-cleaner analysis for the same input", async () => {
    const provider = new FakeAnalysisProvider();

    const first = await provider.analyze(completeInput);
    const second = await provider.analyze(completeInput);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.language).toBe("id-ID");
    expect(first.script).toContain("Pembersih Dapur 500ml");
    expect(first.storyboard).toHaveLength(9);
    expect(first.editPlan.cost.currency).toBe("CNY");
  });

  it("keeps generated-reference provenance in metadata outside image bytes", async () => {
    const result = await new FakeAnalysisProvider().analyze(completeInput);

    expect(result.references).toHaveLength(3);
    for (const reference of result.references) {
      expect(reference).toMatchObject({
        origin: "generated",
        provenance: { sourceAssetIds: ["ast_front001"] }
      });
      expect(reference).not.toHaveProperty("bytes");
      expect(reference).not.toHaveProperty("embeddedLabel");
    }
  });

  it("uses only uploaded assets and allowed operations for edit-only plans", async () => {
    const result = await new FakeAnalysisProvider().analyze({
      taskId: "tsk_editonly1",
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      assets: [
        { id: "ast_video001", kind: "source_video" },
        { id: "ast_video002", kind: "source_video" }
      ],
      allowedOperations: ["trim", "concat", "captions"],
      referenceGeneration: [],
      costLimitFen: 5_000
    });

    expect(result.references).toEqual([]);
    expect(result.storyboard).toEqual([]);
    expect(result.editPlan.tracks.flatMap((track) => track.clips)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId: "ast_video001", origin: "uploaded" }),
        expect.objectContaining({ assetId: "ast_video002", origin: "uploaded" })
      ])
    );
    expect(JSON.stringify(result)).not.toContain('"origin":"generated"');
  });
});

describe("FakeRenderProvider", () => {
  it("returns a deterministic receipt tied to the exact edit_plan.v1 hash", async () => {
    const analysis = await new FakeAnalysisProvider().analyze(completeInput);
    const provider = new FakeRenderProvider();

    const receipt = await provider.render(analysis.editPlan);

    expect(receipt.planHash).toBe(await hashEditPlan(analysis.editPlan));
    expect(receipt.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await provider.render(analysis.editPlan)).toEqual(receipt);

    const changed = structuredClone(analysis.editPlan);
    changed.cost.estimatedFen += 1;
    expect(await hashEditPlan(changed)).not.toBe(receipt.planHash);
  });
});
