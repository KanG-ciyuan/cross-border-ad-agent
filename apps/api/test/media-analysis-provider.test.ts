import { describe, expect, it, vi } from "vitest";
import {
  MediaAnalysisProvider,
  type AnalysisAdapters
} from "../src/providers/media-analysis";
import { createAnalysisProvider } from "../src/providers/provider-factory";
import { FakeMediaAnalysisProvider } from "../src/providers/fake-analysis";

const input = {
  taskId: "tsk_analysis01",
  goal: "edit_only" as const,
  market: "ID" as const,
  platform: "tiktok" as const,
  assets: [
    { id: "ast_video001", kind: "source_video" as const },
    { id: "ast_video002", kind: "source_video" as const }
  ],
  allowedOperations: ["trim", "concat", "captions"] as const,
  referenceGeneration: [] as const,
  costLimitFen: 5_000
};

describe("MediaAnalysisProvider", () => {
  it("builds a full-video value map from injected probe, ASR, OCR and multimodal adapters", async () => {
    const adapters: AnalysisAdapters = {
      probe: {
        probe: vi.fn(async ({ asset }) => asset.id === "ast_video001"
          ? { durationMs: 4_000, changePoints: [{ atMs: 2_000, kind: "product" as const }] }
          : { durationMs: 3_000, boundariesMs: [1_000] })
      },
      asr: {
        transcribe: vi.fn(async ({ asset }) => asset.id === "ast_video001"
          ? [{ startMs: 250, endMs: 900, text: "Bersihkan kompor", confidence: 0.42 }]
          : [])
      },
      ocr: {
        detect: vi.fn(async ({ asset }) => asset.id === "ast_video002"
          ? [{ startMs: 1_100, endMs: 1_700, text: "500 ml", confidence: 0.91 }]
          : [])
      },
      multimodal: {
        interpret: vi.fn(async ({ segment }) => segment.sourceAssetId === "ast_video002"
          ? { labels: [{ label: "product_use", confidence: 0.88 }], risks: [{ kind: "watermark" as const, severity: "medium" as const, description: "Logo visible", confidence: 0.38 }] }
          : { labels: [{ label: "before_after", confidence: 0.8 }], risks: [] })
      }
    };

    const result = await new MediaAnalysisProvider(adapters).analyze(input);

    expect(result.version).toBe("analysis_map.v1");
    expect(result.segments.every((segment) => segment.startMs < segment.endMs)).toBe(true);
    for (const [assetId, durationMs] of [["ast_video001", 4_000], ["ast_video002", 3_000]] as const) {
      const segments = result.segments.filter((segment) => segment.sourceAssetId === assetId);
      expect(segments[0]?.startMs).toBe(0);
      expect(segments.at(-1)?.endMs).toBe(durationMs);
    }
    expect(result.segments.some((segment) => segment.evidence?.asr?.some((item) => item.confidence === 0.42))).toBe(true);
    expect(result.segments.some((segment) => segment.risks.some((risk) => risk.kind === "watermark"))).toBe(true);
    expect(result.segments.some((segment) => segment.valueLabel === "risk")).toBe(true);
    expect(adapters.probe.probe).toHaveBeenCalledTimes(2);
    expect(adapters.ocr.detect).toHaveBeenCalledWith(expect.objectContaining({
      asset: expect.objectContaining({ id: "ast_video001" }),
      keyframesMs: expect.arrayContaining([1_750, 2_000, 2_250])
    }));
    expect(adapters.ocr.detect).toHaveBeenCalledWith(expect.objectContaining({
      asset: expect.objectContaining({ id: "ast_video002" }),
      keyframesMs: expect.arrayContaining([750, 1_000, 1_250])
    }));
    expect(adapters.multimodal.interpret).toHaveBeenCalledWith({
      segment: { sourceAssetId: "ast_video001", startMs: 0, endMs: 2_000 },
      keyframesMs: [1_750, 2_000]
    });
  });

  it("maps adapter failures to a stable error without leaking provider details", async () => {
    const secret = "provider-secret-response";
    const adapters: AnalysisAdapters = {
      probe: { probe: vi.fn().mockRejectedValue(new Error(secret)) },
      asr: { transcribe: vi.fn() },
      ocr: { detect: vi.fn() },
      multimodal: { interpret: vi.fn() }
    };

    const failure = await new MediaAnalysisProvider(adapters).analyze(input).catch((error: unknown) => error);

    expect(String(failure)).toContain("MEDIA_ANALYSIS_FAILED");
    expect(String(failure)).not.toContain(secret);
  });
});

describe("analysis provider factory", () => {
  it("uses fake analysis only when demo mode is explicit and never invokes external adapters", async () => {
    const probe = vi.fn();
    const provider = createAnalysisProvider({ ANALYSIS_PROVIDER: "demo", APP_ENV: "test" }, {
      probe: { probe },
      asr: { transcribe: vi.fn() },
      ocr: { detect: vi.fn() },
      multimodal: { interpret: vi.fn() }
    });

    expect(provider).toBeInstanceOf(FakeMediaAnalysisProvider);
    await expect(provider.analyze({
      ...input,
      assets: input.assets.map((asset) => ({ ...asset, durationMs: 2_000 }))
    })).resolves.toMatchObject({ version: "analysis_map.v1" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("uses explicit demo fixture durations to cover every source video", async () => {
    const provider = createAnalysisProvider({ ANALYSIS_PROVIDER: "demo", APP_ENV: "test" });
    const result = await provider.analyze({
      ...input,
      assets: [
        { id: "ast_video001", kind: "source_video", durationMs: 4_000 },
        { id: "ast_video002", kind: "source_video", durationMs: 3_000 }
      ]
    });

    expect(result.segments.filter((segment) => segment.sourceAssetId === "ast_video001").at(-1)?.endMs).toBe(4_000);
    expect(result.segments.filter((segment) => segment.sourceAssetId === "ast_video002").at(-1)?.endMs).toBe(3_000);
  });

  it("fails explicitly when demo fixture video duration is missing", async () => {
    const provider = createAnalysisProvider({ ANALYSIS_PROVIDER: "demo", APP_ENV: "test" });

    await expect(provider.analyze(input)).rejects.toThrowError("DEMO_ANALYSIS_DURATION_REQUIRED");
  });

  it("fails closed for production without real analysis configuration and does not expose keys", () => {
    const secret = "analysis-secret-do-not-leak";

    expect(() => createAnalysisProvider({
      APP_ENV: "production",
      ANALYSIS_PROVIDER: "media",
      ANALYSIS_API_KEY: secret
    })).toThrowError("ANALYSIS_NOT_CONFIGURED");
    try {
      createAnalysisProvider({ APP_ENV: "production", ANALYSIS_PROVIDER: "media", ANALYSIS_API_KEY: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
