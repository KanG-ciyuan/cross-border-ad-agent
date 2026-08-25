import { useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LoginPage } from "../features/auth/LoginPage";
import { ConfirmationPage } from "../features/tasks/ConfirmationPage";
import { CreateTaskPage } from "../features/tasks/CreateTaskPage";
import { ReviewPage } from "../features/tasks/ReviewPage";
import { TaskListPage, type TaskListItem } from "../features/tasks/TaskListPage";
import { VersionsPage } from "../features/tasks/VersionsPage";

const sampleTasks: TaskListItem[] = [
  { id: "tsk_demo0001", name: "KLIN 厨房清洁剂", mode: "图片生成模式", status: "awaiting_generation_approval", costFen: 620, updatedAtLabel: "10 分钟前" },
  { id: "tsk_demo0002", name: "KLIN 去油喷雾", mode: "混合素材模式", status: "pending_content_review", costFen: 1840, updatedAtLabel: "昨天 17:42" },
  { id: "tsk_demo0003", name: "DishPro 洗洁精", mode: "仅剪现有素材", status: "approved", costFen: 970, updatedAtLabel: "8月23日" }
];

function ConfirmationRoute() {
  const navigate = useNavigate();
  const { taskId } = useParams();
  return <ConfirmationPage onBack={() => navigate("/tasks")} onGenerate={() => navigate(`/tasks/${taskId}/review`)} />;
}

function DemoApplication() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState(sampleTasks);
  const routes = useMemo(() => <Routes><Route path="/tasks" element={<TaskListPage state={tasks.length ? "ready" : "empty"} tasks={tasks} onRetry={() => undefined} onCreate={() => navigate("/tasks/new")} onOpen={(id) => navigate(id === "tsk_demo0001" ? `/tasks/${id}/confirm` : `/tasks/${id}/review`)} />} /><Route path="/tasks/new" element={<CreateTaskPage onCancel={() => navigate("/tasks")} onSubmit={(payload) => { const id = `tsk_demo${String(tasks.length + 1).padStart(4, "0")}`; setTasks((current) => [{ id, name: payload.goal === "edit_only" ? "新建纯剪辑任务" : payload.product.name, mode: payload.goal === "edit_only" ? "仅剪现有素材" : "图片生成模式", status: "draft", costFen: 0, updatedAtLabel: "刚刚" }, ...current]); navigate(payload.goal === "edit_only" ? `/tasks/${id}/review` : `/tasks/${id}/confirm`); }} />} /><Route path="/tasks/:taskId/confirm" element={<ConfirmationRoute />} /><Route path="/tasks/:taskId/review" element={<ReviewPage onRetryShot={() => undefined} onApproveContent={() => undefined} onApproveFinal={() => navigate("/versions")} />} /><Route path="/versions" element={<VersionsPage onReview={() => navigate("/tasks/tsk_demo0002/review")} />} /><Route path="*" element={<Navigate to="/tasks" replace />} /></Routes>, [navigate, tasks]);
  return <AppShell>{routes}</AppShell>;
}

function SessionBoundary() {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [authenticated, setAuthenticated] = useState(demo);
  const [error, setError] = useState<string>();
  if (!authenticated) return <LoginPage status="idle" error={error} onLogin={async (input) => { const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); if (response.ok) setAuthenticated(true); else setError("邮箱或密码不正确"); }} />;
  return <DemoApplication />;
}

export function AppRouter() {
  return <BrowserRouter><SessionBoundary /></BrowserRouter>;
}
