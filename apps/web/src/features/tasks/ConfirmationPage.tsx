import { useState } from "react";
import { ReferenceGallery } from "./ReferenceGallery";
import { StoryboardGrid } from "./StoryboardGrid";

export function ConfirmationPage({
  taskTitle = "KLIN 厨房重油清洁剂",
  estimatedFen = 1800,
  limitFen = 4500,
  onGenerate,
  onBack
}: {
  taskTitle?: string;
  estimatedFen?: number;
  limitFen?: number;
  onGenerate: () => void | Promise<void>;
  onBack: () => void;
}) {
  const [checks, setChecks] = useState({ reference: false, storyboard: false, cost: false, risk: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toggle = (key: keyof typeof checks) => setChecks((current) => ({ ...current, [key]: !current[key] }));
  const generate = async () => {
    if (!Object.values(checks).every(Boolean)) return setError("请完成全部四项确认");
    setError("");
    setSubmitting(true);
    try {
      await onGenerate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };
  return <section className="page-section">
    <header className="page-heading"><div><h1>确认 AI 广告方案</h1><p>{taskTitle} · 图片生成模式</p></div><button className="button" onClick={onBack}>返回任务</button></header>
    <div className="stepper"><span className="active"><b>✓</b>提交资料</span><span className="active"><b>✓</b>AI 分析</span><span className="active"><b>3</b>确认方案</span><span><b>4</b>生成审核</span></div>
    <div className="create-layout"><div>
      <section className="surface"><div className="surface-heading"><h2>产品参考图</h2><span className="status-badge status-warning">3 张待确认</span></div><ReferenceGallery /><label className="approval-line"><input type="checkbox" checked={checks.reference} onChange={() => toggle("reference")} /><span><strong>我已核对候选三视图</strong><small>来源信息只显示在本确认界面。请核对 Logo、颜色、瓶型和容量。</small></span></label></section>
      <section className="surface"><div className="surface-heading"><h2>九宫格分镜</h2><span className="status-badge status-info">预计 26 秒</span></div><StoryboardGrid /></section>
      <section className="surface"><h2>印尼语脚本摘要</h2><p className="script-copy">Noda minyak membandel di dapur? Semprotkan produk pada permukaan berminyak, tunggu sejenak, lalu lap hingga bersih.</p><button className="button">编辑脚本</button></section>
    </div><aside className="summary-rail">
      <div className="notice success"><strong>合规初审通过</strong><p>未使用杀菌、无毒、食品级或绝对安全等无证明表述。</p></div>
      <section className="surface"><h2>本次生成计划</h2><dl><div><dt>AI 视频镜头</dt><dd>6 个</dd></div><div><dt>真实图合成</dt><dd>3 个</dd></div><div><dt>预计费用</dt><dd>¥{(estimatedFen / 100).toFixed(2)}</dd></div><div><dt>任务费用上限</dt><dd>¥{(limitFen / 100).toFixed(2)}</dd></div></dl></section>
      <section className="surface"><h2>生成前确认</h2><div className="approval-checks"><label><input type="checkbox" checked={checks.storyboard} onChange={() => toggle("storyboard")} />分镜顺序和卖点正确</label><label><input type="checkbox" checked={checks.cost} onChange={() => toggle("cost")} />同意本任务费用上限</label><label><input type="checkbox" checked={checks.risk} onChange={() => toggle("risk")} />了解实验镜头一致性风险</label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button primary wide" disabled={submitting} onClick={() => void generate()}>{submitting ? "正在提交确认" : "确认并生成初版"}</button></section>
    </aside></div>
  </section>;
}
