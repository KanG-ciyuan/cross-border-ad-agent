import { describe, expect, it, vi } from "vitest";
import { createVideoGenerationProvider } from "../src/providers/video-generation";
import { MiniMaxProvider } from "../src/providers/minimax";
import { SeedanceProvider } from "../src/providers/seedance";

describe("video generation provider selection", () => {
  it("selects MiniMax H3 by default", () => {
    expect(createVideoGenerationProvider({ MINIMAX_API_KEY: "test-minimax-key" })).toBeInstanceOf(MiniMaxProvider);
  });

  it("passes the configured MiniMax base URL to the provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ task_id: "task-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createVideoGenerationProvider({
      MINIMAX_API_KEY: "test-minimax-key",
      MINIMAX_BASE_URL: "https://minimax-gateway.example.test/"
    });
    await provider.createTask({
      prompt: "Product shot",
      referenceImageUrls: [],
      durationSeconds: 5
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://minimax-gateway.example.test/v2/video_generation",
      expect.any(Object)
    );
    vi.unstubAllGlobals();
  });

  it("can switch to Seedance without changing workflow callers", () => {
    expect(createVideoGenerationProvider({
      VIDEO_GENERATION_PROVIDER: "seedance",
      ARK_API_KEY: "test-ark-key"
    })).toBeInstanceOf(SeedanceProvider);
  });

  it("fails closed when the selected provider key is absent", () => {
    expect(() => createVideoGenerationProvider({})).toThrowError("MINIMAX_NOT_CONFIGURED");
    expect(() => createVideoGenerationProvider({ VIDEO_GENERATION_PROVIDER: "seedance" }))
      .toThrowError("SEEDANCE_NOT_CONFIGURED");
  });
});
