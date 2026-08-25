import { describe, expect, it, vi } from "vitest";
import { SeedanceProvider, SeedanceProviderError } from "../src/providers/seedance";

describe("SeedanceProvider", () => {
  it("creates a Seedance 2.5 TikTok task using the official Ark request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "cgt_test001" }, { status: 201 }));
    const provider = new SeedanceProvider({
      apiKey: "test-only-ark-key",
      fetch: fetchMock
    });

    await expect(provider.createTask({
      prompt: "Clean product hero shot with consistent packaging",
      referenceImageUrls: ["https://media.example.test/front.jpg"],
      durationSeconds: 5
    })).resolves.toEqual({
      id: "cgt_test001",
      model: "doubao-seedance-2-5-260628",
      status: "queued"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    expect(init).toMatchObject({ method: "POST" });
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-only-ark-key");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "doubao-seedance-2-5-260628",
      content: [
        { type: "text", text: "Clean product hero shot with consistent packaging" },
        {
          type: "image_url",
          image_url: { url: "https://media.example.test/front.jpg" },
          role: "reference_image"
        }
      ],
      duration: 5,
      ratio: "9:16",
      resolution: "720p",
      generate_audio: false,
      output_format: "mp4"
    });
  });

  it("queries and normalizes a succeeded generation task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      id: "cgt_test001",
      model: "doubao-seedance-2-5-260628",
      status: "succeeded",
      content: { video_url: "https://media.example.test/output.mp4" },
      duration: 5,
      ratio: "9:16",
      resolution: "720p"
    }));
    const provider = new SeedanceProvider({ apiKey: "test-only-ark-key", fetch: fetchMock });

    await expect(provider.getTask("cgt_test001")).resolves.toEqual({
      id: "cgt_test001",
      model: "doubao-seedance-2-5-260628",
      status: "succeeded",
      videoUrl: "https://media.example.test/output.mp4",
      durationSeconds: 5,
      ratio: "9:16",
      resolution: "720p"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt_test001",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("rejects unsafe reference URLs before making a provider request", async () => {
    const fetchMock = vi.fn();
    const provider = new SeedanceProvider({ apiKey: "test-only-ark-key", fetch: fetchMock });

    await expect(provider.createTask({
      prompt: "Product shot",
      referenceImageUrls: ["http://private.example.test/front.jpg"],
      durationSeconds: 5
    })).rejects.toMatchObject({ code: "INVALID_REFERENCE_URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps provider failures without exposing key or raw response content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      error: { code: "AuthenticationError", message: "leaked-provider-detail" }
    }, { status: 401 }));
    const provider = new SeedanceProvider({ apiKey: "test-only-ark-key", fetch: fetchMock });

    const failure = await provider.getTask("cgt_test001").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SeedanceProviderError);
    expect(failure).toMatchObject({ code: "SEEDANCE_AUTHENTICATION_FAILED", status: 401, retryable: false });
    expect(String(failure)).not.toContain("test-only-ark-key");
    expect(String(failure)).not.toContain("leaked-provider-detail");
  });
});
