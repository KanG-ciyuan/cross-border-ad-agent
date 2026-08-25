import { describe, expect, it, vi } from "vitest";
import { MiniMaxProvider, MiniMaxProviderError } from "../src/providers/minimax";

describe("MiniMaxProvider", () => {
  it("rejects a non-HTTPS API base URL", () => {
    expect(() => new MiniMaxProvider({
      apiKey: "test-only-minimax-key",
      baseUrl: "http://api.minimaxi.com"
    })).toThrowError("MINIMAX_INVALID_BASE_URL");
  });

  it("creates an H3 reference-to-video task using the official V2 request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ task_id: "424010985738629" }));
    const provider = new MiniMaxProvider({
      apiKey: "test-only-minimax-key",
      fetch: fetchMock
    });

    await expect(provider.createTask({
      prompt: "Consistent kitchen-cleaner product shot for a TikTok ad",
      referenceImageUrls: ["https://media.example.test/front.jpg"],
      referenceVideoUrls: ["https://media.example.test/motion.mp4"],
      durationSeconds: 5
    })).resolves.toEqual({
      id: "424010985738629",
      model: "MiniMax-H3",
      status: "queued"
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.minimaxi.com/v2/video_generation");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-only-minimax-key");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "MiniMax-H3",
      content: [
        { type: "text", text: "Consistent kitchen-cleaner product shot for a TikTok ad" },
        {
          type: "image_url",
          image_url: { url: "https://media.example.test/front.jpg" },
          role: "reference_image"
        },
        {
          type: "video_url",
          video_url: { url: "https://media.example.test/motion.mp4" },
          role: "reference_video"
        }
      ],
      resolution: "768P",
      duration: 5,
      ratio: "9:16"
    });
  });

  it("queries and normalizes a succeeded H3 task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      task: {
        id: "424010985738629",
        model: "MiniMax-H3",
        status: "succeeded",
        content: { url: "https://media.example.test/output.mp4" },
        resolution: "2K",
        duration: 5,
        ratio: "9:16"
      }
    }));
    const provider = new MiniMaxProvider({ apiKey: "test-only-minimax-key", fetch: fetchMock });

    await expect(provider.getTask("424010985738629")).resolves.toEqual({
      id: "424010985738629",
      model: "MiniMax-H3",
      status: "succeeded",
      videoUrl: "https://media.example.test/output.mp4",
      durationSeconds: 5,
      ratio: "9:16",
      resolution: "2K"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.minimaxi.com/v2/query/video_generation/424010985738629",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("enforces H3 duration and reference-count limits before calling the API", async () => {
    const fetchMock = vi.fn();
    const provider = new MiniMaxProvider({ apiKey: "test-only-minimax-key", fetch: fetchMock });
    const tenImages = Array.from({ length: 10 }, (_, index) => `https://media.example.test/${index}.jpg`);

    await expect(provider.createTask({
      prompt: "Product shot",
      referenceImageUrls: [],
      durationSeconds: 3
    })).rejects.toMatchObject({ code: "INVALID_GENERATION_INPUT" });
    await expect(provider.createTask({
      prompt: "Product shot",
      referenceImageUrls: tenImages,
      durationSeconds: 5
    })).rejects.toMatchObject({ code: "MINIMAX_REFERENCE_LIMIT_EXCEEDED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps insufficient balance without exposing the API key or raw provider details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      type: "error",
      error: { type: "insufficient_balance_error", message: "private-provider-detail" }
    }, { status: 402 }));
    const provider = new MiniMaxProvider({ apiKey: "test-only-minimax-key", fetch: fetchMock });

    const failure = await provider.getTask("424010985738629").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MiniMaxProviderError);
    expect(failure).toMatchObject({ code: "MINIMAX_INSUFFICIENT_BALANCE", status: 402, retryable: false });
    expect(String(failure)).not.toContain("test-only-minimax-key");
    expect(String(failure)).not.toContain("private-provider-detail");
  });
});
