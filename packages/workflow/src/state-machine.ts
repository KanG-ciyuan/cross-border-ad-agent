import type { TaskStatus } from "@ad-agent/contracts";

export type WorkflowEvent =
  | "upload_complete"
  | "start_analysis"
  | "request_material"
  | "require_generation_approval"
  | "analysis_ready"
  | "approve_plan"
  | "start_preview"
  | "preview_complete"
  | "request_revision"
  | "submit_revision"
  | "approve_preview"
  | "final_render_complete"
  | "approve_generation"
  | "start_render"
  | "render_complete"
  | "render_failed"
  | "retry_render"
  | "approve_content"
  | "approve_final"
  | "cancel";

const transitions: Partial<Record<TaskStatus, Partial<Record<WorkflowEvent, TaskStatus>>>> = {
  draft: { upload_complete: "uploaded", cancel: "cancelled" },
  uploaded: { start_analysis: "analyzing", cancel: "cancelled" },
  analyzing: {
    request_material: "needs_material",
    require_generation_approval: "awaiting_generation_approval",
    analysis_ready: "awaiting_plan_approval",
    cancel: "cancelled"
  },
  awaiting_plan_approval: {
    approve_plan: "previewing",
    request_revision: "revision_requested",
    cancel: "cancelled"
  },
  previewing: {
    preview_complete: "awaiting_preview_review",
    render_failed: "failed_retryable",
    cancel: "cancelled"
  },
  awaiting_preview_review: {
    approve_preview: "final_rendering",
    request_revision: "revision_requested",
    cancel: "cancelled"
  },
  revision_requested: {
    submit_revision: "awaiting_plan_approval",
    cancel: "cancelled"
  },
  final_rendering: {
    final_render_complete: "awaiting_final_approval",
    render_failed: "failed_retryable",
    cancel: "cancelled"
  },
  awaiting_final_approval: {
    approve_final: "approved",
    request_revision: "revision_requested",
    cancel: "cancelled"
  },
  needs_material: { upload_complete: "uploaded", cancel: "cancelled" },
  awaiting_generation_approval: {
    approve_generation: "ready_to_render",
    cancel: "cancelled"
  },
  ready_to_render: { start_render: "rendering", cancel: "cancelled" },
  rendering: {
    render_complete: "pending_content_review",
    render_failed: "failed_retryable",
    cancel: "cancelled"
  },
  pending_content_review: {
    approve_content: "pending_final_approval",
    render_failed: "failed_retryable",
    cancel: "cancelled"
  },
  pending_final_approval: {
    approve_final: "approved",
    render_failed: "failed_retryable",
    cancel: "cancelled"
  },
  failed_retryable: { retry_render: "ready_to_render", cancel: "cancelled" }
};

export function transition(state: TaskStatus, event: WorkflowEvent): TaskStatus {
  const next = transitions[state]?.[event];
  if (!next) {
    throw new Error(`INVALID_TRANSITION: ${state} -> ${event}`);
  }
  return next;
}
