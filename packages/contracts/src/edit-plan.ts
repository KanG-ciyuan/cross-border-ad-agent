import { z } from "zod";

const id = (prefix: string) => z.string().regex(
  new RegExp(`^${prefix}_[A-Za-z0-9-]{8,}$`),
  `Expected an opaque ${prefix} identifier`
);

export const AssetOrigin = z.enum(["uploaded", "generated", "derived"]);
export const OutputRatio = z.enum(["9:16", "16:9"]);

const clip = z.strictObject({
  id: id("clp"),
  sourceAssetId: id("ast"),
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

const sourceWindow = z.strictObject({
  sourceAssetId: id("ast"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive()
}).refine((value) => value.endMs > value.startMs, {
  path: ["endMs"],
  message: "Source window end must be after its start"
});

const processing = z.strictObject({
  cropMode: z.enum(["crop", "contain"]),
  muteOriginalAudio: z.boolean(),
  captions: z.enum(["preserve", "generate", "none"]).optional(),
  voiceover: z.enum(["preserve", "replace", "none"]).optional(),
  music: z.enum(["preserve", "replace", "none"]).optional()
});

const explanation = z.strictObject({
  clipId: id("clp").optional(),
  reason: z.string().trim().min(1).max(500)
});

const approval = z.strictObject({
  id: id("apr"),
  kind: z.enum(["plan", "preview", "risk", "content", "final"]),
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
    language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
    ratio: OutputRatio,
    durationSeconds: z.number().positive().max(600)
  }).superRefine((output, context) => {
    const matchesRatio = output.ratio === "9:16"
      ? output.width * 16 === output.height * 9
      : output.width * 9 === output.height * 16;
    if (!matchesRatio) {
      context.addIssue({
        code: "custom",
        path: ["ratio"],
        message: "Output dimensions must match the selected ratio"
      });
    }
  }),
  tracks: z.array(track).min(1),
  sourceWindows: z.array(sourceWindow).min(1).optional(),
  processing,
  explanations: z.array(explanation).min(1),
  approvals: z.array(approval).default([]),
  receipt: receipt.optional()
});

export type EditPlanV1 = z.infer<typeof EditPlanV1>;
export type OutputRatio = z.infer<typeof OutputRatio>;
