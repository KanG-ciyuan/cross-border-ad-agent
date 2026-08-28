import { describe, expect, it } from "vitest";
import { OpenAICompatibleProductVisionProvider } from "../src/providers/openai-compatible-product-vision";

const input = {
  taskId: "tsk_12345678",
  asset: {
    id: "ast_12345678",
    mimeType: "image/png" as const,
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  },
  product: { name: "Kitchen Cleaner", suppliedFacts: ["500 ml"] }
};

const modelOutput = {
  quality: { score: 0.8, decision: "usable_with_enhancement", issues: [] },
  factCandidates: [{
    field: "capacity", value: "500 ml", certainty: "observed",
    confidence: 0.95, evidence: "正面标签"
  }],
  immutableConstraints: ["保持白绿瓶身"],
  missingFacts: ["背标文字"],
  recommendation: { action: "enhance", reason: "包装小字需要增强" }
};

describe("OpenAICompatibleProductVisionProvider", () => {
  it("uses the Responses API to send the product image and returns a validated approval candidate", async () => {
    let request: Request | undefined;
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          id: "resp_test",
          object: "response",
          created: 1,
          model: "vision-model",
          output: [{
            id: "msg_test",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{
              type: "output_text",
              annotations: [],
              text: JSON.stringify(modelOutput)
            }]
          }],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
        });
      }
    });

    const result = await provider.analyze(input);

    expect(result).toMatchObject({
      version: "product_analysis.v1",
      taskId: "tsk_12345678",
      sourceAssetId: "ast_12345678",
      requiresHumanConfirmation: true,
      recommendation: { action: "enhance" }
    });
    expect(request?.url).toBe("https://gateway.example.test/v1/responses");
    expect(request?.headers.get("Authorization")).toBe("Bearer test-secret-key");
    const body = await request?.clone().json() as {
      model: string;
      input: Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
    };
    expect(body.model).toBe("vision-model");
    expect(body.input[1]?.content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,iVBORw==",
      detail: "high"
    });
    expect(body.input[0]?.content[0]?.text).toContain("usable_with_enhancement");
    expect(body.input[0]?.content[0]?.text).toContain("request_more_images");
    expect(body.input[0]?.content[0]?.text).toContain("label_legibility");
  });

  it("maps provider failures to an error that never contains the API key", async () => {
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "do-not-leak-this",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async () => new Response("upstream included do-not-leak-this", { status: 500 })
    });

    await expect(provider.analyze(input)).rejects.toThrow(
      "PRODUCT_VISION_UPSTREAM_RESPONSES_500_CHAT_500"
    );
    await provider.analyze(input).catch((error: Error) => {
      expect(error.message).not.toContain("do-not-leak-this");
    });
  });

  it("falls back to Chat Completions when the relay does not support Responses", async () => {
    const requests: Request[] = [];
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async (requestInput, init) => {
        const request = new Request(requestInput, init);
        requests.push(request);
        if (request.url.endsWith("/responses")) {
          return Response.json({ error: { message: "unsupported endpoint" } }, { status: 404 });
        }
        return Response.json({
          id: "chatcmpl_test",
          choices: [{ message: { role: "assistant", content: JSON.stringify(modelOutput) } }]
        });
      }
    });

    const result = await provider.analyze(input);

    expect(result.recommendation.action).toBe("enhance");
    expect(requests.map(({ url }) => url)).toEqual([
      "https://gateway.example.test/v1/responses",
      "https://gateway.example.test/v1/chat/completions"
    ]);
    const fallbackBody = await requests[1]?.clone().json() as {
      messages: Array<{ content: string | Array<{ type: string; image_url?: { url: string } }> }>;
      response_format: {
        type: string;
        json_schema?: { name: string; strict: boolean; schema: { properties?: Record<string, unknown> } };
      };
    };
    expect(fallbackBody.messages[1]?.content).toContainEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,iVBORw==", detail: "high" }
    });
    expect(fallbackBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "product_analysis",
        strict: true,
        schema: { properties: { quality: expect.any(Object), factCandidates: expect.any(Object) } }
      }
    });
  });

  it("falls back to Chat Completions when the Responses connection is reset", async () => {
    const requests: string[] = [];
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async (requestInput) => {
        const url = String(requestInput);
        requests.push(url);
        if (url.endsWith("/responses")) throw new TypeError("connection reset");
        return Response.json({
          choices: [{ message: { role: "assistant", content: JSON.stringify(modelOutput) } }]
        });
      }
    });

    await expect(provider.analyze(input)).resolves.toMatchObject({
      recommendation: { action: "enhance" }
    });
    expect(requests).toEqual([
      "https://gateway.example.test/v1/responses",
      "https://gateway.example.test/v1/chat/completions"
    ]);
  });

  it("accepts chat content returned as an array of text parts", async () => {
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async (requestInput) => String(requestInput).endsWith("/responses")
        ? new Response(null, { status: 404 })
        : Response.json({ choices: [{ message: { content: [
          { type: "text", text: JSON.stringify(modelOutput) }
        ] } }] })
    });

    await expect(provider.analyze(input)).resolves.toMatchObject({
      recommendation: { action: "enhance" }
    });
  });

  it("reports invalid JSON separately from schema validation", async () => {
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async (requestInput) => String(requestInput).endsWith("/responses")
        ? new Response(null, { status: 404 })
        : Response.json({ choices: [{ message: { content: "not-json" } }] })
    });

    await expect(provider.analyze(input)).rejects.toThrow("PRODUCT_VISION_JSON_INVALID");
  });

  it("accepts a Responses-style payload returned by the Chat Completions path", async () => {
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async (requestInput) => String(requestInput).endsWith("/responses")
        ? new Response(null, { status: 404 })
        : Response.json({
          output: [{ content: [{ type: "output_text", text: JSON.stringify(modelOutput) }] }]
        })
    });

    await expect(provider.analyze(input)).resolves.toMatchObject({
      recommendation: { action: "enhance" }
    });
  });

  it("reports when neither relay endpoint is reachable", async () => {
    const provider = new OpenAICompatibleProductVisionProvider({
      apiKey: "test-secret-key",
      baseUrl: "https://gateway.example.test/v1",
      model: "vision-model",
      fetch: async () => { throw new TypeError("connection reset"); }
    });

    await expect(provider.analyze(input)).rejects.toThrow(
      "PRODUCT_VISION_NETWORK_RESPONSES_AND_CHAT_FAILED"
    );
  });
});
