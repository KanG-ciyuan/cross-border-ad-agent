import type {
  VideoGenerationInput,
  VideoGenerationProvider,
  VideoGenerationStatus,
  VideoGenerationTask
} from "./types";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const DEFAULT_SEEDANCE_MODEL = "doubao-seedance-2-5-260628";
const TASK_PATH = "/contents/generations/tasks";
const knownStatuses = new Set<VideoGenerationStatus>([
  "queued", "running", "succeeded", "failed", "expired", "cancelled"
]);

export class SeedanceProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(code);
    this.name = "SeedanceProviderError";
  }
}

interface SeedanceProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface ProviderTaskResponse {
  id?: unknown;
  model?: unknown;
  status?: unknown;
  content?: { video_url?: unknown } | null;
  error?: { code?: unknown } | null;
  duration?: unknown;
  ratio?: unknown;
  resolution?: unknown;
}

function providerError(status: number) {
  if (status === 401 || status === 403) {
    return new SeedanceProviderError("SEEDANCE_AUTHENTICATION_FAILED", status, false);
  }
  if (status === 429) {
    return new SeedanceProviderError("SEEDANCE_RATE_LIMITED", status, true);
  }
  if (status >= 500) {
    return new SeedanceProviderError("SEEDANCE_UNAVAILABLE", status, true);
  }
  return new SeedanceProviderError("SEEDANCE_REQUEST_REJECTED", status, false);
}

function requireHttpsUrl(value: string) {
  try {
    if (new URL(value).protocol !== "https:") throw new Error("not https");
  } catch {
    throw new SeedanceProviderError("INVALID_REFERENCE_URL", 0, false);
  }
}

function normalizeTask(response: ProviderTaskResponse, fallbackModel: string): VideoGenerationTask {
  if (typeof response.id !== "string" || !response.id.trim()) {
    throw new SeedanceProviderError("SEEDANCE_INVALID_RESPONSE", 502, true);
  }
  if (typeof response.status !== "string" || !knownStatuses.has(response.status as VideoGenerationStatus)) {
    throw new SeedanceProviderError("SEEDANCE_INVALID_RESPONSE", 502, true);
  }
  const task: VideoGenerationTask = {
    id: response.id,
    model: typeof response.model === "string" ? response.model : fallbackModel,
    status: response.status as VideoGenerationStatus
  };
  if (typeof response.content?.video_url === "string") task.videoUrl = response.content.video_url;
  if (typeof response.error?.code === "string") task.errorCode = response.error.code;
  if (typeof response.duration === "number") task.durationSeconds = response.duration;
  if (typeof response.ratio === "string") task.ratio = response.ratio;
  if (typeof response.resolution === "string") task.resolution = response.resolution;
  return task;
}

export class SeedanceProvider implements VideoGenerationProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: SeedanceProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new SeedanceProviderError("SEEDANCE_NOT_CONFIGURED", 0, false);
    }
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || DEFAULT_SEEDANCE_MODEL;
    this.baseUrl = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async createTask(input: VideoGenerationInput): Promise<VideoGenerationTask> {
    const prompt = input.prompt.trim();
    if (!prompt || !Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 30) {
      throw new SeedanceProviderError("INVALID_GENERATION_INPUT", 0, false);
    }
    for (const url of [...input.referenceImageUrls, ...(input.referenceVideoUrls ?? [])]) {
      requireHttpsUrl(url);
    }
    const content = [
      { type: "text", text: prompt },
      ...input.referenceImageUrls.map((url) => ({
        type: "image_url",
        image_url: { url },
        role: "reference_image"
      })),
      ...(input.referenceVideoUrls ?? []).map((url) => ({
        type: "video_url",
        video_url: { url },
        role: "reference_video"
      }))
    ];
    const response = await this.request(TASK_PATH, {
      method: "POST",
      body: JSON.stringify({
        model: this.model,
        content,
        duration: input.durationSeconds,
        ratio: input.ratio ?? "9:16",
        resolution: input.resolution ?? "720p",
        generate_audio: input.generateAudio ?? false,
        output_format: "mp4"
      })
    });
    if (typeof response.id !== "string" || !response.id.trim()) {
      throw new SeedanceProviderError("SEEDANCE_INVALID_RESPONSE", 502, true);
    }
    return { id: response.id, model: this.model, status: "queued" };
  }

  async getTask(taskId: string): Promise<VideoGenerationTask> {
    if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
      throw new SeedanceProviderError("INVALID_GENERATION_TASK_ID", 0, false);
    }
    return normalizeTask(await this.request(`${TASK_PATH}/${encodeURIComponent(taskId)}`, {
      method: "GET"
    }), this.model);
  }

  private async request(path: string, init: RequestInit): Promise<ProviderTaskResponse> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        }
      });
    } catch {
      throw new SeedanceProviderError("SEEDANCE_NETWORK_ERROR", 0, true);
    }
    if (!response.ok) throw providerError(response.status);
    try {
      return await response.json() as ProviderTaskResponse;
    } catch {
      throw new SeedanceProviderError("SEEDANCE_INVALID_RESPONSE", 502, true);
    }
  }
}
