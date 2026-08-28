import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { analyzeProductImage, approveEditPlan, approveTask, createEditPlan, createTask, getSession, getTask, listTasks, login, renderTask, reviewTask, startAnalysis, startProductAnalysis, uploadAsset, type PublicTask, type SessionUser, type TaskDetail } from "../api/client";
import { EditPlanConfirmationPage } from "../features/tasks/EditPlanConfirmationPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ConfirmationPage } from "../features/tasks/ConfirmationPage";
import { CreateTaskPage } from "../features/tasks/CreateTaskPage";
import { ReviewPage } from "../features/tasks/ReviewPage";
import { TaskListPage, type TaskListItem } from "../features/tasks/TaskListPage";
import { VersionsPage } from "../features/tasks/VersionsPage";
import { MaterialIntelligenceWorkbench } from "../features/workbenches/MaterialIntelligenceWorkbench";
import { AppShell } from "./AppShell";

const ProductGenerationCanvas = lazy(async () => {
  const module = await import("../features/workbenches/ProductGenerationCanvas");
  return { default: module.ProductGenerationCanvas };
});

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

export function renderActionLabel(simulation: boolean) {
  return simulation ? "开始模拟剪辑" : "开始自动剪辑";
}

export function canRenderEditTask(goal: TaskListItem["goal"], status: string) {
  return goal === "edit_only" && ["ready_to_render", "failed_retryable"].includes(status);
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
  if (!simulation && detail?.task.goal === "edit_only") return <EditPlanConfirmationPage taskTitle={detail.task.title} plan={detail.versions[0]?.editPlan} analysisMap={detail.analysisMap} onBack={() => navigate("/tasks")} onApprove={async () => { if (!taskId) return; await approveEditPlan(taskId); await renderTask(taskId); navigate(`/tasks/${taskId}/review`); }} />;
  return <ConfirmationPage taskTitle={detail?.task.title}
    onBack={() => navigate("/tasks")} onGenerate={async () => {
    if (!taskId) throw new Error("任务编号无效");
    if (simulation) return navigate(`/tasks/${taskId}/review`);
    const detail = await getTask(taskId);
    const versionId = detail.versions[0]?.id;
    if (!versionId) throw new Error("尚未生成可确认的剪辑计划");
    await approveTask(taskId, "reference", { versionId });
    await approveTask(taskId, "storyboard", { versionId });
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
      if (task?.goal === "edit_only" || task?.mode === "仅剪现有素材") navigate("/workbench/materials");
      else if (task?.goal === "complete_creation") navigate(`/tasks/${id}/canvas`);
      else if (task?.status === "awaiting_generation_approval" || task?.status === "awaiting_plan_approval") navigate(`/tasks/${id}/confirm`);
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
        if (payload.goal === "complete_creation" && payload.inputMode === "product_images") {
          const productImage = files.find((file) => file.type.startsWith("image/"));
          if (!productImage) throw new Error("请上传一张产品图片");
          await analyzeProductImage(task.id, productImage);
          await refresh();
          navigate(`/tasks/${task.id}/canvas`);
          return;
        }
        const uploaded = [];
        for (const file of files) uploaded.push(await uploadAsset(task.id, file));
        if (payload.goal === "edit_only") {
          await startAnalysis(task.id);
          await createEditPlan(task.id);
        } else {
          const productImage = uploaded[0]?.asset.id;
          if (!productImage) throw new Error("产品图上传失败");
          await startProductAnalysis(task.id, productImage);
        }
        await refresh();
        navigate(payload.goal === "edit_only" ? "/tasks" : `/tasks/${task.id}/canvas`);
      } catch (reason) {
        setOperationError(reason instanceof Error ? reason.message : "任务创建失败");
      }
    }} />{operationError ? <div className="notice error" role="alert"><strong>任务未完成</strong><p>{operationError}</p></div> : null}</>} />
    <Route path="/tasks/:taskId/confirm" element={<ConfirmationRoute simulation={simulation} />} />
    <Route path="/workbench/materials" element={<MaterialIntelligenceWorkbench demo={simulation} onRevise={() => undefined} />} />
    <Route path="/workbench/canvas" element={<Suspense fallback={<section className="page-section"><div className="state-panel"><h2>正在加载产品广告画布</h2></div></section>}><ProductGenerationCanvas demo={simulation} /></Suspense>} />
    <Route path="/tasks/:taskId/canvas" element={<ProductCanvasRoute simulation={simulation} />} />
    <Route path="/tasks/:taskId/progress" element={<ProgressRoute tasks={tasks} simulation={simulation} onRefresh={refresh} />} />
    <Route path="/tasks/:taskId/review" element={<ReviewRoute simulation={simulation} />} />
    <Route path="/tasks/:taskId/versions" element={<VersionsRoute simulation={simulation} />} />
    <Route path="/versions" element={<VersionsLanding tasks={tasks} simulation={simulation} />} />
    <Route path="*" element={<Navigate to="/tasks" replace />} />
  </Routes>, [listState, navigate, operationError, refresh, simulation, tasks]);
  return <AppShell simulation={simulation} user={user}>{routes}</AppShell>;
}

function ProductCanvasRoute({ simulation }: { simulation: boolean }) {
  const { taskId } = useParams();
  return <Suspense fallback={<section className="page-section"><div className="state-panel"><h2>正在加载产品广告画布</h2></div></section>}>
    <ProductGenerationCanvas demo={simulation} taskId={taskId} />
  </Suspense>;
}

function ProgressRoute({ tasks, simulation, onRefresh }: { tasks: TaskListItem[]; simulation: boolean; onRefresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return <section className="page-section"><div className="state-panel"><h2>未找到任务</h2><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></div></section>;
  const canRender = canRenderEditTask(task.goal, task.status);
  return <section className="page-section"><header className="page-heading"><div><h1>{task.name}</h1><p>{task.mode} · 本地 API 任务</p></div><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></header><section className="surface"><h2>当前处理状态</h2><p>任务状态已写入 D1。当前状态：{task.status}</p><div className="notice"><strong>现有素材剪辑边界</strong><p>产品图生成链路当前可无存储直接分析；视频素材剪辑仍需要媒体存储和渲染执行器，未配置时不会假装生成成片。</p></div>{canRender ? <button className="button primary" onClick={async () => { if (!simulation && taskId) await renderTask(taskId); await onRefresh(); navigate(`/tasks/${taskId}/review`); }}>{renderActionLabel(simulation)}</button> : <button className="button" onClick={() => void onRefresh()}>刷新状态</button>}</section></section>;
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
  const reviewStage = detail?.task.status === "awaiting_preview_review"
    ? "preview"
    : detail?.task.status === "awaiting_final_approval"
      ? "final"
      : "content";
  return <ReviewPage reviewStage={reviewStage} taskTitle={taskTitle} versionNumber={versionNumber} videoUrl={videoUrl}
    initialContentApproved={detail?.task.status === "pending_final_approval" || detail?.task.status === "awaiting_final_approval"}
    onRetryShot={() => undefined} onBack={() => navigate("/tasks")} onApproveContent={async () => {
    if (!simulation && taskId) {
      if (detail?.task.status === "awaiting_preview_review") {
        await reviewTask(taskId, "approve_preview");
        await renderTask(taskId);
      } else await reviewTask(taskId, "approve_content");
    }
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
    onReview={() => navigate(`/tasks/${taskId ?? "tsk_demo0002"}/review`)} onBack={() => navigate("/tasks")} />;
  if (loadingError) return <section className="page-section"><div className="state-panel"><h2>无法加载版本</h2><p>{loadingError}</p><button className="button" onClick={() => navigate("/tasks")}>返回任务列表</button></div></section>;
  if (!detail) return <section className="page-section"><div className="state-panel"><h2>正在加载版本</h2></div></section>;
  return <VersionsPage taskId={taskId!} taskTitle={detail.task.title} status={detail.task.status} costFen={detail.costFen}
    versions={detail.versions} onReview={() => navigate(`/tasks/${taskId}/review`)} onBack={() => navigate("/tasks")} />;
}

export function canUseDemoBypass(search: string, isDevelopment: boolean) {
  return isDevelopment && new URLSearchParams(search).get("demo") === "1";
}

export function loginErrorMessage(reason: unknown) {
  if (reason instanceof Error && reason.message === "INVALID_CREDENTIALS") {
    return "邮箱或密码不正确";
  }
  if (reason instanceof Error && reason.message.startsWith("AUTH_INTERNAL_ERROR:")) {
    return `登录服务异常（支持码：${reason.message.slice("AUTH_INTERNAL_ERROR:".length)}）`;
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
