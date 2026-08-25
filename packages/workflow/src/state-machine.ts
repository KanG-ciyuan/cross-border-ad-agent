import type { TaskStatus } from "@ad-agent/contracts";

export type WorkflowEvent =
  | "upload_complete"
  | "start_analysis"
  | "request_material"
  | "require_generation_approval"
  | "analysis_ready"
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
    analysis_ready: "ready_to_render",
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
