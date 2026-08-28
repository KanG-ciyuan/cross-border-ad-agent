import type { ProductAnalysisV1 } from "@ad-agent/contracts";

export interface ProductVisionInput {
  taskId: string;
  asset: {
    id: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    bytes: Uint8Array;
  };
  product: {
    name: string;
    suppliedFacts: readonly string[];
  };
}

export interface ProductVisionProvider {
  readonly provider: string;
  analyze(input: ProductVisionInput): Promise<ProductAnalysisV1>;
}
