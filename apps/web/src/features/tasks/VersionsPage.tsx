import type { TaskStatus } from "@ad-agent/contracts";

interface VersionItem {
  id: string;
  versionNumber: number;
  renderReceipt: unknown | null;
  createdAt: number;
}

export function VersionsPage({ taskTitle, status, costFen, versions, onReview }: {
  taskTitle: string;
  status: TaskStatus;
  costFen: number;
  versions: VersionItem[];
  onReview: () => void;
}) {
  return <section className="page-section">
    <header className="page-heading"><div><h1>成品与版本</h1><p>{taskTitle} · 保留每次生成和审核记录。</p></div></header>
    <div className="table-frame"><table><thead><tr><th>版本</th><th>结果</th><th>内容</th><th>费用</th><th>操作</th></tr></thead><tbody>
      {versions.map((version, index) => {
        const rendered = version.renderReceipt !== null;
        const latest = index === 0;
        return <tr key={version.id}><td>V{version.versionNumber}</td><td><span className={`status-badge ${rendered ? "status-info" : ""}`}>{rendered ? status === "approved" ? "已批准" : "待审核" : "分析计划"}</span></td><td>{rendered ? "模拟渲染结果" : "分析计划"}</td><td>{latest && rendered ? `¥${(costFen / 100).toFixed(2)}` : "-"}</td><td>{latest && rendered && status !== "approved" ? <button className="text-button" onClick={onReview}>审核</button> : <span>-</span>}</td></tr>;
      })}
    </tbody></table></div>
  </section>;
}
