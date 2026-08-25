import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { approveTask, createTask, getSession, getTask, listTasks, login, renderTask, reviewTask, startAnalysis, uploadAsset, type PublicTask, type SessionUser, type TaskDetail } from "../api/client";
import { LoginPage } from "../features/auth/LoginPage";
import { ConfirmationPage } from "../features/tasks/ConfirmationPage";
import { CreateTaskPage } from "../features/tasks/CreateTaskPage";
import { ReviewPage } from "../features/tasks/ReviewPage";
import { TaskListPage, type TaskListItem } from "../features/tasks/TaskListPage";
import { VersionsPage } from "../features/tasks/VersionsPage";
import { AppShell } from "./AppShell";

const sampleTasks: TaskListItem[] = [
  { id: "tsk_demo0001", name: "KLIN 厨房清洁剂", mode: "图片生成模式", status: "awaiting_generation_approval", costFen: 620, updatedAtLabel: "10 分钟前" },
  { id: "tsk_demo0002", name: "KLIN 去油喷雾", mode: "混合素材模式", status: "pending_content_review", costFen: 1840, updatedAtLabel: "昨天 17:42" },
  { id: "tsk_demo0003", name: "DishPro 洗洁精", mode: "仅剪现有素材", status: "approved", costFen: 970, updatedAtLabel: "8月23日" }
];

function toListItem(task: PublicTask): TaskListItem {
  const mode = task.goal === "edit_only" ? "仅剪现有素材" : task.inputMode === "mixed" ? "混合素材模式" : task.inputMode === "video" ? "现有素材模式" : "图片生成模式";
  return { id: task.id, name: task.title, mode, status: task.status, costFen: task.costFen ?? 0, updatedAtLabel: new Date(task.updatedAt).toLocaleString("zh-CN"), goal: task.goal };
}

export function resolveVersionsTaskId(
  tasks: Array<{ id: string; status: string }>,
  simulation: boolean
) {
  if (simulation) return "tsk_demo0002";
  return tasks.find((task) => ["pending_content_review", "pending_final_approval", "approved"].includes(task.status))?.id ?? null;
}

function VersionsLanding({ tasks, simulation }: { tasks: TaskListItem[]; simulation: boolean }) {
  const navigate = useNavigate();
  const taskId = resolveVersionsTaskId(tasks, simulation);
  if (taskId) return <Navigate to={`/tasks/${taskId}/versions`} replace />;
  return <section className="page-section"><div className="state-panel"><h2>还没有成品版本</h2><p>完成一次真实剪辑后，MP4 会显示在这里。</p><button className="button primary" onClick={() => navigate("/tasks/new")}>新建剪辑任务</button></div></section>;
}

function ConfirmationRoute({ simulation }: { simulation: boolean }) {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadingError, setLoadingError] = useState("");
  useEffect(() => {
    if (simulation) return;
    if (!taskId) return setLoadingError("任务编号无效");
    void getTask(taskId).then(setDetail).catch((reason) =>
      setLoadingError(reason instanceof Error ? reason.message : "确认方案加载失败"));
  }, [simulation, taskId]);
  if (!simulation && loadingError) return <section className="page-section"><div className="state-panel"><h2>无法加载确认方案</h2><p>{loadingError}</p><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></div></section>;
  if (!simulation && !detail) return <section className="page-section"><div className="state-panel"><h2>正在加载确认方案</h2></div></section>;
  const plan = detail?.versions[0]?.editPlan as { cost?: { estimatedFen?: number; limitFen?: number } } | undefined;
  return <ConfirmationPage taskTitle={detail?.task.title} estimatedFen={plan?.cost?.estimatedFen}
    limitFen={detail?.task.budgetFen ?? plan?.cost?.limitFen}
    onBack={() => navigate("/tasks")} onGenerate={async () => {
    if (!taskId) throw new Error("任务编号无效");
    if (simulation) return navigate(`/tasks/${taskId}/review`);
    const detail = await getTask(taskId);
    const versionId = detail.versions[0]?.id;
    if (!versionId) throw new Error("尚未生成可确认的剪辑计划");
    await approveTask(taskId, "reference", { versionId });
    await approveTask(taskId, "storyboard", { versionId });
    await approveTask(taskId, "cost", { versionId });
    await approveTask(taskId, "risk", { versionId });
    await renderTask(taskId);
    navigate(`/tasks/${taskId}/review`);
  }} />;
}

function Workbench({ user, simulation }: { user: SessionUser; simulation: boolean }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskListItem[]>(simulation ? sampleTasks : []);
  const [listState, setListState] = useState<"loading" | "empty" | "error" | "ready">(simulation ? "ready" : "loading");
  const [operationError, setOperationError] = useState<string>();
  const refresh = useCallback(async () => {
    if (simulation) return;
    setListState("loading");
    try {
      const data = await listTasks();
      setTasks(data.map(toListItem));
      setListState(data.length ? "ready" : "empty");
    } catch {
      setListState("error");
    }
  }, [simulation]);
  useEffect(() => { void refresh(); }, [refresh]);

  const routes = useMemo(() => <Routes>
    <Route path="/tasks" element={<TaskListPage state={listState} tasks={tasks} onRetry={() => void refresh()} onCreate={() => navigate("/tasks/new")} onOpen={(id) => {
      const task = tasks.find((item) => item.id === id);
      if (task?.status === "awaiting_generation_approval") navigate(`/tasks/${id}/confirm`);
      else if (task?.status === "pending_content_review" || task?.status === "pending_final_approval") navigate(`/tasks/${id}/review`);
      else if (task?.status === "approved") navigate(`/tasks/${id}/versions`);
      else navigate(`/tasks/${id}/progress`);
    }} />} />
    <Route path="/tasks/new" element={<><CreateTaskPage onCancel={() => navigate("/tasks")} onSubmit={async (payload, files) => {
      setOperationError(undefined);
      if (simulation) {
        const id = `tsk_demo${String(tasks.length + 1).padStart(4, "0")}`;
        setTasks((current) => [{ id, name: payload.goal === "edit_only" ? "新建纯剪辑任务" : payload.product.name, mode: payload.goal === "edit_only" ? "仅剪现有素材" : "图片生成模式", status: "draft", costFen: 0, updatedAtLabel: "刚刚" }, ...current]);
        navigate(payload.goal === "edit_only" ? `/tasks/${id}/review` : `/tasks/${id}/confirm`);
        return;
      }
      try {
        if (!files.length) throw new Error("请至少上传一个产品图或视频素材");
        const task = await createTask(payload);
        for (const file of files) await uploadAsset(task.id, file);
        await startAnalysis(task.id);
        await refresh();
        navigate("/tasks");
      } catch (reason) {
        setOperationError(reason instanceof Error ? reason.message : "任务创建失败");
      }
    }} />{operationError ? <div className="notice error" role="alert"><strong>任务未完成</strong><p>{operationError}</p></div> : null}</>} />
    <Route path="/tasks/:taskId/confirm" element={<ConfirmationRoute simulation={simulation} />} />
    <Route path="/tasks/:taskId/progress" element={<ProgressRoute tasks={tasks} simulation={simulation} onRefresh={refresh} />} />
    <Route path="/tasks/:taskId/review" element={<ReviewRoute simulation={simulation} />} />
    <Route path="/tasks/:taskId/versions" element={<VersionsRoute simulation={simulation} />} />
    <Route path="/versions" element={<VersionsLanding tasks={tasks} simulation={simulation} />} />
    <Route path="*" element={<Navigate to="/tasks" replace />} />
  </Routes>, [listState, navigate, operationError, refresh, simulation, tasks]);
  return <AppShell simulation={simulation} user={user}>{routes}</AppShell>;
}

function ProgressRoute({ tasks, simulation, onRefresh }: { tasks: TaskListItem[]; simulation: boolean; onRefresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return <section className="page-section"><div className="state-panel"><h2>未找到任务</h2><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></div></section>;
  const canRender = task.goal === "edit_only" && task.status === "ready_to_render";
  return <section className="page-section"><header className="page-heading"><div><h1>{task.name}</h1><p>{task.mode} · 本地 API 任务</p></div><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></header><section className="surface"><h2>当前处理状态</h2><p>任务已写入本地 D1，素材已写入本地 R2。当前状态：{task.status}</p>{canRender ? <button className="button primary" onClick={async () => { if (!simulation && taskId) await renderTask(taskId); await onRefresh(); navigate(`/tasks/${taskId}/review`); }}>开始模拟剪辑</button> : <button className="button" onClick={() => void onRefresh()}>刷新状态</button>}</section></section>;
}

function ReviewRoute({ simulation }: { simulation: boolean }) {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadingError, setLoadingError] = useState("");
  useEffect(() => {
    if (simulation) return;
    if (!taskId) return setLoadingError("任务编号无效");
    void getTask(taskId).then(setDetail).catch((reason) =>
      setLoadingError(reason instanceof Error ? reason.message : "任务加载失败"));
  }, [simulation, taskId]);
  if (!simulation && loadingError) return <section className="page-section"><div className="state-panel"><h2>无法加载审核任务</h2><p>{loadingError}</p><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></div></section>;
  if (!simulation && !detail) return <section className="page-section"><div className="state-panel"><h2>正在加载审核任务</h2></div></section>;
  const taskTitle = detail?.task.title;
  const renderedVersion = detail?.versions.find((version) => version.outputAssetId);
  const versionNumber = renderedVersion?.versionNumber ?? detail?.versions[0]?.versionNumber;
  const videoUrl = taskId && renderedVersion?.outputAssetId
    ? `/api/tasks/${taskId}/assets/${renderedVersion.outputAssetId}`
    : undefined;
  return <ReviewPage taskTitle={taskTitle} versionNumber={versionNumber} videoUrl={videoUrl}
    initialContentApproved={detail?.task.status === "pending_final_approval"}
    onRetryShot={() => undefined} onApproveContent={async () => {
    if (!simulation && taskId) await reviewTask(taskId, "approve_content");
  }} onApproveFinal={async () => {
    if (!simulation && taskId) await reviewTask(taskId, "approve_final");
    navigate(`/tasks/${taskId ?? "tsk_demo0002"}/versions`);
  }} />;
}

function VersionsRoute({ simulation }: { simulation: boolean }) {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadingError, setLoadingError] = useState("");
  useEffect(() => {
    if (simulation) return;
    if (!taskId) return setLoadingError("任务编号无效");
    void getTask(taskId).then(setDetail).catch((reason) =>
      setLoadingError(reason instanceof Error ? reason.message : "版本加载失败"));
  }, [simulation, taskId]);
  if (simulation) return <VersionsPage taskId={taskId ?? "tsk_demo0002"} taskTitle="KLIN 去油喷雾" status="pending_content_review" costFen={1840}
    versions={[{ id: "ver_demo3", versionNumber: 3, renderReceipt: { status: "completed" }, createdAt: 3 },
      { id: "ver_demo2", versionNumber: 2, renderReceipt: null, createdAt: 2 }]}
    onReview={() => navigate(`/tasks/${taskId ?? "tsk_demo0002"}/review`)} />;
  if (loadingError) return <section className="page-section"><div className="state-panel"><h2>无法加载版本</h2><p>{loadingError}</p><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></div></section>;
  if (!detail) return <section className="page-section"><div className="state-panel"><h2>正在加载版本</h2></div></section>;
  return <VersionsPage taskId={taskId!} taskTitle={detail.task.title} status={detail.task.status} costFen={detail.costFen}
    versions={detail.versions} onReview={() => navigate(`/tasks/${taskId}/review`)} />;
}

export function canUseDemoBypass(search: string, isDevelopment: boolean) {
  return isDevelopment && new URLSearchParams(search).get("demo") === "1";
}

export function loginErrorMessage(reason: unknown) {
  if (reason instanceof Error && reason.message === "INVALID_CREDENTIALS") {
    return "邮箱或密码不正确";
  }
  if (reason instanceof Error && reason.message === "CROSS_ORIGIN_REQUEST") {
    return "本地连接配置异常，请刷新后重试";
  }
  return "登录失败，请稍后重试";
}

function SessionBoundary() {
  const simulation = canUseDemoBypass(window.location.search, import.meta.env.DEV);
  const [user, setUser] = useState<SessionUser | null>(simulation ? { id: "demo", email: "rina@company.com", companyId: "demo" } : null);
  const [checking, setChecking] = useState(!simulation);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (simulation) return;
    void getSession().then(setUser).catch(() => setError("无法连接本地 API")).finally(() => setChecking(false));
  }, [simulation]);
  if (checking) return <main className="login-page"><div className="login-panel"><h1>正在连接本地 API</h1><p>正在检查公司授权会话。</p></div></main>;
  if (!user) return <LoginPage status="idle" error={error} onLogin={async (input) => {
    try { const result = await login(input); setUser(result.user); setError(undefined); }
    catch (reason) { setError(loginErrorMessage(reason)); }
  }} />;
  return <Workbench user={user} simulation={simulation} />;
}

export function AppRouter() {
  return <BrowserRouter><SessionBoundary /></BrowserRouter>;
}
