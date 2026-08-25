import { z } from "zod";

import { TaskGoal, TaskStatus } from "./task";

export const ApiErrorCode = z.enum([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "REFERENCE_APPROVAL_REQUIRED",
  "STORYBOARD_APPROVAL_REQUIRED",
  "COST_APPROVAL_REQUIRED",
  "RISK_APPROVAL_REQUIRED",
  "EDIT_ONLY_GENERATION_FORBIDDEN",
  "COST_LIMIT_EXCEEDED",
  "UNSUPPORTED_MEDIA_TYPE",
  "FILE_TOO_LARGE"
]);

export const ApiError = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCode,
    message: z.string().min(1),
    field: z.string().optional(),
    retryable: z.boolean().default(false)
  })
});

export const TaskSummary = z.strictObject({
  id: z.string().regex(/^tsk_[A-Za-z0-9]{8,}$/),
  goal: TaskGoal,
  productName: z.string().min(1).nullable(),
  productThumbnailAssetId: z.string().regex(/^ast_[A-Za-z0-9]{8,}$/).nullable(),
  market: z.literal("ID"),
  platform: z.literal("tiktok"),
  status: TaskStatus,
  costFen: z.number().int().nonnegative(),
  updatedAt: z.number().int().positive()
});

export type ApiError = z.infer<typeof ApiError>;
export type TaskSummary = z.infer<typeof TaskSummary>;
