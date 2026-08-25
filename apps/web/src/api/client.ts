import type { TaskCreateInput, TaskStatus } from "@ad-agent/contracts";

export interface PublicTask {
  id: string;
  title: string;
  goal: "complete_creation" | "edit_only";
  inputMode: "video" | "product_images" | "mixed";
  market: string;
  platform: string;
  status: TaskStatus;
  budgetFen: number | null;
  costFen?: number;
  input?: unknown;
  updatedAt: number;
}

export interface SessionUser {
  id: string;
  email: string;
  companyId: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? body?.error?.code ?? "请求失败");
  return body as T;
}

export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("无法检查登录状态");
  return ((await response.json()) as { user: SessionUser }).user;
}

export async function login(input: { email: string; password: string }) {
  return request<{ user: SessionUser }>("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  });
}

export async function listTasks() {
  return (await request<{ tasks: PublicTask[] }>("/api/tasks")).tasks;
}

export async function createTask(input: TaskCreateInput) {
  return (await request<{ task: PublicTask }>("/api/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  })).task;
}

export async function uploadAsset(taskId: string, file: File) {
  return request<{ asset: { id: string } }>(`/api/tasks/${taskId}/assets`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Size": String(file.size),
      "X-Filename": encodeURIComponent(file.name)
    },
    body: file
  });
}

export async function startAnalysis(taskId: string) {
  return request<{ attemptId: string }>(`/api/tasks/${taskId}/analyze`, {
    method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: "{}"
  });
}

export interface TaskDetail {
  task: PublicTask;
  assets: Array<{ id: string; originalFilename: string; mimeType: string }>;
  costFen: number;
  versions: Array<{ id: string; versionNumber: number; editPlan: unknown; renderReceipt: unknown | null; outputAssetId?: string; createdAt: number }>;
}

export async function getTask(taskId: string) { return request<TaskDetail>(`/api/tasks/${taskId}`); }

export async function approveTask(taskId: string, kind: "reference" | "storyboard" | "cost" | "risk", snapshot: unknown) {
  return request(`/api/tasks/${taskId}/approvals`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ kind, decision: "approved", snapshot })
  });
}

export async function renderTask(taskId: string) {
  return request<{ attemptId: string }>(`/api/tasks/${taskId}/render`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: "{}"
  });
}

export async function reviewTask(taskId: string, action: "approve_content" | "approve_final") {
  return request<{ status: TaskStatus }>(`/api/tasks/${taskId}/review`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ action })
  });
}
