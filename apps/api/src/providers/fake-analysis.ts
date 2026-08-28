import { AnalysisMapV1, EditPlanV1 } from "@ad-agent/contracts";
import type {
  AnalysisInput,
  AnalysisProvider,
  AnalysisResult,
  FullVideoAnalysisProvider,
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
    const clips = storyboard.length ? storyboard.map((shot, index) => ({
      id: `clp_shot${String(index + 1).padStart(4, "0")}`,
      sourceAssetId: shot.generatedAssetId,
      startMs: index * 2_000,
      endMs: (index + 1) * 2_000,
      origin: "generated" as const,
      transition: index === 0 ? "cut" as const : "crossfade" as const
    })) : input.assets.map((asset, index) => ({
      id: `clp_source${String(index + 1).padStart(4, "0")}`,
      sourceAssetId: asset.id,
      startMs: index * 3_000,
      endMs: (index + 1) * 3_000,
      origin: "uploaded" as const,
      transition: index === 0 ? "cut" as const : "crossfade" as const
    }));
    const durationSeconds = storyboard.length * 2 || input.assets.length * 3;
    const ratio = input.ratio ?? "9:16";
    const outputWidth = ratio === "16:9" ? 1920 : 1080;
    const outputHeight = ratio === "16:9" ? 1080 : 1920;
    const editPlan = EditPlanV1.parse({
      version: "edit_plan.v1",
      taskId: input.taskId,
      output: {
        width: outputWidth,
        height: outputHeight,
        fps: 30,
        language: "id-ID",
        ratio,
        durationSeconds
      },
      tracks: [{
        id: "trk_video001",
        type: "video",
        clips
      }],
      processing: {
        cropMode: "crop",
        muteOriginalAudio: input.muteOriginalAudio ?? false,
        captions: input.allowedOperations.includes("captions") ? "generate" : "none",
        voiceover: input.allowedOperations.includes("voiceover") ? "replace" : "none",
        music: input.allowedOperations.includes("music") ? "replace" : "none"
      },
      explanations: clips.map((clip) => ({
        clipId: clip.id,
        reason: clip.origin === "generated"
          ? "Demo storyboard shot selected for the planned sequence"
          : "Uploaded source selected for the planned sequence"
      })),
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
    const targetDurationMs = Math.round((input.targetDurationSeconds ?? 30) * 1_000);
    const clipCount = targetDurationMs === 30_000 ? 6 : Math.max(2, Math.ceil(targetDurationMs / 5_500));
    const clipDurationMs = targetDurationMs === 30_000 ? 5_208 : Math.round(targetDurationMs / clipCount);
    const sourceWindowMs = 15_000;
    const clips = Array.from({ length: clipCount }, (_, index) => {
      const asset = input.assets[index % input.assets.length]!;
      const sourcePass = Math.floor(index / input.assets.length);
      const startMs = sourcePass * sourceWindowMs;
      return {
        id: `clp_edit${String(index + 1).padStart(4, "0")}`,
        sourceAssetId: asset.id,
        startMs,
        endMs: startMs + clipDurationMs,
        origin: "uploaded" as const,
        transition: input.allowedOperations.includes("transitions") ? "crossfade" as const : "cut" as const
      };
    });
    const estimateFen = 300;
    const ratio = input.ratio ?? "9:16";
    const outputWidth = ratio === "16:9" ? 1920 : 1080;
    const outputHeight = ratio === "16:9" ? 1080 : 1920;
    const editPlan = EditPlanV1.parse({
      version: "edit_plan.v1",
      taskId: input.taskId,
      output: {
        width: outputWidth,
        height: outputHeight,
        fps: 30,
        language: "id-ID",
        ratio,
        durationSeconds: targetDurationMs / 1_000
      },
      tracks: [{ id: "trk_video001", type: "video", clips }],
      processing: {
        cropMode: "crop",
        muteOriginalAudio: input.muteOriginalAudio ?? false,
        captions: input.allowedOperations.includes("captions") ? "generate" : "none",
        voiceover: input.allowedOperations.includes("voiceover") ? "replace" : "none",
        music: input.allowedOperations.includes("music") ? "replace" : "none"
      },
      explanations: clips.map((clip) => ({
        clipId: clip.id,
        reason: "Uploaded source window selected for the demo edit timeline"
      })),
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

/** Explicit local/test fixture for the full-video analysis contract. */
export class FakeMediaAnalysisProvider implements FullVideoAnalysisProvider {
  readonly provider = "fake_media_analysis";

  async analyze(input: AnalysisInput) {
    const videoAssets = input.assets.filter((asset) => asset.kind === "source_video");
    for (const asset of videoAssets) {
      if (!Number.isInteger(asset.durationMs) || (asset.durationMs ?? 0) <= 0) {
        throw new Error("DEMO_ANALYSIS_DURATION_REQUIRED");
      }
    }
    return AnalysisMapV1.parse({
      version: "analysis_map.v1",
      taskId: input.taskId,
      segments: videoAssets.map((asset, index) => ({
        id: `seg_${input.taskId.slice(-8)}${String(index + 1).padStart(4, "0")}`,
        sourceAssetId: asset.id,
        startMs: 0,
        endMs: asset.durationMs!,
        valueLabel: "usable",
        confidence: 0.5,
        evidence: { vision: [{ startMs: 0, endMs: asset.durationMs!, label: "source_video", confidence: 0.5 }] },
        risks: []
      }))
    });
  }
}
