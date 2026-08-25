import { describe, expect, it } from "vitest";
import {
  buildFinalFfmpegArgs,
  normalizeClipWindow,
  requireSupportedVideoType
} from "../src/ffmpeg-renderer";

describe("FFmpeg renderer", () => {
  it("accepts uploaded MP4 and QuickTime videos only", () => {
    expect(requireSupportedVideoType("video/mp4")).toBe(".mp4");
    expect(requireSupportedVideoType("video/quicktime")).toBe(".mov");
    expect(() => requireSupportedVideoType("image/png")).toThrowError("UNSUPPORTED_RENDER_INPUT");
  });

  it("clamps planned clip windows to the decoded source duration", () => {
    expect(normalizeClipWindow({ startMs: 6_000, endMs: 9_000 }, 7_200)).toEqual({
      startSeconds: 6,
      durationSeconds: 1.2
    });
    expect(normalizeClipWindow({ startMs: 9_000, endMs: 12_000 }, 2_500)).toEqual({
      startSeconds: 0,
      durationSeconds: 2.5
    });
  });

  it("builds a vertical H264 and AAC output with text overlays", () => {
    const args = buildFinalFfmpegArgs({
      normalizedInputs: ["/tmp/clip-1.mp4", "/tmp/clip-2.mp4"],
      outputPath: "/tmp/output.mp4",
      width: 1080,
      height: 1920,
      fps: 30,
      titleFile: "/tmp/title.txt",
      captionFile: "/tmp/caption.txt",
      ctaFile: "/tmp/cta.txt",
      fontFile: "/System/Library/Fonts/Supplemental/Arial.ttf"
    });

    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("1080:1920");
    expect(args.join(" ")).toContain("xfade=transition=fade");
    expect(args.join(" ")).toContain("textfile='/tmp/caption.txt'");
    expect(args.at(-1)).toBe("/tmp/output.mp4");
  });
});
