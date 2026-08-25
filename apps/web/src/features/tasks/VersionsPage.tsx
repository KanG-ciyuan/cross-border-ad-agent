import type { TaskStatus } from "@ad-agent/contracts";
import { Download } from "lucide-react";

interface VersionItem {
  id: string;
  versionNumber: number;
  renderReceipt: unknown | null;
  outputAssetId?: string;
  createdAt: number;
}

export function VersionsPage({ taskId, taskTitle, status, costFen, versions, onReview }: {
  taskId: string;
  taskTitle: string;
  status: TaskStatus;
  costFen: number;
  versions: VersionItem[];
  onReview: () => void;
}) {
  const latestOutput = versions.find((version) => version.outputAssetId);
  const latestOutputUrl = latestOutput?.outputAssetId
    ? `/api/tasks/${taskId}/assets/${latestOutput.outputAssetId}`
    : undefined;
  return <section className="page-section">
    <header className="page-heading"><div><h1>成品与版本</h1><p>{taskTitle} · 保留每次生成和审核记录。</p></div></header>
    {latestOutputUrl ? <section className="output-preview" aria-label="真实 MP4 成品">
      <div><strong>真实 MP4 成品</strong><span>V{latestOutput?.versionNumber} · 9:16 竖屏</span></div>
      <video aria-label={`V${latestOutput?.versionNumber} 视频预览`} controls playsInline preload="metadata" src={latestOutputUrl} />
    </section> : null}
    <div className="table-frame"><table><thead><tr><th>版本</th><th>结果</th><th>内容</th><th>费用</th><th>操作</th></tr></thead><tbody>
      {versions.map((version, index) => {
        const rendered = version.renderReceipt !== null;
        const latest = index === 0;
        const outputUrl = version.outputAssetId ? `/api/tasks/${taskId}/assets/${version.outputAssetId}` : undefined;
        return <tr key={version.id}><td>V{version.versionNumber}</td><td><span className={`status-badge ${rendered ? "status-info" : ""}`}>{rendered ? status === "approved" ? "已批准" : "待审核" : "分析计划"}</span></td><td>{outputUrl ? "真实 MP4 成品" : "分析计划"}</td><td>{latest && rendered ? `¥${(costFen / 100).toFixed(2)}` : "-"}</td><td><div className="table-actions">{latest && rendered && status !== "approved" ? <button className="text-button" onClick={onReview}>审核</button> : null}{outputUrl ? <a className="text-button" aria-label={`下载 V${version.versionNumber}`} href={`${outputUrl}?download=1`} download><Download size={15} />下载</a> : null}{!outputUrl && !(latest && rendered && status !== "approved") ? <span>-</span> : null}</div></td></tr>;
      })}
    </tbody></table></div>
  </section>;
}
