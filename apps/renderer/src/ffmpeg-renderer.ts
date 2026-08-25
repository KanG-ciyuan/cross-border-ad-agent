import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export class RendererError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RendererError";
  }
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
  ffmpegPath?: string;
}) {
  const args = ["-y", "-ss", String(input.startSeconds), "-t", String(input.durationSeconds), "-i", input.inputPath];
  if (!input.hasAudio) args.push("-f", "lavfi", "-t", String(input.durationSeconds), "-i", "anullsrc=r=48000:cl=stereo");
  args.push(
    "-map", "0:v:0", "-map", input.hasAudio ? "0:a:0" : "1:a:0",
    "-vf", `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},fps=${input.fps},setsar=1`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", input.outputPath
  );
  await run(input.ffmpegPath ?? "ffmpeg", args);
}

export function buildFinalFfmpegArgs(input: {
  normalizedInputs: string[];
  normalizedDurations?: number[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  titleFile: string;
  captionFile: string;
  ctaFile: string;
  fontFile: string;
}) {
  if (!input.normalizedInputs.length) throw new RendererError("MATERIAL_REQUIRED");
  const args = ["-y"];
  for (const source of input.normalizedInputs) args.push("-i", source);
  const durations = input.normalizedDurations ?? input.normalizedInputs.map(() => 3);
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
  const safeFont = input.fontFile.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  filters.push(
    `[${videoLabel}]drawtext=fontfile='${safeFont}':textfile='${input.titleFile}':fontcolor=white:fontsize=52:box=1:boxcolor=black@0.58:boxborderw=22:x=(w-text_w)/2:y=120,` +
    `drawtext=fontfile='${safeFont}':textfile='${input.captionFile}':fontcolor=white:fontsize=46:line_spacing=14:box=1:boxcolor=black@0.62:boxborderw=24:x=(w-text_w)/2:y=h-text_h-260,` +
    `drawtext=fontfile='${safeFont}':textfile='${input.ctaFile}':fontcolor=white:fontsize=58:box=1:boxcolor=0x16824f@0.92:boxborderw=26:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(t,${Math.max(0, elapsed - 2).toFixed(3)})'[vout]`
  );
  args.push(
    "-filter_complex", filters.join(";"), "-map", "[vout]", "-map", `[${audioLabel}]`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-r", String(input.fps), "-s", `${input.width}:${input.height}`,
    "-movflags", "+faststart", input.outputPath
  );
  return args;
}

export async function renderFinalVideo(input: Parameters<typeof buildFinalFfmpegArgs>[0] & { ffmpegPath?: string }) {
  await run(input.ffmpegPath ?? "ffmpeg", buildFinalFfmpegArgs(input));
  await access(input.outputPath);
}
