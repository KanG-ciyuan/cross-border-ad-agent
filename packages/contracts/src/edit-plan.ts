import { z } from "zod";

const id = (prefix: string) => z.string().regex(
  new RegExp(`^${prefix}_[A-Za-z0-9-]{8,}$`),
  `Expected an opaque ${prefix} identifier`
);

export const AssetOrigin = z.enum(["uploaded", "generated", "derived"]);

const clip = z.strictObject({
  id: id("clp"),
  assetId: id("ast"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  origin: AssetOrigin,
  approvalId: id("apr").optional(),
  volume: z.number().min(0).max(2).optional(),
  transition: z.enum(["cut", "crossfade", "slide", "zoom"]).optional()
}).refine((value) => value.endMs > value.startMs, {
  path: ["endMs"],
  message: "Clip end must be after its start"
});

const track = z.strictObject({
  id: id("trk"),
  type: z.enum(["video", "audio", "captions", "graphics"]),
  clips: z.array(clip).min(1)
});

const cost = z.strictObject({
  currency: z.literal("CNY"),
  estimatedFen: z.number().int().nonnegative(),
  limitFen: z.number().int().positive()
}).refine((value) => value.estimatedFen <= value.limitFen, {
  path: ["estimatedFen"],
  message: "Estimated cost must not exceed the approved limit"
});

const approval = z.strictObject({
  id: id("apr"),
  kind: z.enum(["reference", "storyboard", "cost", "risk", "content", "final"]),
  approvedAt: z.number().int().positive(),
  approvedBy: z.string().trim().min(1)
});

const receipt = z.strictObject({
  id: id("rcp"),
  provider: z.string().trim().min(1).max(80),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputAssetId: id("ast"),
  completedAt: z.number().int().positive()
});

export const EditPlanV1 = z.strictObject({
  version: z.literal("edit_plan.v1"),
  taskId: id("tsk"),
  output: z.strictObject({
    width: z.number().int().positive().max(4320),
    height: z.number().int().positive().max(7680),
    fps: z.number().int().min(1).max(120),
    language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/)
  }),
  tracks: z.array(track).min(1),
  cost,
  approvals: z.array(approval).default([]),
  receipt: receipt.optional()
});

export type EditPlanV1 = z.infer<typeof EditPlanV1>;
