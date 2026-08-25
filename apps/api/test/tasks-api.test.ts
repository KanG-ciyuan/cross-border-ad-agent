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
  SESSION_PEPPER: "test-only-pepper"
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
    expect(await complete.json()).toMatchObject({ task: { goal: "complete_creation" } });
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
    await new TaskRepository(env.DB).updateTaskStatus(taskId, "usr_owner", "awaiting_generation_approval", Date.now());

    for (const kind of ["reference", "storyboard", "cost", "risk"]) {
      await createApp().fetch(
        apiRequest(`/api/tasks/${taskId}/approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, decision: "approved", snapshot: {} })
        }),
        bindings
      );
    }

    const response = await createApp().fetch(
      apiRequest(`/api/tasks/${taskId}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "render-over-limit"
        },
        body: JSON.stringify({ estimatedFen: 12_001, limitFen: 12_000 })
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
    const response = await createApp().fetch(
      apiRequest(`/api/tasks/${taskId}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "render-without-confirmation"
        },
        body: JSON.stringify({ estimatedFen: 1_000, limitFen: 2_000 })
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        }),
        bindings
      );

    expect((await review("approve_final")).status).toBe(409);
    expect((await review("approve_content")).status).toBe(200);
    expect((await review("approve_final")).status).toBe(200);
    expect((await repository.getTaskForUser(taskId, "usr_owner"))?.status).toBe("approved");
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
