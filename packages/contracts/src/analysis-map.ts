import { z } from "zod";

const id = (prefix: string) => z.string().regex(
  new RegExp(`^${prefix}_[A-Za-z0-9-]{8,}$`),
  `Expected an opaque ${prefix} identifier`
);

const confidence = z.number().min(0).max(1);

const timedEvidenceFields = {
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  confidence: confidence.optional()
};

const completeInterval = <T extends { startMs: number; endMs: number }>(value: T) => (
  value.endMs > value.startMs
);

const asrEvidence = z.strictObject({
  ...timedEvidenceFields,
  text: z.string().trim().min(1),
  language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).optional()
}).refine(completeInterval, {
  path: ["endMs"],
  message: "ASR evidence end must be after its start"
});

const ocrEvidence = z.strictObject({
  ...timedEvidenceFields,
  text: z.string().trim().min(1)
}).refine(completeInterval, {
  path: ["endMs"],
  message: "OCR evidence end must be after its start"
});

const visionEvidence = z.strictObject({
  ...timedEvidenceFields,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500).optional()
}).refine(completeInterval, {
  path: ["endMs"],
  message: "Vision evidence end must be after its start"
});

const segmentEvidence = z.strictObject({
  asr: z.array(asrEvidence).optional(),
  ocr: z.array(ocrEvidence).optional(),
  vision: z.array(visionEvidence).optional()
});

const riskFinding = z.strictObject({
  kind: z.enum([
    "watermark",
    "prohibited_claim",
    "personal_data",
    "unsafe_action",
    "copyright",
    "other"
  ]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string().trim().min(1).max(500),
  confidence
});

export const SegmentValueLabel = z.enum([
  "high",
  "usable",
  "repeated",
  "low_quality",
  "risk"
]);

const analysisSegment = z.strictObject({
  id: id("seg").optional(),
  sourceAssetId: id("ast"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  valueLabel: SegmentValueLabel,
  confidence,
  evidence: segmentEvidence.optional(),
  risks: z.array(riskFinding).default([])
}).refine(completeInterval, {
  path: ["endMs"],
  message: "Analysis segment end must be after its start"
});

export const AnalysisMapV1 = z.strictObject({
  version: z.literal("analysis_map.v1"),
  taskId: id("tsk").optional(),
  segments: z.array(analysisSegment).min(1)
});

export type AnalysisMapV1 = z.infer<typeof AnalysisMapV1>;
export type SegmentValueLabel = z.infer<typeof SegmentValueLabel>;
