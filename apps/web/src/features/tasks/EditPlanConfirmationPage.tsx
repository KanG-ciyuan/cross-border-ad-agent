import { ArrowLeft, CheckCircle2, Film, ShieldAlert } from "lucide-react";

export function EditPlanConfirmationPage({ taskTitle, plan, analysisMap, onApprove, onBack }: {
  taskTitle?: string;
  plan: any;
  analysisMap?: any;
  onApprove: () => void | Promise<void>;
  onBack: () => void;
}) {
  const clips = plan?.tracks?.flatMap((track: any) => track.type === "video" ? track.clips : []) ?? [];
  const segments = analysisMap?.analysisMap?.segments ?? analysisMap?.segments ?? [];
  return <section className="page-section">
    <header className="page-heading"><div><h1>确认剪辑方案</h1><p>{taskTitle ?? "已有素材广告"} · Agent 已完成全片理解和时间线规划</p></div><button className="button" onClick={onBack}><ArrowLeft size={16} />返回任务</button></header>
    <div className="create-layout"><div>
      <section className="surface"><div className="surface-heading"><h2>素材价值地图</h2><span className="status-badge status-info">{segments.length} 个分析片段</span></div>
        <div className="value-map">{segments.map((segment: any) => <div className="scene-row" key={segment.id ?? `${segment.sourceAssetId}-${segment.startMs}`}><Film size={17} /><span><strong>{segment.valueLabel === "high" ? "高价值" : segment.valueLabel === "risk" ? "风险" : "可用"}</strong><small>{segment.sourceAssetId} · {(segment.startMs / 1000).toFixed(1)}s - {(segment.endMs / 1000).toFixed(1)}s · 置信度 {Math.round(segment.confidence * 100)}%</small></span>{segment.risks?.length ? <i><ShieldAlert size={14} />需注意</i> : <i><CheckCircle2 size={14} />可使用</i>}</div>)}</div>
      </section>
      <section className="surface"><div className="surface-heading"><h2>成片时间线</h2><span className="status-badge status-warning">待确认</span></div><div className="timeline-plan">{clips.map((clip: any, index: number) => <div className="timeline-shot" key={clip.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{clip.sourceAssetId}</strong><small>{(clip.startMs / 1000).toFixed(1)}s - {(clip.endMs / 1000).toFixed(1)}s · {clip.transition === "crossfade" ? "交叉淡化" : "直接切换"}</small></span></div>)}</div></section>
    </div><aside className="summary-rail"><section className="surface"><h2>本次输出</h2><dl><div><dt>目标时长</dt><dd>{plan?.output?.durationSeconds} 秒</dd></div><div><dt>画幅</dt><dd>{plan?.output?.ratio}</dd></div><div><dt>原声</dt><dd>{plan?.processing?.muteOriginalAudio ? "移除" : "保留"}</dd></div><div><dt>字幕 / 配音</dt><dd>{plan?.processing?.captions === "generate" ? "印尼语字幕" : "按要求处理"}</dd></div></dl></section><section className="surface"><h2>确认后会发生什么</h2><p>系统将按这份时间线生成完整低清预览。预览接近最终成片，只降低分辨率和码率；之后你可以用自然语言要求改稿。</p><button className="button primary wide" onClick={() => void onApprove()}>确认方案，生成低清预览</button></section></aside></div>
  </section>;
}
