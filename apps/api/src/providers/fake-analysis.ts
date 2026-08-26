import { EditPlanV1 } from "@ad-agent/contracts";
import type {
  AnalysisInput,
  AnalysisProvider,
  AnalysisResult,
  StoryboardShot
} from "./types";

const shotBlueprints = [
  ["Kompor berminyak sebelum dibersihkan", "Noda minyak bikin dapur terlihat kusam?"],
  ["Produk tampil jelas dengan label 500 ml", "Kenalkan Pembersih Dapur 500ml."],
  ["Semprotan diarahkan ke noda minyak", "Cukup semprotkan pada area yang kotor."],
  ["Busa bekerja di permukaan kompor", "Formulanya membantu mengangkat minyak."],
  ["Kain mengelap permukaan satu arah", "Lalu lap dengan kain bersih."],
  ["Perbandingan sebelum dan sesudah", "Permukaan tampak lebih bersih tanpa langkah rumit."],
  ["Produk digunakan pada meja dapur", "Praktis untuk rutinitas bersih-bersih harian."],
  ["Produk dan kapasitas kembali terlihat", "Isi 500 ml, siap digunakan saat dibutuhkan."],
  ["Produk di dapur bersih dengan ajakan", "Coba sekarang untuk dapur yang lebih nyaman."]
] as const;

function buildStoryboard(): StoryboardShot[] {
  return shotBlueprints.map(([visual, voiceover], index) => ({
    id: `shot_${String(index + 1).padStart(4, "0")}`,
    order: index + 1,
    durationMs: 2_000,
    visual,
    voiceover,
    generatedAssetId: `ast_gen${String(index + 1).padStart(5, "0")}`
  }));
}

export class FakeAnalysisProvider implements AnalysisProvider {
  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    if (input.goal === "edit_only") return this.editOnly(input);

    const storyboard = input.referenceGeneration.includes("nine_grid") ? buildStoryboard() : [];
    const productName = input.product?.name ?? "Pembersih Dapur";
    const script = storyboard.map((shot) => shot.voiceover).join(" ").replace(
      "Pembersih Dapur 500ml",
      productName
    );
    const sourceAssetIds = input.assets.map((asset) => asset.id);
    const references = input.referenceGeneration.includes("three_view")
      ? (["front", "side", "back"] as const).map((view, index) => ({
          assetId: `ast_ref${String(index + 1).padStart(5, "0")}`,
          view,
          origin: "generated" as const,
          provenance: { provider: "fake_analysis", sourceAssetIds }
        }))
      : [];
    const estimateFen = 1_800;
    const editPlan = EditPlanV1.parse({
      version: "edit_plan.v1",
      taskId: input.taskId,
      output: { width: 1080, height: 1920, fps: 30, language: "id-ID" },
      tracks: [{
        id: "trk_video001",
        type: "video",
        clips: (storyboard.length ? storyboard.map((shot, index) => ({
          id: `clp_shot${String(index + 1).padStart(4, "0")}`,
          assetId: shot.generatedAssetId,
          startMs: index * 2_000,
          endMs: (index + 1) * 2_000,
          origin: "generated",
          transition: index === 0 ? "cut" : "crossfade"
        })) : input.assets.map((asset, index) => ({
          id: `clp_source${String(index + 1).padStart(4, "0")}`,
          assetId: asset.id,
          startMs: index * 3_000,
          endMs: (index + 1) * 3_000,
          origin: "uploaded" as const,
          transition: index === 0 ? "cut" as const : "crossfade" as const
        })))
      }],
      cost: { currency: "CNY", estimatedFen: estimateFen, limitFen: input.costLimitFen },
      approvals: []
    });

    return {
      language: "id-ID",
      script,
      references,
      storyboard,
      appliedOperations: [...input.allowedOperations],
      estimateFen,
      simulatedPosterAssetId: "ast_poster001",
      editPlan
    };
  }

  private editOnly(input: AnalysisInput): AnalysisResult {
    const clipDurationMs = 5_208;
    const sourceWindowMs = 15_000;
    const clipCount = 6;
    const clips = Array.from({ length: clipCount }, (_, index) => {
      const asset = input.assets[index % input.assets.length]!;
      const sourcePass = Math.floor(index / input.assets.length);
      const startMs = sourcePass * sourceWindowMs;
      return {
        id: `clp_edit${String(index + 1).padStart(4, "0")}`,
        assetId: asset.id,
        startMs,
        endMs: startMs + clipDurationMs,
        origin: "uploaded" as const,
        transition: input.allowedOperations.includes("transitions") ? "crossfade" as const : "cut" as const
      };
    });
    const estimateFen = 300;
    const editPlan = EditPlanV1.parse({
      version: "edit_plan.v1",
      taskId: input.taskId,
      output: { width: 1080, height: 1920, fps: 30, language: "id-ID" },
      tracks: [{ id: "trk_video001", type: "video", clips }],
      cost: { currency: "CNY", estimatedFen: estimateFen, limitFen: input.costLimitFen },
      approvals: []
    });
    return {
      language: "id-ID",
      script: "",
      references: [],
      storyboard: [],
      appliedOperations: [...input.allowedOperations],
      estimateFen,
      simulatedPosterAssetId: "ast_poster001",
      editPlan
    };
  }
}
