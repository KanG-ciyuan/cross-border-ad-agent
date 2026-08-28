import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import type { CanvasNodeV1 } from "@ad-agent/contracts";
import { AlertTriangle, Check, Clock3, Film, LockKeyhole, Sparkles } from "lucide-react";

export type AdFlowNodeData = Record<string, unknown> & {
  contract: CanvasNodeV1;
  preview?: string;
};

export type AdFlowNode = Node<AdFlowNodeData, "adflow">;

const statusContent = {
  needs_configuration: { label: "待配置", icon: Clock3 },
  running: { label: "执行中", icon: Sparkles },
  awaiting_confirmation: { label: "待确认", icon: Clock3 },
  confirmed: { label: "已确认", icon: Check },
  locked: { label: "已锁定", icon: LockKeyhole },
  stale: { label: "上游已变更", icon: AlertTriangle },
  failed: { label: "失败", icon: AlertTriangle }
} as const;

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function AdFlowCanvasNodeComponent({ data, selected }: NodeProps<AdFlowNode>) {
  const node = data.contract;
  const status = statusContent[node.status];
  const StatusIcon = status.icon;
  const facts = getStringList(node.config.facts);
  const shots = getStringList(node.config.shots);
  const excerpt = getString(node.config.excerpt);
  const summary = getString(node.config.summary);
  const stage = getString(node.config.stage);
  const showsPreview = ["product_source", "product_asset", "character_asset", "scene_asset"].includes(node.type);

  return (
    <article className={`xy-canvas-node status-${node.status} ${selected ? "is-selected" : ""}`}>
      {node.inputs.map((port, index) => (
        <Handle
          className={`xy-handle type-${port.dataType}`}
          id={port.id}
          key={`input-${port.id}`}
          position={Position.Left}
          style={{ top: 72 + index * 26 }}
          title={`输入：${port.label}`}
          type="target"
        />
      ))}
      <button aria-label={`选择节点：${node.title}`} className="xy-node-select" type="button">
        <span className="xy-node-stage">{stage}</span>
        <span className="xy-node-title"><strong>{node.title}</strong><small>v{node.version}</small></span>
        <span className="xy-node-status"><StatusIcon size={12} />{status.label}</span>
      </button>
      <div className="xy-node-content">
        {showsPreview && data.preview ? <img alt={`${node.title}预览`} src={data.preview} /> : null}
        {facts.length > 0 ? <ul>{facts.map((fact) => <li key={fact}><Check size={11} />{fact}</li>)}</ul> : null}
        {shots.length > 0 ? <div className="xy-shot-grid">{shots.map((shot, index) => <span key={shot}>{index + 1}. {shot}</span>)}</div> : null}
        {excerpt ? <p className="xy-script">{excerpt}</p> : null}
        {node.type === "video_shot" ? <div className="xy-video-placeholder"><Film size={18} /><span>镜头任务尚未提交</span></div> : null}
        {summary ? <p>{summary}</p> : null}
      </div>
      <div className="xy-node-ports">
        <span>{node.inputs.length} 项输入</span><span>{node.outputs.length} 项输出</span>
      </div>
      {node.outputs.map((port, index) => (
        <Handle
          className={`xy-handle type-${port.dataType}`}
          id={port.id}
          key={`output-${port.id}`}
          position={Position.Right}
          style={{ top: 72 + index * 26 }}
          title={`输出：${port.label}`}
          type="source"
        />
      ))}
    </article>
  );
}

export const AdFlowCanvasNode = memo(AdFlowCanvasNodeComponent);
