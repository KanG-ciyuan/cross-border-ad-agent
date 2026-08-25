import type { Env } from "../env";
import { MiniMaxProvider } from "./minimax";
import { SeedanceProvider } from "./seedance";
import type { VideoGenerationProvider } from "./types";

type VideoProviderBindings = Pick<
  Partial<Env>,
  | "VIDEO_GENERATION_PROVIDER"
  | "MINIMAX_API_KEY"
  | "MINIMAX_BASE_URL"
  | "MINIMAX_MODEL_ID"
  | "ARK_API_KEY"
  | "SEEDANCE_MODEL_ID"
>;

export function createVideoGenerationProvider(
  bindings: VideoProviderBindings
): VideoGenerationProvider {
  if ((bindings.VIDEO_GENERATION_PROVIDER ?? "minimax") === "seedance") {
    return new SeedanceProvider({
      apiKey: bindings.ARK_API_KEY ?? "",
      model: bindings.SEEDANCE_MODEL_ID
    });
  }
  return new MiniMaxProvider({
    apiKey: bindings.MINIMAX_API_KEY ?? "",
    baseUrl: bindings.MINIMAX_BASE_URL,
    model: bindings.MINIMAX_MODEL_ID
  });
}
