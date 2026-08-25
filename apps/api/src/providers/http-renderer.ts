import type { EditPlanV1 } from "@ad-agent/contracts";
import { hashEditPlan } from "./fake-renderer";
import type { RenderReceipt } from "./types";

export class HttpRendererError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "HttpRendererError";
  }
}

interface RenderSource {
  assetId: string;
  mimeType: string;
  filename: string;
  bytes: ArrayBuffer;
}

export class HttpRenderProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { baseUrl: string; fetch?: typeof fetch }) {
    const value = options.baseUrl.trim().replace(/\/$/, "");
    let url: URL;
    try { url = new URL(value); } catch { throw new HttpRendererError("RENDERER_INVALID_URL"); }
    const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) throw new HttpRendererError("RENDERER_INVALID_URL");
    this.baseUrl = value;
    this.fetcher = options.fetch ?? fetch;
  }

  async render(input: {
    plan: EditPlanV1;
    outputAssetId: string;
    title: string;
    caption: string;
    cta: string;
    sources: RenderSource[];
  }): Promise<{ receipt: RenderReceipt; bytes: ArrayBuffer }> {
    const sourceById = new Map(input.sources.map((source) => [source.assetId, source]));
    const videoTrack = input.plan.tracks.find((track) => track.type === "video");
    if (!videoTrack) throw new HttpRendererError("MATERIAL_REQUIRED");
    const form = new FormData();
    const clips = videoTrack.clips.map((clip, index) => {
      const source = sourceById.get(clip.assetId);
      if (!source) throw new HttpRendererError("MATERIAL_REQUIRED");
      const field = `clip_${index}`;
      form.append(field, new Blob([source.bytes], { type: source.mimeType }), source.filename);
      return { field, mimeType: source.mimeType, startMs: clip.startMs, endMs: clip.endMs };
    });
    form.set("manifest", JSON.stringify({
      output: input.plan.output,
      title: input.title,
      caption: input.caption,
      cta: input.cta,
      clips
    }));
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/render`, { method: "POST", body: form });
    } catch {
      throw new HttpRendererError("RENDERER_UNAVAILABLE");
    }
    if (!response.ok) throw new HttpRendererError("RENDERER_REJECTED");
    if (response.headers.get("Content-Type")?.split(";", 1)[0] !== "video/mp4") {
      throw new HttpRendererError("RENDERER_INVALID_RESPONSE");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 8) throw new HttpRendererError("RENDERER_INVALID_RESPONSE");
    const planHash = await hashEditPlan(input.plan);
    return {
      bytes,
      receipt: {
        id: `rcp_${crypto.randomUUID()}`,
        provider: "ffmpeg_renderer",
        planHash,
        outputAssetId: input.outputAssetId,
        completedAt: Date.now()
      }
    };
  }
}
