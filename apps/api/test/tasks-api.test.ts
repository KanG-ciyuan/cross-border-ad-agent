import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/auth/password";
import { AuthRepository } from "../src/auth/repository";
import { TaskRepository } from "../src/tasks/repository";
import { createApp } from "../src/index";

const origin = "https://ads.example.test";
const token = "task-api-test-session";
const bindings = {
  DB: env.DB,
  MEDIA: env.MEDIA,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper",
  DECLARED_D1_DATABASE_NAME: "ad-agent-test-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-test-media"
};

async function seedIdentity(suffix = "owner") {
  const auth = new AuthRepository(env.DB);
  await auth.createUser({
    id: `usr_${suffix}`,
    companyId: "cmp_acme",
    email: `${suffix}@example.com`,
    passwordHash: "unused-hash",
    passwordSalt: "unused-salt",
    passwordIterations: 1,
    createdAt: Date.now()
  });
  const sessionToken = suffix === "owner" ? token : `${token}-${suffix}`;
  await auth.createSession({
    id: `ses_${suffix}`,
    userId: `usr_${suffix}`,
    tokenHash: await hashSessionToken(sessionToken),
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });
  return sessionToken;
}

function apiRequest(path: string, init: RequestInit = {}, sessionToken = token) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `ad_session=${sessionToken}`);
  if (init.method && init.method !== "GET") headers.set("Origin", origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

const completeCreation = {
  goal: "complete_creation",
  market: "ID",
  platform: "tiktok",
  inputMode: "product_images",
  product: {
    name: "Pembersih Dapur 500ml",
    category: "kitchen_cleaner",
    facts: ["500 ml"],
    approvedClaims: ["Membantu membersihkan minyak"],
    prohibitedClaims: ["Kills all bacteria"],
    usage: "Semprot lalu lap"
  },
  referenceGeneration: ["three_view", "nine_grid"]
};

describe("task API", () => {
  beforeEach(() => seedIdentity());

  it("creates complete-creation and edit-only tasks as separate payload shapes", async () => {
    const app = createApp();
    const complete = await app.fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeCreation)
      }),
      bindings
    );
    const editOnly = await app.fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: "edit_only",
          market: "ID",
          platform: "tiktok",
          allowedOperations: ["trim", "concat", "captions"]
        })
      }),
      bindings
    );

    expect(complete.status).toBe(201);
    const completeBody = (await complete.json()) as { task: Record<string, unknown> };
    expect(completeBody).toMatchObject({ task: { goal: "complete_creation" } });
    expect(completeBody.task).not.toHaveProperty("companyId");
    expect(completeBody.task).not.toHaveProperty("userId");
    expect(editOnly.status).toBe(201);
    expect(await editOnly.json()).toMatchObject({ task: { goal: "edit_only" } });
  });

  it("rejects generation fields in edit-only mode", async () => {
    const response = await createApp().fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: "edit_only",
          market: "ID",
          platform: "tiktok",
          allowedOperations: ["trim"],
          referenceGeneration: ["three_view"]
        })
      }),
      bindings
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it("keeps list and detail reads scoped to the authenticated user", async () => {
    const otherToken = await seedIdentity("other");
    const create = await createApp().fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeCreation)
      }),
      bindings
    );
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;

    const ownList = await createApp().fetch(apiRequest("/api/tasks"), bindings);
    const otherDetail = await createApp().fetch(
      apiRequest(`/api/tasks/${taskId}`, {}, otherToken),
      bindings
    );

    expect(((await ownList.json()) as { tasks: unknown[] }).tasks).toHaveLength(1);
    expect(otherDetail.status).toBe(404);
  });

  it("blocks rendering when the estimate exceeds the approved RMB limit", async () => {
    const create = await createApp().fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeCreation)
      }),
      bindings
    );
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.updateTaskDraft(taskId, "usr_owner", { budgetFen: 12_000 }, Date.now());
    await repository.updateTaskStatus(taskId, "usr_owner", "awaiting_generation_approval", Date.now());
    await repository.saveVersion({
      id: "ver_costplan01", taskId, versionNumber: 1, createdAt: Date.now(),
      editPlan: { version: "edit_plan.v1", taskId, output: { width: 1080, height: 1920, fps: 30, language: "id-ID" },
        tracks: [{ id: "trk_video001", type: "video", clips: [{ id: "clp_video001", assetId: "ast_video001", startMs: 0, endMs: 1000, origin: "generated" }] }],
        cost: { currency: "CNY", estimatedFen: 12_001, limitFen: 20_000 }, approvals: [] }
    });

    for (const kind of ["reference", "storyboard", "cost", "risk"]) {
      await createApp().fetch(
        apiRequest(`/api/tasks/${taskId}/approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": `approval-${kind}` },
          body: JSON.stringify({ kind, decision: "approved", snapshot: kind === "cost" ? { versionId: "ver_costplan01" } : {} })
        }),
        bindings
      );
    }
    await new TaskRepository(env.DB).updateTaskStatus(taskId, "usr_owner", "ready_to_render", Date.now());

    const response = await createApp().fetch(
      apiRequest(`/api/tasks/${taskId}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "render-over-limit"
        },
        body: JSON.stringify({})
      }),
      bindings
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "COST_LIMIT_EXCEEDED" } });
  });

  it("requires reference and storyboard confirmation before complete-creation render", async () => {
    const create = await createApp().fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeCreation)
      }),
      bindings
    );
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    await new TaskRepository(env.DB).updateTaskStatus(taskId, "usr_owner", "ready_to_render", Date.now());
    const response = await createApp().fetch(
      apiRequest(`/api/tasks/${taskId}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "render-without-confirmation"
        },
        body: JSON.stringify({})
      }),
      bindings
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REFERENCE_APPROVAL_REQUIRED" }
    });
  });

  it("requires content review before a separate final approval", async () => {
    const create = await createApp().fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: "edit_only",
          market: "ID",
          platform: "tiktok",
          allowedOperations: ["trim"]
        })
      }),
      bindings
    );
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.updateTaskStatus(taskId, "usr_owner", "pending_content_review", Date.now());

    const review = (action: "approve_content" | "approve_final") =>
      createApp().fetch(
        apiRequest(`/api/tasks/${taskId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": `review-${action}` },
          body: JSON.stringify({ action })
        }),
        bindings
      );

    expect((await review("approve_final")).status).toBe(409);
    expect((await review("approve_content")).status).toBe(200);
    expect((await review("approve_content")).status).toBe(200);
    expect((await review("approve_final")).status).toBe(200);
    expect((await repository.getTaskForUser(taskId, "usr_owner"))?.status).toBe("approved");
    expect((await repository.getLatestApproval(taskId, "usr_owner", "content"))?.decision).toBe("approved");
    expect((await repository.getLatestApproval(taskId, "usr_owner", "final"))?.decision).toBe("approved");
  });

  it("rejects client cost overrides and draft-to-render state skips", async () => {
    const create = await createApp().fetch(apiRequest("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "edit_only", market: "ID", platform: "tiktok", allowedOperations: ["trim"] })
    }), bindings);
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const withCosts = await createApp().fetch(apiRequest(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "render-cost-override" },
      body: JSON.stringify({ estimatedFen: 1, limitFen: 999_999 })
    }), bindings);
    const skipped = await createApp().fetch(apiRequest(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "render-skip" },
      body: JSON.stringify({})
    }), bindings);
    expect(withCosts.status).toBe(400);
    expect(skipped.status).toBe(409);
  });

  it("returns the same render attempt for a repeated idempotency key", async () => {
    const create = await createApp().fetch(apiRequest("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "edit_only", market: "ID", platform: "tiktok", allowedOperations: ["trim"] })
    }), bindings);
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.updateTaskStatus(taskId, "usr_owner", "ready_to_render", Date.now());
    const render = () => createApp().fetch(apiRequest(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "render-once" },
      body: JSON.stringify({})
    }), bindings);
    const first = await render();
    const second = await render();
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await first.json()).toEqual(await second.json());
    expect(await repository.listStepAttempts(taskId, "usr_owner")).toHaveLength(1);
  });

  it("allows only one concurrent render transition across different keys", async () => {
    const create = await createApp().fetch(apiRequest("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "edit_only", market: "ID", platform: "tiktok", allowedOperations: ["trim"] })
    }), bindings);
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.updateTaskStatus(taskId, "usr_owner", "ready_to_render", Date.now());
    const render = (key: string) => createApp().fetch(apiRequest(`/api/tasks/${taskId}/render`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: "{}"
    }), bindings);
    const responses = await Promise.all([render("render-concurrent-a"), render("render-concurrent-b")]);
    expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
    expect(await repository.listStepAttempts(taskId, "usr_owner")).toHaveLength(1);
  });

  it("rejects reused idempotency keys with a different approval payload", async () => {
    const create = await createApp().fetch(apiRequest("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(completeCreation)
    }), bindings);
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const approve = (kind: string) => createApp().fetch(apiRequest(`/api/tasks/${taskId}/approvals`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "approval-payload" },
      body: JSON.stringify({ kind, decision: "approved", snapshot: {} })
    }), bindings);
    expect((await approve("reference")).status).toBe(201);
    expect((await approve("storyboard")).status).toBe(409);
  });

  it("atomically records only one concurrent content review", async () => {
    const create = await createApp().fetch(apiRequest("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "edit_only", market: "ID", platform: "tiktok", allowedOperations: ["trim"] })
    }), bindings);
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    const repository = new TaskRepository(env.DB);
    await repository.updateTaskStatus(taskId, "usr_owner", "pending_content_review", Date.now());
    const review = (key: string) => createApp().fetch(apiRequest(`/api/tasks/${taskId}/review`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ action: "approve_content" })
    }), bindings);
    const responses = await Promise.all([review("review-concurrent-a"), review("review-concurrent-b")]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM approvals WHERE task_id = ? AND kind = 'content'")
      .bind(taskId).first<{ total: number }>();
    expect(count?.total).toBe(1);
  });

  it("uses one analysis attempt for duplicate idempotency keys", async () => {
    const create = await createApp().fetch(
      apiRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: "edit_only",
          market: "ID",
          platform: "tiktok",
          allowedOperations: ["trim"]
        })
      }),
      bindings
    );
    const taskId = ((await create.json()) as { task: { id: string } }).task.id;
    await new TaskRepository(env.DB).updateTaskStatus(taskId, "usr_owner", "uploaded", Date.now());

    const run = () =>
      createApp().fetch(
        apiRequest(`/api/tasks/${taskId}/analyze`, {
          method: "POST",
          headers: { "Idempotency-Key": "analyze-once" }
        }),
        bindings
      );
    const first = await run();
    const second = await run();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect((await first.json()) as unknown).toEqual((await second.json()) as unknown);
    expect(await new TaskRepository(env.DB).listStepAttempts(taskId, "usr_owner")).toHaveLength(1);
  });
});
