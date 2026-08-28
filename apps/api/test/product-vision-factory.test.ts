import { describe, expect, it } from "vitest";
import { createProductVisionProvider } from "../src/providers/product-vision-factory";

describe("createProductVisionProvider", () => {
  it("creates an OpenAI-compatible provider only from complete backend bindings", () => {
    const provider = createProductVisionProvider({
      PRODUCT_VISION_PROVIDER: "openai_compatible",
      PRODUCT_VISION_API_KEY: "test-key",
      PRODUCT_VISION_BASE_URL: "https://gateway.example.test/v1",
      PRODUCT_VISION_MODEL_ID: "vision-model"
    });

    expect(provider.provider).toBe("openai_compatible_product_vision");
  });

  it("fails closed when the real provider is not fully configured", () => {
    expect(() => createProductVisionProvider({
      PRODUCT_VISION_PROVIDER: "openai_compatible",
      PRODUCT_VISION_BASE_URL: "https://gateway.example.test/v1",
      PRODUCT_VISION_MODEL_ID: "vision-model"
    })).toThrow("PRODUCT_VISION_NOT_CONFIGURED");
  });
});
