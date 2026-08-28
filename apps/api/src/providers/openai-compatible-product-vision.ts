import { ProductAnalysisV1, type ProductAnalysisV1 as ProductAnalysis } from "@ad-agent/contracts";
import { z } from "zod";
import type { ProductVisionInput, ProductVisionProvider } from "./product-vision";

interface ProductVisionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
}

export class ProductVisionProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProductVisionProviderError";
  }
}

const modelOutputSchema = ProductAnalysisV1.omit({
  version: true,
  taskId: true,
  sourceAssetId: true,
  requiresHumanConfirmation: true
});
const modelOutputJsonSchema = z.toJSONSchema(modelOutputSchema);

function normalizedBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("PRODUCT_VISION_CONFIG_INVALID");
  return url.toString().replace(/\/$/, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("INVALID_RESPONSE");
  const directText = (payload as { output_text?: unknown }).output_text;
  const output = (payload as { output?: unknown }).output;
  const nestedText = Array.isArray(output)
    ? output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const candidate = part as { type?: unknown; text?: unknown };
        return candidate.type === "output_text" && typeof candidate.text === "string"
          ? [candidate.text]
          : [];
      });
    }).join("\n")
    : "";
  const content = typeof directText === "string" && directText.trim() ? directText : nestedText;
  if (!content.trim()) throw new Error("INVALID_RESPONSE");
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function extractChatContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("INVALID_RESPONSE");
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) throw new Error("INVALID_RESPONSE");
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as { message?: unknown }).message
    : undefined;
  const rawContent = message && typeof message === "object"
    ? (message as { content?: unknown }).content
    : undefined;
  const content = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const candidate = part as { type?: unknown; text?: unknown };
        return (candidate.type === "text" || candidate.type === "output_text") &&
          typeof candidate.text === "string"
          ? [candidate.text]
          : [];
      }).join("\n")
      : "";
  if (!content.trim()) {
    throw new ProductVisionProviderError("PRODUCT_VISION_CHAT_CONTENT_MISSING");
  }
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function parseModelOutput(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ProductVisionProviderError("PRODUCT_VISION_JSON_INVALID");
  }
  const result = modelOutputSchema.safeParse(parsed);
  if (!result.success) {
    const paths = [...new Set(result.error.issues.map((issue) => issue.path[0])
      .filter((part): part is string | number => part !== undefined)
      .map((part) => String(part).replace(/[^A-Za-z0-9_]/g, "")))]
      .slice(0, 4)
      .join("_");
    throw new ProductVisionProviderError(
      `PRODUCT_VISION_SCHEMA_INVALID_${paths || "root"}`
    );
  }
  return result.data;
}

const systemPrompt = [
  "Analyze the supplied ecommerce product image for an Indonesia TikTok ad workflow.",
  "Return exactly one JSON object with no markdown and no extra keys.",
  "The JSON must match this structure:",
  JSON.stringify({
    quality: {
      score: "number from 0 to 1",
      decision: "usable | usable_with_enhancement | needs_reupload",
      issues: [{
        kind: "resolution | blur | exposure | crop | compression | subject_scale | label_legibility | other",
        severity: "low | medium | high",
        description: "string",
        confidence: "number from 0 to 1"
      }]
    },
    factCandidates: [{
      field: "brand | product_name | capacity | color | package_shape | material | closure | label_text | other",
      value: "string",
      certainty: "observed | user_provided | uncertain",
      confidence: "number from 0 to 1",
      evidence: "string"
    }],
    immutableConstraints: ["string"],
    missingFacts: ["string"],
    recommendation: {
      action: "use_original | upscale | enhance | rebuild | request_more_images",
      reason: "string"
    }
  }),
  "Use empty arrays when there are no issues, constraints, facts, or missing facts.",
  "Report visible facts as candidates, never as approved facts.",
  "Do not invent hidden side or back packaging details. Mark uncertain text as uncertain.",
  "Assess image quality and select exactly one allowed recommendation action."
].join(" ");

export class OpenAICompatibleProductVisionProvider implements ProductVisionProvider {
  readonly provider = "openai_compatible_product_vision";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(config: ProductVisionConfig) {
    if (!config.apiKey.trim() || !config.model.trim()) throw new Error("PRODUCT_VISION_CONFIG_INVALID");
    this.apiKey = config.apiKey.trim();
    this.baseUrl = normalizedBaseUrl(config.baseUrl);
    this.model = config.model.trim();
    this.fetcher = config.fetch ?? fetch;
  }

  async analyze(input: ProductVisionInput): Promise<ProductAnalysis> {
    let responsesStatus: number | undefined;
    let chatStatus: number | undefined;
    try {
      const imageUrl = `data:${input.asset.mimeType};base64,${bytesToBase64(input.asset.bytes)}`;
      const userText = JSON.stringify({
        productName: input.product.name,
        userSuppliedFacts: input.product.suppliedFacts
      });
      let response: Response | undefined;
      try {
        response = await this.fetcher(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: this.model,
            text: { format: { type: "json_object" } },
            input: [
              {
                role: "system",
                content: [{ type: "input_text", text: systemPrompt }]
              },
              {
                role: "user",
                content: [
                  { type: "input_text", text: userText },
                  { type: "input_image", image_url: imageUrl, detail: "high" }
                ]
              }
            ]
          })
        });
        responsesStatus = response.status;
      } catch {
        responsesStatus = 0;
      }
      let content: string | undefined;
      if (response?.ok) {
        try {
          content = extractContent(await response.json());
        } catch {
          content = undefined;
        }
      }
      if (!content) {
        let fallback: Response;
        try {
          fallback = await this.fetcher(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: this.model,
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "product_analysis",
                  strict: true,
                  schema: modelOutputJsonSchema
                }
              },
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userText },
                    { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
                  ]
                }
              ]
            })
          });
        } catch {
          throw new ProductVisionProviderError(
            "PRODUCT_VISION_NETWORK_RESPONSES_AND_CHAT_FAILED"
          );
        }
        chatStatus = fallback.status;
        if (!fallback.ok) {
          throw new ProductVisionProviderError(
            `PRODUCT_VISION_UPSTREAM_RESPONSES_${responsesStatus}_CHAT_${chatStatus}`
          );
        }
        let fallbackPayload: unknown;
        try {
          fallbackPayload = await fallback.json();
        } catch {
          throw new ProductVisionProviderError("PRODUCT_VISION_CHAT_RESPONSE_NOT_JSON");
        }
        try {
          content = extractChatContent(fallbackPayload);
        } catch {
          try {
            content = extractContent(fallbackPayload);
          } catch {
            const keys = fallbackPayload && typeof fallbackPayload === "object"
              ? Object.keys(fallbackPayload).map((key) => key.replace(/[^A-Za-z0-9_]/g, ""))
                .filter(Boolean).slice(0, 5).join("_")
              : "root";
            throw new ProductVisionProviderError(`PRODUCT_VISION_CHAT_SHAPE_${keys || "root"}`);
          }
        }
      }
      const output = parseModelOutput(content);
      return ProductAnalysisV1.parse({
        version: "product_analysis.v1",
        taskId: input.taskId,
        sourceAssetId: input.asset.id,
        ...output,
        requiresHumanConfirmation: true
      });
    } catch (reason) {
      if (reason instanceof ProductVisionProviderError) throw reason;
      if (responsesStatus === undefined) {
        throw new ProductVisionProviderError("PRODUCT_VISION_NETWORK_FAILED");
      }
      if (chatStatus !== undefined) {
        throw new ProductVisionProviderError(
          `PRODUCT_VISION_INVALID_OUTPUT_RESPONSES_${responsesStatus}_CHAT_${chatStatus}`
        );
      }
      throw new ProductVisionProviderError(`PRODUCT_VISION_INVALID_OUTPUT_RESPONSES_${responsesStatus}`);
    }
  }
}
