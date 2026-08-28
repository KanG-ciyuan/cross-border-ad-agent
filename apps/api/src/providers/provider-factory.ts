import type { Env } from "../env";
import { FakeMediaAnalysisProvider } from "./fake-analysis";
import { MediaAnalysisProvider } from "./media-analysis";
import type { AnalysisAdapters } from "./analysis-adapters";
import type { FullVideoAnalysisProvider } from "./types";

export type AnalysisProviderBindings = Pick<Partial<Env>, "APP_ENV"> & {
  ANALYSIS_PROVIDER?: "demo" | "media";
  /** Presence is checked here; the value is never logged or included in errors. */
  ANALYSIS_API_KEY?: string;
};

export function createAnalysisProvider(
  bindings: AnalysisProviderBindings,
  adapters?: AnalysisAdapters
): FullVideoAnalysisProvider {
  const mode = bindings.ANALYSIS_PROVIDER;
  if (mode === "demo") {
    if (bindings.APP_ENV !== "local" && bindings.APP_ENV !== "test") {
      throw new Error("ANALYSIS_DEMO_FORBIDDEN");
    }
    return new FakeMediaAnalysisProvider();
  }

  if (mode !== "media" || !bindings.ANALYSIS_API_KEY?.trim() || !adapters) {
    throw new Error("ANALYSIS_NOT_CONFIGURED");
  }
  return new MediaAnalysisProvider(adapters);
}
