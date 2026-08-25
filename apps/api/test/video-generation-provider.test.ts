import { describe, expect, it } from "vitest";
import { createVideoGenerationProvider } from "../src/providers/video-generation";
import { MiniMaxProvider } from "../src/providers/minimax";
import { SeedanceProvider } from "../src/providers/seedance";

describe("video generation provider selection", () => {
  it("selects MiniMax H3 by default", () => {
    expect(createVideoGenerationProvider({ MINIMAX_API_KEY: "test-minimax-key" })).toBeInstanceOf(MiniMaxProvider);
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
