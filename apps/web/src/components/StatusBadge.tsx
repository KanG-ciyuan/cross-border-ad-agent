import type { TaskStatus } from "@ad-agent/contracts";

const statusLabels: Record<TaskStatus, string> = {
  draft: "草稿",
  uploaded: "等待分析",
  analyzing: "分析中",
  needs_material: "需要补充素材",
  awaiting_plan_approval: "等待方案确认",
  previewing: "生成低清预览",
  awaiting_preview_review: "待预览审核",
  revision_requested: "等待改稿",
  final_rendering: "生成高清成片",
  awaiting_final_approval: "待最终批准",
  awaiting_generation_approval: "等待方案确认",
  ready_to_render: "等待生成",
  rendering: "生成中",
  pending_content_review: "待内容审核",
  pending_final_approval: "待最终批准",
  approved: "已批准",
  failed_retryable: "可重试",
  cancelled: "已取消"
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const tone = status === "approved" ? "success" : status.includes("pending") || status.includes("awaiting") ? "warning" : status === "failed_retryable" ? "danger" : "info";
  return <span className={`status-badge status-${tone}`}>{statusLabels[status]}</span>;
}
