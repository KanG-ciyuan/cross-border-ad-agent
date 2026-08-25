import type { ReactNode } from "react";
import { CircleDollarSign, FileVideo2, ListVideo, Menu, Plus, Users } from "lucide-react";
import { NavLink } from "react-router-dom";

const nav = [{ to: "/tasks", label: "任务列表", icon: ListVideo }, { to: "/tasks/new", label: "新建广告", icon: Plus }, { to: "/versions", label: "成品与版本", icon: FileVideo2 }];
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">A</span><span>AdFlow</span></div><nav><small>广告生产</small>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to}><Icon size={17} />{label}</NavLink>)}<small>管理</small><span className="disabled-nav"><Users size={17} />授权成员</span><span className="disabled-nav"><CircleDollarSign size={17} />费用记录</span></nav><div className="account"><strong>Rina · 印尼运营</strong><span>rina@company.com</span></div></aside><main className="workspace"><header className="mobile-header"><Menu size={20} /><div className="brand"><span className="brand-mark">A</span>AdFlow</div><span className="simulation-label">模拟模式</span></header><div className="workspace-content">{children}</div></main></div>;
}
