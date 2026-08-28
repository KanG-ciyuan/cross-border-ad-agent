import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/auth/password";
import { AuthRepository } from "../src/auth/repository";
import { TaskRepository } from "../src/tasks/repository";
import { createApp } from "../src";

const origin = "https://ads.example.test";
const token = "edit-flow-session";
const bindings = {
  DB: env.DB,
  MEDIA: env.MEDIA,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper",
  ANALYSIS_PROVIDER: "demo" as const,
  DECLARED_D1_DATABASE_NAME: "ad-agent-test-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-test-media"
};

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `ad_session=${token}`);
  if (init.method && init.method !== "GET") headers.set("Origin", origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

describe("edit-only agent flow", () => {
  beforeEach(async () => {
    const auth = new AuthRepository(env.DB);
    await auth.createUser({ id: "usr_editflow", companyId: "cmp_acme", email: "editflow@example.com",
      passwordHash: "unused", passwordSalt: "unused", passwordIterations: 1, createdAt: Date.now() });
    await auth.createSession({ id: "ses_editflow", userId: "usr_editflow",
      tokenHash: await hashSessionToken(token), createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
  });

  it("persists analysis_map.v1 and waits for plan approval", async () => {
    const app = createApp();
    const created = await app.fetch(request("/api/tasks", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        goal: "edit_only", market: "ID", platform: "tiktok",
        editInstructions: "前 3 秒突出产品，再展示清洁效果",
        targetDurationSeconds: 30, ratio: "16:9", allowedOperations: ["trim", "concat"]
      }) }), bindings);
    const taskId = ((await created.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.saveAsset({ id: "ast_editflow01", taskId, companyId: "cmp_acme",
      kind: "source_video", objectKey: "fixtures/editflow.mp4", originalFilename: "source.mp4",
      mimeType: "video/mp4", sizeBytes: 100, durationMs: 12_000,
      origin: "user_upload", metadata: {}, createdAt: Date.now() });
    await repository.updateTaskStatus(taskId, "usr_editflow", "uploaded", Date.now());

    const analyzed = await app.fetch(request(`/api/tasks/${taskId}/analyze`, {
      method: "POST", headers: { "Idempotency-Key": "analyze-editflow" }, body: "{}"
    }), bindings);

    expect(analyzed.status).toBe(202);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("awaiting_plan_approval");
    expect(await repository.getLatestAnalysisMap(taskId, "usr_editflow")).toMatchObject({
      analysisMap: { version: "analysis_map.v1", segments: [expect.objectContaining({ endMs: 12_000 })] }
    });
    expect(await repository.listVersions(taskId, "usr_editflow")).toHaveLength(0);
  });

  it("creates a plan version from the analysis map and blocks preview until approval", async () => {
    const app = createApp();
    const created = await app.fetch(request("/api/tasks", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        goal: "edit_only", market: "ID", platform: "tiktok",
        editInstructions: "突出产品使用过程", targetDurationSeconds: 10,
        ratio: "16:9", allowedOperations: ["trim", "concat"]
      }) }), bindings);
    const taskId = ((await created.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.saveAsset({ id: "ast_editflow02", taskId, companyId: "cmp_acme",
      kind: "source_video", objectKey: "fixtures/editflow2.mp4", originalFilename: "source.mp4",
      mimeType: "video/mp4", sizeBytes: 100, durationMs: 10_000,
      origin: "user_upload", metadata: {}, createdAt: Date.now() });
    await repository.updateTaskStatus(taskId, "usr_editflow", "uploaded", Date.now());
    await app.fetch(request(`/api/tasks/${taskId}/analyze`, {
      method: "POST", headers: { "Idempotency-Key": "analyze-editflow2" }, body: "{}"
    }), bindings);

    const planResponse = await app.fetch(request(`/api/tasks/${taskId}/plan`, {
      method: "POST", headers: { "Idempotency-Key": "plan-editflow2" }, body: "{}"
    }), bindings);
    expect(planResponse.status).toBe(202);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("awaiting_plan_approval");
    expect((await repository.listVersions(taskId, "usr_editflow"))[0]?.editPlan).toMatchObject({
      version: "edit_plan.v1", output: { ratio: "16:9", durationSeconds: 10 }
    });

    const previewBeforeApproval = await app.fetch(request(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Idempotency-Key": "preview-before-plan" }, body: "{}"
    }), bindings);
    expect(previewBeforeApproval.status).toBe(409);

    const approval = await app.fetch(request(`/api/tasks/${taskId}/approvals`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "plan-approval" },
      body: JSON.stringify({ kind: "plan", decision: "approved", snapshot: {} })
    }), bindings);
    expect(approval.status).toBe(201);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("previewing");
  });

  it("requires preview approval before final render and final approval", async () => {
    const app = createApp();
    const created = await app.fetch(request("/api/tasks", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        goal: "edit_only", market: "ID", platform: "tiktok",
        editInstructions: "突出去油前后对比", targetDurationSeconds: 10,
        ratio: "9:16", allowedOperations: ["trim", "concat"]
      }) }), bindings);
    const taskId = ((await created.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.saveAsset({ id: "ast_editflow03", taskId, companyId: "cmp_acme",
      kind: "source_video", objectKey: "fixtures/editflow3.mp4", originalFilename: "source.mp4",
      mimeType: "video/mp4", sizeBytes: 100, durationMs: 10_000,
      origin: "user_upload", metadata: {}, createdAt: Date.now() });
    await repository.updateTaskStatus(taskId, "usr_editflow", "uploaded", Date.now());
    await app.fetch(request(`/api/tasks/${taskId}/analyze`, {
      method: "POST", headers: { "Idempotency-Key": "analyze-editflow3" }, body: "{}"
    }), bindings);
    await app.fetch(request(`/api/tasks/${taskId}/plan`, {
      method: "POST", headers: { "Idempotency-Key": "plan-editflow3" }, body: "{}"
    }), bindings);
    await app.fetch(request(`/api/tasks/${taskId}/approvals`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "plan-approval3" },
      body: JSON.stringify({ kind: "plan", decision: "approved", snapshot: {} })
    }), bindings);

    const preview = await app.fetch(request(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Idempotency-Key": "preview-render3" }, body: "{}"
    }), bindings);
    expect(preview.status).toBe(202);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("awaiting_preview_review");

    const finalBeforeApproval = await app.fetch(request(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Idempotency-Key": "final-before-preview3" }, body: "{}"
    }), bindings);
    expect(finalBeforeApproval.status).toBe(409);

    const previewApproval = await app.fetch(request(`/api/tasks/${taskId}/review`, {
      method: "POST", headers: { "Idempotency-Key": "preview-approval3" },
      body: JSON.stringify({ action: "approve_preview" })
    }), bindings);
    expect(previewApproval.status).toBe(200);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("final_rendering");

    const finalRender = await app.fetch(request(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Idempotency-Key": "final-render3" }, body: "{}"
    }), bindings);
    expect(finalRender.status).toBe(202);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("awaiting_final_approval");

    const finalApproval = await app.fetch(request(`/api/tasks/${taskId}/review`, {
      method: "POST", headers: { "Idempotency-Key": "final-approval3" },
      body: JSON.stringify({ action: "approve_final" })
    }), bindings);
    expect(finalApproval.status).toBe(200);
    expect((await repository.getTaskForUser(taskId, "usr_editflow"))?.status).toBe("approved");
  });
});
