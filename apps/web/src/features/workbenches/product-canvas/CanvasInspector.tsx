import type { CanvasNodeV1 } from "@ad-agent/contracts";
import { AlertTriangle, Check, GitBranch, LockKeyhole, Play, RefreshCw } from "lucide-react";

const statusLabels = {
  needs_configuration: "待配置",
  running: "执行中",
  awaiting_confirmation: "待人工确认",
  confirmed: "已确认",
  locked: "已锁定",
  stale: "上游已变更，需重新确认",
  failed: "执行失败"
} as const;

export function CanvasInspector({
  demo,
  node,
  onConfirm,
  onRegenerate
}: {
  demo: boolean;
  node: CanvasNodeV1 | null;
  onConfirm: () => void;
  onRegenerate: () => void;
}) {
  if (!node) {
    return <aside className="canvas-inspector canvas-inspector-empty"><GitBranch size={22} /><h2>选择一个节点</h2><p>查看它接收了哪些上游数据，以及会向下游传递什么。</p></aside>;
  }

  return (
    <aside className="canvas-inspector">
      <div className="surface-heading">
        <div><span className="inspector-kicker">节点设置</span><h2>节点设置 · {node.title}</h2></div>
        <span className={`node-state-pill state-${node.status}`}>{statusLabels[node.status]}</span>
      </div>
      <p className="inspector-description">{node.description}</p>

      <section className="inspector-section">
        <h3>结构化输入</h3>
        {node.inputs.length > 0 ? <div className="inspector-port-list">{node.inputs.map((port) => <div key={port.id}><span className={`port-dot type-${port.dataType}`} /><span><strong>{port.label}</strong><small>{port.dataType}</small></span>{port.required ? <b>必需</b> : null}</div>)}</div> : <p className="empty-copy">这是源节点，不依赖上游输入。</p>}
      </section>

      <section className="inspector-section">
        <h3>结构化输出</h3>
        <div className="inspector-port-list">{node.outputs.map((port) => <div key={port.id}><span className={`port-dot type-${port.dataType}`} /><span><strong>{port.label}</strong><small>{port.dataType}</small></span></div>)}</div>
      </section>

      <section className="inspector-section">
        <h3>数据血缘</h3>
        {node.derivedFrom.length > 0 ? <div className="lineage-list">{node.derivedFrom.map((source) => <span key={source.nodeId}><GitBranch size={13} />{source.nodeId}<b>v{source.version}</b></span>)}</div> : <p className="empty-copy">来源：用户上传资产</p>}
        <div className="lineage-meta"><span>当前版本 <b>v{node.version}</b></span><span>{node.locked ? <><LockKeyhole size={12} /> 已锁定</> : "可更新"}</span></div>
      </section>

      {node.status === "stale" ? <div className="approval-note"><AlertTriangle size={17} /><span><strong>下游结果已失效</strong>上游版本发生变化，需要重新生成或确认此节点。</span></div> : <div className="approval-note"><Check size={17} /><span><strong>人工确认边界</strong>确认后才允许此节点结果进入后续生成。</span></div>}

      <div className="canvas-boundary">
        <strong>{demo ? "演示边界" : "执行边界"}</strong>
        <p>{demo ? "当前画布交互和数据血缘可用；尚未接入真实 MiniMax、生图模型和云端资产持久化。" : "Agent 只会执行人工确认后的节点计划。"}</p>
      </div>

      <div className="inspector-actions">
        <button className="button" onClick={onRegenerate} type="button"><RefreshCw size={15} />局部重生成</button>
        <button className="button primary" onClick={onConfirm} type="button">{node.type === "video_shot" ? <Play size={15} /> : <LockKeyhole size={15} />}确认并锁定</button>
      </div>
    </aside>
  );
}
