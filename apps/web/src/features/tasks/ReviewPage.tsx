import { useState } from "react";
import { Check, Pause, RotateCcw, ShieldCheck } from "lucide-react";

interface ReviewPageProps {
  taskTitle?: string;
  versionNumber?: number;
  initialContentApproved?: boolean;
  onRetryShot: (shot: number) => void;
  onApproveContent: () => void | Promise<void>;
  onApproveFinal: () => void | Promise<void>;
}

export function ReviewPage({
  taskTitle = "KLIN 500 ml",
  versionNumber = 3,
  initialContentApproved = false,
  onRetryShot,
  onApproveContent,
  onApproveFinal
}: ReviewPageProps) {
  const [checks, setChecks] = useState([false, false, false]);
  const [contentApproved, setContentApproved] = useState(initialContentApproved);
  const [submitting, setSubmitting] = useState<"content" | "final" | null>(null);
  const [error, setError] = useState("");
  const toggle = (index: number) => setChecks((current) =>
    current.map((value, item) => item === index ? !value : value));

  const approve = async () => {
    if (!checks.every(Boolean) || submitting) return;
    setError("");
    setSubmitting("content");
    try {
      await onApproveContent();
      setContentApproved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内容审核提交失败");
    } finally {
      setSubmitting(null);
    }
  };

  const approveFinal = async () => {
    if (!contentApproved || submitting) return;
    setError("");
    setSubmitting("final");
    try {
      await onApproveFinal();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "最终批准提交失败");
    } finally {
      setSubmitting(null);
    }
  };

  return <section className="page-section">
    <header className="page-heading"><div><h1>审核广告初版</h1><p>{taskTitle} · 版本 V{versionNumber} · 模拟生成结果</p></div><span className="status-badge status-info">待内容审核</span></header>
    <div className="review-layout"><div>
      <div className="video-player"><div className="video-canvas"><div className="product-stage"><ShieldCheck size={64} /><strong>{taskTitle}</strong></div><span className="selling-line">Cepat bantu lunakkan minyak</span><span className="caption-line">Semprot, tunggu sejenak, lalu lap hingga bersih.</span></div><div className="player-controls"><button className="icon-button light" aria-label="播放或暂停"><Pause size={16} /></button><span>00:10</span><div className="progress"><i /></div><span>00:26</span></div></div>
      <section className="surface"><h2>镜头时间线</h2><div className="timeline"><span className="track real">真实素材</span><span className="track generated">模拟镜头</span><span className="track caption-track">印尼语字幕</span></div></section>
    </div><div>
      <section className="surface"><div className="surface-heading"><h2>逐镜头审核</h2><span className="status-badge status-warning">1 项需注意</span></div>
        <div className="scene-row"><b>1</b><span><strong>问题开场</strong><small>灶台油污清晰，无产品信息。</small></span><i><Check size={14} />通过</i></div>
        <div className="scene-row"><b>2</b><span><strong>镜头 2 已通过</strong><small>真实正面图，Logo 和容量信息清晰。</small></span><i><Check size={14} />通过</i></div>
        <div className="scene-row attention"><b>3</b><span><strong>喷洒动作</strong><small>模拟生成镜头，请人工核对喷头形状。</small><button className="button" onClick={() => onRetryShot(3)}><RotateCcw size={15} />重新生成镜头 3</button></span><i>需确认</i></div>
      </section>
      <section className="surface"><h2>审核结论</h2><div className="approval-checks">
        {["产品包装、颜色、Logo 和容量正确", "印尼语字幕与配音表达可用", "所有镜头均已人工检查"].map((label, index) => <label key={label}><input type="checkbox" checked={checks[index]} onChange={() => toggle(index)} disabled={Boolean(submitting)} />{label}</label>)}
      </div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="review-actions">
        <button className="button primary" disabled={!checks.every(Boolean) || Boolean(submitting) || contentApproved} onClick={() => void approve()}>{submitting === "content" ? "正在提交审核" : contentApproved ? "内容审核已通过" : "通过内容审核"}</button>
        <button className="button" disabled={!contentApproved || Boolean(submitting)} onClick={() => void approveFinal()}>{submitting === "final" ? "正在最终批准" : "最终批准"}</button>
      </div></section>
    </div></div>
  </section>;
}
