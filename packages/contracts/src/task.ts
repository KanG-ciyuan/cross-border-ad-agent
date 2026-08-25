import { z } from "zod";

export const TaskGoal = z.enum(["complete_creation", "edit_only"]);
export const InputMode = z.enum(["video", "product_images", "mixed"]);
export const AllowedOperation = z.enum([
  "trim",
  "concat",
  "captions",
  "voiceover",
  "stickers",
  "transitions",
  "music"
]);
export const ReferenceGeneration = z.enum(["three_view", "nine_grid"]);

export const TaskStatus = z.enum([
  "draft",
  "uploaded",
  "analyzing",
  "needs_material",
  "awaiting_generation_approval",
  "ready_to_render",
  "rendering",
  "pending_content_review",
  "pending_final_approval",
  "approved",
  "failed_retryable",
  "cancelled"
]);

const baseTaskFields = {
  market: z.literal("ID"),
  platform: z.literal("tiktok")
};

const productInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  facts: z.array(z.string().trim().min(1).max(240)).min(1),
  approvedClaims: z.array(z.string().trim().min(1).max(240)),
  prohibitedClaims: z.array(z.string().trim().min(1).max(240)),
  usage: z.string().trim().min(1).max(500),
  callToAction: z.string().trim().min(1).max(240).optional()
});

const completeCreationInput = z.strictObject({
  ...baseTaskFields,
  goal: z.literal("complete_creation"),
  inputMode: InputMode,
  product: productInput,
  referenceGeneration: z.array(ReferenceGeneration).max(2).default([]),
  generatedShotBriefs: z.array(z.string().trim().min(1).max(500)).optional(),
  allowedOperations: z.array(AllowedOperation).min(1).optional()
}).superRefine((input, context) => {
  if (new Set(input.referenceGeneration).size !== input.referenceGeneration.length) {
    context.addIssue({
      code: "custom",
      path: ["referenceGeneration"],
      message: "Reference generation choices must be unique"
    });
  }
});

const editOnlyInput = z.strictObject({
  ...baseTaskFields,
  goal: z.literal("edit_only"),
  editInstructions: z.string().trim().min(1).max(1000).optional(),
  allowedOperations: z.array(AllowedOperation).min(1)
}).superRefine((input, context) => {
  if (new Set(input.allowedOperations).size !== input.allowedOperations.length) {
    context.addIssue({
      code: "custom",
      path: ["allowedOperations"],
      message: "Allowed operations must be unique"
    });
  }
});

export const TaskCreateInput = z.union([
  completeCreationInput,
  editOnlyInput
]);

export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
export type TaskGoal = z.infer<typeof TaskGoal>;
export type TaskStatus = z.infer<typeof TaskStatus>;
