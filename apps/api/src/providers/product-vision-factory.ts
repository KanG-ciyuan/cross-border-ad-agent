import type { Env } from "../env";
import { OpenAICompatibleProductVisionProvider } from "./openai-compatible-product-vision";
import type { ProductVisionProvider } from "./product-vision";

type ProductVisionBindings = Pick<Partial<Env>,
  "PRODUCT_VISION_PROVIDER" |
  "PRODUCT_VISION_API_KEY" |
  "PRODUCT_VISION_BASE_URL" |
  "PRODUCT_VISION_MODEL_ID"
>;

export function createProductVisionProvider(bindings: ProductVisionBindings): ProductVisionProvider {
  if (
    bindings.PRODUCT_VISION_PROVIDER !== "openai_compatible" ||
    !bindings.PRODUCT_VISION_API_KEY?.trim() ||
    !bindings.PRODUCT_VISION_BASE_URL?.trim() ||
    !bindings.PRODUCT_VISION_MODEL_ID?.trim()
  ) {
    throw new Error("PRODUCT_VISION_NOT_CONFIGURED");
  }
  return new OpenAICompatibleProductVisionProvider({
    apiKey: bindings.PRODUCT_VISION_API_KEY,
    baseUrl: bindings.PRODUCT_VISION_BASE_URL,
    model: bindings.PRODUCT_VISION_MODEL_ID
  });
}
