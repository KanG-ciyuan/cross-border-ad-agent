import { AnalysisMapV1, type AnalysisMapV1 as AnalysisMap } from "@ad-agent/contracts";
import type { AnalysisInput, FullVideoAnalysisProvider } from "./types";
import type {
  AnalysisAdapters,
  MultimodalInterpretation,
  ProbeResult,
  TimedTextFinding
} from "./analysis-adapters";

export type { AnalysisAdapters } from "./analysis-adapters";

const safeFailure = () => new Error("MEDIA_ANALYSIS_FAILED");

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function validBoundary(value: number, durationMs: number): boolean {
  return Number.isInteger(value) && value > 0 && value < durationMs;
}

function confidenceOf(
  asr: readonly TimedTextFinding[],
  ocr: readonly TimedTextFinding[],
  multimodal: MultimodalInterpretation
): number {
  const values = [
    ...asr.map((finding) => finding.confidence),
    ...ocr.map((finding) => finding.confidence),
    ...multimodal.labels.map((finding) => finding.confidence),
    ...multimodal.risks.map((finding) => finding.confidence)
  ].filter((value) => Number.isFinite(value));
  if (!values.length) return 0.5;
  return Math.max(0, Math.min(1, Math.max(...values)));
}

export class MediaAnalysisProvider implements FullVideoAnalysisProvider {
  readonly provider = "media_analysis";

  constructor(private readonly adapters: AnalysisAdapters) {}

  async analyze(input: AnalysisInput): Promise<AnalysisMap> {
    const segments: AnalysisMap["segments"] = [];

    for (const asset of input.assets) {
      if (asset.kind !== "source_video") continue;
      let probe: ProbeResult;
      let asr: readonly TimedTextFinding[];
      let ocr: readonly TimedTextFinding[];
      let keyframesMs: readonly number[] = [];
      try {
        probe = await this.adapters.probe.probe({ asset });
        if (!Number.isInteger(probe.durationMs) || probe.durationMs <= 0) throw safeFailure();
        const changePoints = (probe.changePoints ?? []).map((point) => point.atMs)
          .filter((value) => validBoundary(value, probe.durationMs));
        const analysisBoundaries = [...(probe.boundariesMs ?? []), ...changePoints]
          .filter((value) => validBoundary(value, probe.durationMs));
        keyframesMs = [...new Set(analysisBoundaries.flatMap((point) => [point - 250, point, point + 250])
          .filter((value) => value >= 0 && value <= probe.durationMs))].sort((a, b) => a - b);
        [asr, ocr] = await Promise.all([
          this.adapters.asr.transcribe({ asset, durationMs: probe.durationMs, keyframesMs }),
          this.adapters.ocr.detect({ asset, durationMs: probe.durationMs, keyframesMs })
        ]);
        probe = { ...probe, boundariesMs: analysisBoundaries };
      } catch {
        throw safeFailure();
      }

      const boundaries = [...new Set([
        0,
        ...(probe.boundariesMs ?? []).filter((value) => validBoundary(value, probe.durationMs)),
        probe.durationMs
      ])].sort((a, b) => a - b);

      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const startMs = boundaries[index]!;
        const endMs = boundaries[index + 1]!;
        const window = { sourceAssetId: asset.id, startMs, endMs };
        let multimodal: MultimodalInterpretation;
        try {
          const segmentKeyframesMs = keyframesMs.filter((value) => value >= startMs && value <= endMs);
          multimodal = await this.adapters.multimodal.interpret({
            segment: window,
            keyframesMs: segmentKeyframesMs
          });
        } catch {
          throw safeFailure();
        }

        const segmentAsr = asr.filter((finding) => overlap(finding.startMs, finding.endMs, startMs, endMs));
        const segmentOcr = ocr.filter((finding) => overlap(finding.startMs, finding.endMs, startMs, endMs));
        const segmentRisks = multimodal.risks.filter((risk) => risk.description.trim().length > 0);
        const confidence = confidenceOf(segmentAsr, segmentOcr, multimodal);
        const valueLabel = segmentRisks.length > 0
          ? "risk"
          : confidence < 0.5
            ? "low_quality"
            : confidence >= 0.8
              ? "high"
              : "usable";

        segments.push({
          id: `seg_${input.taskId.slice(-8)}${String(segments.length + 1).padStart(4, "0")}`,
          sourceAssetId: asset.id,
          startMs,
          endMs,
          valueLabel,
          confidence,
          evidence: {
            ...(segmentAsr.length ? { asr: segmentAsr } : {}),
            ...(segmentOcr.length ? { ocr: segmentOcr } : {}),
            ...(multimodal.labels.length ? {
              vision: multimodal.labels.map((label) => ({
                startMs,
                endMs,
                label: label.label,
                ...(label.description ? { description: label.description } : {}),
                confidence: label.confidence
              }))
            } : {})
          },
          risks: segmentRisks
        });
      }
    }

    if (!segments.length) throw safeFailure();
    try {
      return AnalysisMapV1.parse({ version: "analysis_map.v1", taskId: input.taskId, segments });
    } catch {
      throw safeFailure();
    }
  }
}
