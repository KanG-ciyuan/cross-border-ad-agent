import type { TaskStatus } from "@ad-agent/contracts";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { StatusBadge } from "../../components/StatusBadge";

export interface TaskListItem {
  id: string;
  name: string;
  mode: string;
  status: TaskStatus;
  costFen: number;
  updatedAtLabel: string;
  thumbnailUrl?: string;
}

type ListState = "loading" | "empty" | "error" | "ready";
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });

export function TaskListPage({ state, tasks, onRetry, onOpen, onCreate }: {
  state: ListState;
  tasks: TaskListItem[];
  onRetry: () => void;
  onOpen: (taskId: string) => void;
  onCreate: () => void;
}) {
  const monthlyFen = tasks.reduce((sum, task) => sum + task.costFen, 0);
  return (
    <section className="page-section">
      <header className="page-heading">
        <div><h1>广告任务</h1><p>查看生产进度，继续需要确认或审核的任务。</p></div>
        <button className="button primary" onClick={onCreate}><Plus size={17} />新建广告</button>
      </header>
      <div className="metrics" aria-label="任务概况">
        <div className="metric"><span>处理中</span><strong>{tasks.filter((task) => !["approved", "draft"].includes(task.status)).length}</strong></div>
        <div className="metric"><span>等待确认</span><strong>{tasks.filter((task) => task.status.includes("approval")).length}</strong></div>
        <div className="metric"><span>本月已批准</span><strong>{tasks.filter((task) => task.status === "approved").length}</strong></div>
        <div className="metric"><span>本月生成费用</span><strong>{money.format(monthlyFen / 100)}</strong></div>
      </div>
      {state === "loading" ? <div className="state-panel skeleton" aria-label="正在加载任务"><span /><span /><span /></div> : null}
      {state === "empty" ? <div className="state-panel"><Package size={30} /><h2>还没有广告任务</h2><button className="button primary" onClick={onCreate}>新建第一个广告</button></div> : null}
      {state === "error" ? <div className="state-panel"><AlertCircle size={30} /><h2>任务加载失败</h2><p>请检查网络后重试。</p><button className="button" onClick={onRetry}><RefreshCw size={16} />重新加载</button></div> : null}
      {state === "ready" ? (
        <div className="table-frame"><table><thead><tr><th>产品</th><th>市场 / 平台</th><th>当前状态</th><th>费用</th><th>更新时间</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>
          {tasks.map((task) => <tr key={task.id}><td><div className="product-cell"><span className="product-thumb">{task.thumbnailUrl ? <img src={task.thumbnailUrl} alt={`${task.name}产品图`} /> : <Package aria-label="待截取产品主图" size={20} />}</span><div><strong>{task.name}</strong><small>{task.mode}</small></div></div></td><td>印度尼西亚 · TikTok</td><td><StatusBadge status={task.status} /></td><td>{money.format(task.costFen / 100)}</td><td>{task.updatedAtLabel}</td><td><button className="text-button" onClick={() => onOpen(task.id)} aria-label={`打开 ${task.name}`}>打开</button></td></tr>)}
        </tbody></table></div>
      ) : null}
    </section>
  );
}
