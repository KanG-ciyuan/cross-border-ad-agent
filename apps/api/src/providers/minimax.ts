import type {
  VideoGenerationInput,
  VideoGenerationProvider,
  VideoGenerationStatus,
  VideoGenerationTask
} from "./types";

const DEFAULT_BASE_URL = "https://api.minimax.io";
export const DEFAULT_MINIMAX_MODEL = "MiniMax-H3";
const CREATE_PATH = "/v2/video_generation";
const QUERY_PATH = "/v2/query/video_generation";
const knownStatuses = new Set<VideoGenerationStatus>([
  "queued", "running", "succeeded", "failed", "cancelled"
]);

export class MiniMaxProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(code);
    this.name = "MiniMaxProviderError";
  }
}

interface MiniMaxProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface MiniMaxTaskResponse {
  task_id?: unknown;
  task?: {
    id?: unknown;
    model?: unknown;
    status?: unknown;
    content?: { url?: unknown } | null;
    error?: { code?: unknown } | null;
    duration?: unknown;
    ratio?: unknown;
    resolution?: unknown;
  } | null;
}

function providerError(status: number) {
  if (status === 401 || status === 403) {
    return new MiniMaxProviderError("MINIMAX_AUTHENTICATION_FAILED", status, false);
  }
  if (status === 402) {
    return new MiniMaxProviderError("MINIMAX_INSUFFICIENT_BALANCE", status, false);
  }
  if (status === 422) {
    return new MiniMaxProviderError("MINIMAX_CONTENT_REJECTED", status, false);
  }
  if (status === 429) {
    return new MiniMaxProviderError("MINIMAX_RATE_LIMITED", status, true);
  }
  if (status >= 500) {
    return new MiniMaxProviderError("MINIMAX_UNAVAILABLE", status, true);
  }
  return new MiniMaxProviderError("MINIMAX_REQUEST_REJECTED", status, false);
}

function requireHttpsUrl(value: string) {
  try {
    if (new URL(value).protocol !== "https:") throw new Error("not https");
  } catch {
    throw new MiniMaxProviderError("INVALID_REFERENCE_URL", 0, false);
  }
}

function minimaxResolution(value: VideoGenerationInput["resolution"]): "768P" | "2K" {
  return value === "2K" || value === "1080p" ? "2K" : "768P";
}

export class MiniMaxProvider implements VideoGenerationProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: MiniMaxProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new MiniMaxProviderError("MINIMAX_NOT_CONFIGURED", 0, false);
    }
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || DEFAULT_MINIMAX_MODEL;
    this.baseUrl = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async createTask(input: VideoGenerationInput): Promise<VideoGenerationTask> {
    const prompt = input.prompt.trim();
    if (!prompt || !Number.isInteger(input.durationSeconds) || input.durationSeconds < 4 || input.durationSeconds > 15) {
      throw new MiniMaxProviderError("INVALID_GENERATION_INPUT", 0, false);
    }
    const videos = input.referenceVideoUrls ?? [];
    if (input.referenceImageUrls.length > 9 || videos.length > 3 || input.referenceImageUrls.length + videos.length > 12) {
      throw new MiniMaxProviderError("MINIMAX_REFERENCE_LIMIT_EXCEEDED", 0, false);
    }
    for (const url of [...input.referenceImageUrls, ...videos]) requireHttpsUrl(url);

    const content = [
      { type: "text", text: prompt },
      ...input.referenceImageUrls.map((url) => ({
        type: "image_url",
        image_url: { url },
        role: "reference_image"
      })),
      ...videos.map((url) => ({
        type: "video_url",
        video_url: { url },
        role: "reference_video"
      }))
    ];
    const response = await this.request(CREATE_PATH, {
      method: "POST",
      body: JSON.stringify({
        model: this.model,
        content,
        resolution: minimaxResolution(input.resolution),
        duration: input.durationSeconds,
        ratio: input.ratio ?? "9:16"
      })
    });
    if (typeof response.task_id !== "string" || !response.task_id.trim()) {
      throw new MiniMaxProviderError("MINIMAX_INVALID_RESPONSE", 502, true);
    }
    return { id: response.task_id, model: this.model, status: "queued" };
  }

  async getTask(taskId: string): Promise<VideoGenerationTask> {
    if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
      throw new MiniMaxProviderError("INVALID_GENERATION_TASK_ID", 0, false);
    }
    const response = await this.request(`${QUERY_PATH}/${encodeURIComponent(taskId)}`, { method: "GET" });
    const task = response.task;
    if (!task || typeof task.id !== "string" || typeof task.status !== "string" ||
      !knownStatuses.has(task.status as VideoGenerationStatus)) {
      throw new MiniMaxProviderError("MINIMAX_INVALID_RESPONSE", 502, true);
    }
    const normalized: VideoGenerationTask = {
      id: task.id,
      model: typeof task.model === "string" ? task.model : this.model,
      status: task.status as VideoGenerationStatus
    };
    if (typeof task.content?.url === "string") normalized.videoUrl = task.content.url;
    if (typeof task.error?.code === "string") normalized.errorCode = task.error.code;
    if (typeof task.duration === "number") normalized.durationSeconds = task.duration;
    if (typeof task.ratio === "string") normalized.ratio = task.ratio;
    if (typeof task.resolution === "string") normalized.resolution = task.resolution;
    return normalized;
  }

  private async request(path: string, init: RequestInit): Promise<MiniMaxTaskResponse> {
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
      throw new MiniMaxProviderError("MINIMAX_NETWORK_ERROR", 0, true);
    }
    if (!response.ok) throw providerError(response.status);
    try {
      return await response.json() as MiniMaxTaskResponse;
    } catch {
      throw new MiniMaxProviderError("MINIMAX_INVALID_RESPONSE", 502, true);
    }
  }
}
