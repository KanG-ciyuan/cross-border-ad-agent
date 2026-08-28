import { describe, expect, it } from "vitest";
import {
  buildCaptionOverlayPosition,
  buildFinalFfmpegArgs,
  buildNormalizeVideoClipArgs,
  buildVideoAdaptationFilter,
  parseRenderManifest,
  resolveRenderProfile
} from "../src/ffmpeg-renderer";

describe("ratio-aware renderer profiles", () => {
  it("resolves both supported output ratios without stretching", () => {
    expect(resolveRenderProfile("9:16")).toMatchObject({
      ratio: "9:16",
      width: 1080,
      height: 1920
    });
    expect(resolveRenderProfile("16:9")).toMatchObject({
      ratio: "16:9",
      width: 1920,
      height: 1080
    });
  });

  it("uses crop and contain filters that preserve source aspect ratio", () => {
    expect(buildVideoAdaptationFilter({ width: 1920, height: 1080, fit: "crop", fps: 30 }))
      .toContain("force_original_aspect_ratio=increase,crop=1920:1080");
    expect(buildVideoAdaptationFilter({ width: 1920, height: 1080, fit: "contain", fps: 30 }))
      .toContain("force_original_aspect_ratio=decrease,pad=1920:1080");
  });

  it("keeps captions inside a stable profile safe zone", () => {
    expect(buildCaptionOverlayPosition(resolveRenderProfile("9:16"), "caption"))
      .toBe("x=(W-w)/2:y=H-h-140");
    expect(buildCaptionOverlayPosition(resolveRenderProfile("16:9"), "caption"))
      .toBe("x=(W-w)/2:y=H-h-80");
  });

  it("preserves clip duration while replacing muted original audio with silence", () => {
    const args = buildNormalizeVideoClipArgs({
      inputPath: "/tmp/source.mp4",
      outputPath: "/tmp/normalized.mp4",
      startSeconds: 1.25,
      durationSeconds: 2.75,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: false,
      fit: "contain"
    });

    expect(args.slice(0, 8)).toEqual([
      "-y", "-ss", "1.25", "-t", "2.75", "-i", "/tmp/source.mp4", "-f"
    ]);
    expect(args).toContain("anullsrc=r=48000:cl=stereo");
    expect(args.join(" ")).toContain("-map 1:a:0");
    expect(args.at(-1)).toBe("/tmp/normalized.mp4");
  });

  it("maps a single normalized input audio stream as an input stream", () => {
    const args = buildFinalFfmpegArgs({
      normalizedInputs: ["/tmp/normalized.mp4"],
      normalizedDurations: [1],
      outputPath: "/tmp/output.mp4",
      width: 1080,
      height: 1920,
      fps: 30,
      ratio: "9:16",
      titleOverlay: "/tmp/title.ppm",
      captionOverlay: "/tmp/caption.ppm",
      ctaOverlay: "/tmp/cta.ppm"
    });

    const mapIndex = args.indexOf("-map");
    expect(args[mapIndex + 1]).toBe("[vout]");
    expect(args[mapIndex + 2]).toBe("-map");
    expect(args[mapIndex + 3]).toBe("0:a");
  });

  it("validates a horizontal manifest and rejects ratio/size conflicts", () => {
    const manifest = {
      output: { ratio: "16:9", width: 1920, height: 1080, fps: 30 },
      title: "Title",
      caption: "Caption",
      cta: "CTA",
      muteOriginalAudio: true,
      clips: [{ field: "clip_0", mimeType: "video/mp4", startMs: 0, endMs: 1_000, fit: "contain" }]
    };

    expect(parseRenderManifest(JSON.stringify(manifest))).toMatchObject(manifest);
    expect(() => parseRenderManifest(JSON.stringify({
      ...manifest,
      output: { ...manifest.output, width: 1080, height: 1920 }
    }))).toThrowError("INVALID_RENDER_REQUEST");
  });
});
