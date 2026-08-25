import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "../src/auth/repository";
import { TaskRepository } from "../src/tasks/repository";

const now = 1_787_630_400_000;

async function seedUser(
  repository: AuthRepository,
  suffix = "owner"
) {
  return repository.createUser({
    id: `usr_${suffix}`,
    companyId: "cmp_acme",
    email: `${suffix}@example.com`,
    passwordHash: `hash_${suffix}`,
    passwordSalt: `salt_${suffix}`,
    passwordIterations: 210_000,
    createdAt: now
  });
}

async function seedTask(
  repository: TaskRepository,
  userId = "usr_owner",
  id = "tsk_primary"
) {
  return repository.createTask({
    id,
    userId,
    companyId: "cmp_acme",
    title: "Kitchen cleaner TikTok",
    goal: "complete_creation",
    inputMode: "product_images",
    market: "ID",
    platform: "tiktok",
    status: "draft",
    allowedOperations: ["captions", "transitions"],
    referenceGeneration: ["three_view"],
    aiVideoEnabled: true,
    budgetFen: 20_000,
    createdAt: now
  });
}

describe("D1 persistence schema", () => {
  it("creates every MVP persistence table", async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all<{ name: string }>();

    expect(rows.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "approvals",
        "assets",
        "cost_entries",
        "idempotency_keys",
        "sessions",
        "step_attempts",
        "task_versions",
        "tasks",
        "users"
      ])
    );
  });
});

describe("AuthRepository", () => {
  it("stores authorized users and finds email case-insensitively", async () => {
    const repository = new AuthRepository(env.DB);
    await seedUser(repository);

    const user = await repository.findUserByEmail("OWNER@EXAMPLE.COM");

    expect(user).toMatchObject({
      id: "usr_owner",
      companyId: "cmp_acme",
      email: "owner@example.com",
      passwordHash: "hash_owner"
    });
  });

  it("stores only a session token hash and ignores expired sessions", async () => {
    const repository = new AuthRepository(env.DB);
    await seedUser(repository);
    await repository.createSession({
      id: "ses_active",
      userId: "usr_owner",
      tokenHash: "sha256-token-only",
      createdAt: now,
      expiresAt: now + 60_000
    });

    expect(await repository.findActiveSession("sha256-token-only", now)).toMatchObject({
      id: "ses_active",
      userId: "usr_owner"
    });
    expect(await repository.findActiveSession("sha256-token-only", now + 60_001)).toBeNull();
  });
});

describe("TaskRepository", () => {
  it("scopes task reads and lists to the authenticated user", async () => {
    const auth = new AuthRepository(env.DB);
    const repository = new TaskRepository(env.DB);
    await seedUser(auth);
    await seedUser(auth, "other");
    await seedTask(repository);

    expect(await repository.getTaskForUser("tsk_primary", "usr_owner")).toMatchObject({
      id: "tsk_primary",
      budgetFen: 20_000,
      referenceGeneration: ["three_view"]
    });
    expect(await repository.getTaskForUser("tsk_primary", "usr_other")).toBeNull();
    expect(await repository.listTasksForUser("usr_other")).toEqual([]);
  });

  it("stores task assets with object keys instead of local paths", async () => {
    const auth = new AuthRepository(env.DB);
    const repository = new TaskRepository(env.DB);
    await seedUser(auth);
    await seedTask(repository);

    await repository.saveAsset({
      id: "ast_front",
      taskId: "tsk_primary",
      companyId: "cmp_acme",
      kind: "product_image",
      objectKey: "cmp_acme/tsk_primary/ast_front.jpg",
      originalFilename: "front.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1_024,
      width: 1080,
      height: 1080,
      origin: "user_upload",
      metadata: { labelVisible: true },
      createdAt: now
    });

    expect(await repository.listAssetsForTask("tsk_primary", "usr_owner")).toEqual([
      expect.objectContaining({
        id: "ast_front",
        objectKey: "cmp_acme/tsk_primary/ast_front.jpg",
        metadata: { labelVisible: true }
      })
    ]);
  });

  it("records approval evidence for a scoped task", async () => {
    const auth = new AuthRepository(env.DB);
    const repository = new TaskRepository(env.DB);
    await seedUser(auth);
    await seedTask(repository);

    await repository.saveApproval({
      id: "apr_reference",
      taskId: "tsk_primary",
      userId: "usr_owner",
      kind: "reference_images",
      decision: "approved",
      note: "Use version 2",
      snapshot: { assetIds: ["ast_ref_2"] },
      createdAt: now
    });

    expect(
      await repository.getLatestApproval("tsk_primary", "usr_owner", "reference_images")
    ).toMatchObject({
      decision: "approved",
      snapshot: { assetIds: ["ast_ref_2"] }
    });
  });

  it("prevents one idempotency key from creating two generation attempts", async () => {
    const auth = new AuthRepository(env.DB);
    const repository = new TaskRepository(env.DB);
    await seedUser(auth);
    await seedTask(repository);

    const first = await repository.reserveStepAttempt({
      idempotencyKey: "generate-shot-01",
      companyId: "cmp_acme",
      userId: "usr_owner",
      taskId: "tsk_primary",
      operation: "generate_shot",
      attempt: {
        id: "atm_first",
        step: "shot_01",
        attemptNumber: 1,
        status: "queued",
        provider: "fake_seedance",
        request: { prompt: "clean kitchen counter" },
        createdAt: now
      },
      expiresAt: now + 86_400_000
    });
    const second = await repository.reserveStepAttempt({
      idempotencyKey: "generate-shot-01",
      companyId: "cmp_acme",
      userId: "usr_owner",
      taskId: "tsk_primary",
      operation: "generate_shot",
      attempt: {
        id: "atm_duplicate",
        step: "shot_01",
        attemptNumber: 2,
        status: "queued",
        provider: "fake_seedance",
        request: { prompt: "duplicate" },
        createdAt: now + 1
      },
      expiresAt: now + 86_400_000
    });

    expect(first).toEqual({ reserved: true, attemptId: "atm_first" });
    expect(second).toEqual({ reserved: false, attemptId: "atm_first" });
    expect(await repository.listStepAttempts("tsk_primary", "usr_owner")).toHaveLength(1);
  });

  it("appends integer-fen costs and totals them per scoped task", async () => {
    const auth = new AuthRepository(env.DB);
    const repository = new TaskRepository(env.DB);
    await seedUser(auth);
    await seedTask(repository);

    await repository.appendCostEntry({
      id: "cost_1",
      taskId: "tsk_primary",
      category: "video_generation",
      provider: "fake_seedance",
      amountFen: 1_250,
      estimated: true,
      createdAt: now
    });
    await repository.appendCostEntry({
      id: "cost_2",
      taskId: "tsk_primary",
      category: "render",
      provider: "fake_renderer",
      amountFen: 350,
      estimated: false,
      createdAt: now + 1
    });

    expect(await repository.sumCostFen("tsk_primary", "usr_owner")).toBe(1_600);
  });

  it("stores immutable edit-plan versions in numeric order", async () => {
    const auth = new AuthRepository(env.DB);
    const repository = new TaskRepository(env.DB);
    await seedUser(auth);
    await seedTask(repository);

    await repository.saveVersion({
      id: "ver_1",
      taskId: "tsk_primary",
      versionNumber: 1,
      editPlan: { version: "edit_plan.v1", tracks: [] },
      createdAt: now
    });
    await repository.saveVersion({
      id: "ver_2",
      taskId: "tsk_primary",
      versionNumber: 2,
      editPlan: { version: "edit_plan.v1", tracks: [{ id: "video" }] },
      renderReceipt: { provider: "fake_renderer", status: "completed" },
      createdAt: now + 1
    });

    expect(await repository.listVersions("tsk_primary", "usr_owner")).toEqual([
      expect.objectContaining({ id: "ver_2", versionNumber: 2 }),
      expect.objectContaining({ id: "ver_1", versionNumber: 1 })
    ]);
  });

  it("does not expose task deletion in the MVP repository", () => {
    const repository = new TaskRepository(env.DB);

    expect("deleteTask" in repository).toBe(false);
  });
});
