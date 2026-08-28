import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export type RenderRatio = "9:16" | "16:9";
export type RenderFit = "crop" | "contain";

export interface RenderProfile {
  ratio: RenderRatio;
  width: number;
  height: number;
  titleTop: number;
  captionBottom: number;
  ctaVertical: "center";
}

export interface RenderManifest {
  output: { width: number; height: number; fps: number; ratio?: RenderRatio; fit?: RenderFit };
  ratio?: RenderRatio;
  fit?: RenderFit;
  title: string;
  caption: string;
  cta: string;
  muteOriginalAudio?: boolean;
  clips: Array<{
    field: string;
    mimeType: string;
    startMs: number;
    endMs: number;
    fit?: RenderFit;
  }>;
}

const renderProfiles: Record<RenderRatio, RenderProfile> = {
  "9:16": { ratio: "9:16", width: 1080, height: 1920, titleTop: 80, captionBottom: 140, ctaVertical: "center" },
  "16:9": { ratio: "16:9", width: 1920, height: 1080, titleTop: 48, captionBottom: 80, ctaVertical: "center" }
};

export class RendererError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "RendererError";
  }
}

export function resolveRenderProfile(ratio: RenderRatio): RenderProfile {
  const profile = renderProfiles[ratio];
  if (!profile) throw new RendererError("INVALID_RENDER_REQUEST");
  return profile;
}

export function inferRenderRatio(width: number, height: number): RenderRatio {
  if (width === renderProfiles["9:16"].width && height === renderProfiles["9:16"].height) return "9:16";
  if (width === renderProfiles["16:9"].width && height === renderProfiles["16:9"].height) return "16:9";
  throw new RendererError("INVALID_RENDER_REQUEST");
}

export function parseRenderManifest(value: FormDataEntryValue | null): RenderManifest {
  if (typeof value !== "string") throw new RendererError("INVALID_RENDER_REQUEST");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new RendererError("INVALID_RENDER_REQUEST"); }
  const manifest = parsed as Partial<RenderManifest>;
  if (!manifest.output || !Number.isInteger(manifest.output.width) || !Number.isInteger(manifest.output.height) ||
    manifest.output.fps !== 30 || !Array.isArray(manifest.clips) || !manifest.clips.length ||
    typeof manifest.title !== "string" || typeof manifest.caption !== "string" || typeof manifest.cta !== "string" ||
    (manifest.muteOriginalAudio !== undefined && typeof manifest.muteOriginalAudio !== "boolean") ||
    (manifest.ratio !== undefined && manifest.ratio !== "9:16" && manifest.ratio !== "16:9") ||
    (manifest.fit !== undefined && manifest.fit !== "crop" && manifest.fit !== "contain") ||
    (manifest.output.ratio !== undefined && manifest.output.ratio !== "9:16" && manifest.output.ratio !== "16:9") ||
    (manifest.output.fit !== undefined && manifest.output.fit !== "crop" && manifest.output.fit !== "contain")) {
    throw new RendererError("INVALID_RENDER_REQUEST");
  }
  const inferredRatio = inferRenderRatio(manifest.output.width, manifest.output.height);
  const ratio = manifest.output.ratio ?? manifest.ratio ?? inferredRatio;
  const profile = resolveRenderProfile(ratio);
  if (manifest.output.width !== profile.width || manifest.output.height !== profile.height ||
    (manifest.output.ratio !== undefined && manifest.ratio !== undefined && manifest.output.ratio !== manifest.ratio)) {
    throw new RendererError("INVALID_RENDER_REQUEST");
  }
  for (const clip of manifest.clips) {
    if (!clip || typeof clip.field !== "string" || typeof clip.mimeType !== "string" ||
      !Number.isInteger(clip.startMs) || !Number.isInteger(clip.endMs) || clip.endMs <= clip.startMs ||
      (clip.fit !== undefined && clip.fit !== "crop" && clip.fit !== "contain")) {
      throw new RendererError("INVALID_RENDER_REQUEST");
    }
  }
  return manifest as RenderManifest;
}

export function buildVideoAdaptationFilter(input: {
  width: number;
  height: number;
  fps: number;
  fit?: RenderFit;
}) {
  const fit = input.fit ?? "crop";
  if (fit === "contain") {
    return `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${input.fps},setsar=1`;
  }
  return `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},fps=${input.fps},setsar=1`;
}

export function buildCaptionOverlayPosition(profile: RenderProfile, kind: "caption" | "title" | "cta") {
  if (kind === "title") return `x=(W-w)/2:y=${profile.titleTop}`;
  if (kind === "cta") return "x=(W-w)/2:y=(H-h)/2";
  return `x=(W-w)/2:y=H-h-${profile.captionBottom}`;
}

export function buildNormalizeVideoClipArgs(input: {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  fit?: RenderFit;
}) {
  const args = ["-y", "-ss", String(input.startSeconds), "-t", String(input.durationSeconds), "-i", input.inputPath];
  if (!input.hasAudio) args.push("-f", "lavfi", "-t", String(input.durationSeconds), "-i", "anullsrc=r=48000:cl=stereo");
  args.push(
    "-map", "0:v:0", "-map", input.hasAudio ? "0:a:0" : "1:a:0",
    "-vf", buildVideoAdaptationFilter(input),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", input.outputPath
  );
  return args;
}

export function requireSupportedVideoType(mimeType: string): ".mp4" | ".mov" {
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  throw new RendererError("UNSUPPORTED_RENDER_INPUT");
}

export function normalizeClipWindow(
  planned: { startMs: number; endMs: number },
  sourceDurationMs: number
) {
  if (!Number.isFinite(sourceDurationMs) || sourceDurationMs <= 0) {
    throw new RendererError("UNDECODABLE_RENDER_INPUT");
  }
  const requestedDuration = Math.max(0.1, (planned.endMs - planned.startMs) / 1_000);
  const sourceDuration = sourceDurationMs / 1_000;
  const requestedStart = Math.max(0, planned.startMs / 1_000);
  const startSeconds = requestedStart >= sourceDuration ? 0 : requestedStart;
  return {
    startSeconds,
    durationSeconds: Math.round(Math.min(requestedDuration, sourceDuration - startSeconds) * 1_000) / 1_000
  };
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", () => reject(new RendererError("RENDERER_EXECUTION_FAILED")));
    child.once("close", (code) => code === 0
      ? resolve(stdout)
      : reject(new RendererError(stderr.includes("Invalid data") ? "UNDECODABLE_RENDER_INPUT" : "RENDERER_EXECUTION_FAILED")));
  });
}

export async function probeVideo(inputPath: string, ffprobePath = "ffprobe") {
  const output = await run(ffprobePath, [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type",
    "-of", "json", inputPath
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
    !parsed.streams?.some((stream) => stream.codec_type === "video")) {
    throw new RendererError("UNDECODABLE_RENDER_INPUT");
  }
  return {
    durationMs: Math.round(durationSeconds * 1_000),
    hasAudio: parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

export async function normalizeVideoClip(input: {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  fit?: RenderFit;
  ffmpegPath?: string;
}) {
  await run(input.ffmpegPath ?? "ffmpeg", buildNormalizeVideoClipArgs(input));
}

export function buildFinalFfmpegArgs(input: {
  normalizedInputs: string[];
  normalizedDurations?: number[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  ratio?: RenderRatio;
  captionSafeZone?: number;
  titleOverlay: string;
  captionOverlay: string;
  ctaOverlay: string;
}) {
  if (!input.normalizedInputs.length) throw new RendererError("MATERIAL_REQUIRED");
  const args = ["-y"];
  for (const source of input.normalizedInputs) args.push("-i", source);
  for (const overlay of [input.titleOverlay, input.captionOverlay, input.ctaOverlay]) {
    args.push("-loop", "1", "-i", overlay);
  }
  const durations = input.normalizedDurations ?? input.normalizedInputs.map(() => 3);
  const ratio = input.ratio ?? inferRenderRatio(input.width, input.height);
  const profile = resolveRenderProfile(ratio);
  const captionBottom = input.captionSafeZone ?? profile.captionBottom;
  const transitionSeconds = 0.25;
  const filters: string[] = [];
  let videoLabel = "0:v";
  let audioLabel = "0:a";
  let elapsed = durations[0] ?? 3;
  for (let index = 1; index < input.normalizedInputs.length; index += 1) {
    const nextVideo = `vx${index}`;
    const nextAudio = `ax${index}`;
    const offset = Math.max(0, elapsed - transitionSeconds);
    filters.push(`[${videoLabel}][${index}:v]xfade=transition=fade:duration=${transitionSeconds}:offset=${offset.toFixed(3)}[${nextVideo}]`);
    filters.push(`[${audioLabel}][${index}:a]acrossfade=d=${transitionSeconds}[${nextAudio}]`);
    videoLabel = nextVideo;
    audioLabel = nextAudio;
    elapsed += (durations[index] ?? 3) - transitionSeconds;
  }
  const overlayStart = input.normalizedInputs.length;
  filters.push(
    `[${overlayStart}:v]format=rgba,colorkey=black:0.12:0.0[title];[${overlayStart + 1}:v]format=rgba,colorkey=black:0.12:0.0[caption];[${overlayStart + 2}:v]format=rgba,colorkey=black:0.12:0.0[cta];` +
    `[${videoLabel}][title]overlay=${buildCaptionOverlayPosition(profile, "title")}[vtitle];` +
    `[vtitle][caption]overlay=${buildCaptionOverlayPosition({ ...profile, captionBottom }, "caption")}[vcaption];` +
    `[vcaption][cta]overlay=${buildCaptionOverlayPosition(profile, "cta")}:enable='gte(t,${Math.max(0, elapsed - 2).toFixed(3)})'[vout]`
  );
  args.push(
    "-filter_complex", filters.join(";"), "-map", "[vout]", "-map", audioLabel.startsWith("0:") ? audioLabel : `[${audioLabel}]`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-r", String(input.fps), "-s", `${input.width}:${input.height}`,
    "-movflags", "+faststart", "-shortest", input.outputPath
  );
  return args;
}

export async function renderFinalVideo(input: Parameters<typeof buildFinalFfmpegArgs>[0] & { ffmpegPath?: string }) {
  await run(input.ffmpegPath ?? "ffmpeg", buildFinalFfmpegArgs(input));
  await access(input.outputPath);
}
