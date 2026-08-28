import { z } from "zod";

const id = (prefix: string) => z.string().regex(
  new RegExp(`^${prefix}_[A-Za-z0-9-]{8,}$`),
  `Expected an opaque ${prefix} identifier`
);

const confidence = z.number().min(0).max(1);

const qualityIssue = z.strictObject({
  kind: z.enum([
    "resolution",
    "blur",
    "exposure",
    "crop",
    "compression",
    "subject_scale",
    "label_legibility",
    "other"
  ]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string().trim().min(1).max(500),
  confidence
});

const factCandidate = z.strictObject({
  field: z.enum([
    "brand",
    "product_name",
    "capacity",
    "color",
    "package_shape",
    "material",
    "closure",
    "label_text",
    "other"
  ]),
  value: z.string().trim().min(1).max(500),
  certainty: z.enum(["observed", "user_provided", "uncertain"]),
  confidence,
  evidence: z.string().trim().min(1).max(500)
});

export const ProductAnalysisV1 = z.strictObject({
  version: z.literal("product_analysis.v1"),
  taskId: id("tsk"),
  sourceAssetId: id("ast"),
  quality: z.strictObject({
    score: confidence,
    decision: z.enum(["usable", "usable_with_enhancement", "needs_reupload"]),
    issues: z.array(qualityIssue).max(20)
  }),
  factCandidates: z.array(factCandidate).max(50),
  immutableConstraints: z.array(z.string().trim().min(1).max(500)).max(30),
  missingFacts: z.array(z.string().trim().min(1).max(240)).max(30),
  recommendation: z.strictObject({
    action: z.enum(["use_original", "upscale", "enhance", "rebuild", "request_more_images"]),
    reason: z.string().trim().min(1).max(1000)
  }),
  requiresHumanConfirmation: z.literal(true)
});

export type ProductAnalysisV1 = z.infer<typeof ProductAnalysisV1>;
