import { EditPlanV1, TaskCreateInput, TaskStatus } from "@ad-agent/contracts";
import { evaluateGeneration, transition, type WorkflowEvent } from "@ad-agent/workflow";
import { Hono } from "hono";
import type { Env } from "../env";
import { getAuthenticatedUser, isSameOrigin } from "../auth/session";
import { FakeAnalysisProvider } from "../providers/fake-analysis";
import { FakeRenderProvider } from "../providers/fake-renderer";
import { HttpRenderProvider, HttpRendererError } from "../providers/http-renderer";
import { TaskRepository, type TaskRecord } from "./repository";

function error(code: string, message: string, retryable = false) {
  return { error: { code, message, retryable } };
}

export function renderFailureCode(failure: unknown) {
  return failure instanceof HttpRendererError ? failure.code : "RENDER_FAILED";
}

async function jsonBody(context: { req: { json(): Promise<unknown> } }) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function taskTitle(input: TaskCreateInput): string {
  return input.goal === "complete_creation" ? input.product.name : "只剪现有素材";
}

function inputMode(input: TaskCreateInput) {
  return input.goal === "complete_creation" ? input.inputMode : "video" as const;
}

async function requireMutationUser(context: Parameters<typeof getAuthenticatedUser>[0]) {
  if (!isSameOrigin(context.req.raw)) return { failure: "origin" as const };
  const user = await getAuthenticatedUser(context);
  return user ? { user } : { failure: "auth" as const };
}

function nextStatus(task: TaskRecord, event: WorkflowEvent) {
  return transition(TaskStatus.parse(task.status), event);
}

function publicTask(task: TaskRecord) {
  const { userId: _userId, companyId: _companyId, ...clientTask } = task;
  return clientTask;
}

export function createTaskRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) {
      const status = access.failure === "origin" ? 403 : 401;
      return context.json(error(access.failure === "origin" ? "FORBIDDEN" : "AUTH_REQUIRED", "Request denied"), status);
    }
    const parsed = TaskCreateInput.safeParse(await jsonBody(context));
    if (!parsed.success) return context.json(error("INVALID_INPUT", "Task input is invalid"), 400);

    const input = parsed.data;
    const task = await new TaskRepository(context.env.DB).createTask({
      id: `tsk_${crypto.randomUUID()}`,
      userId: access.user.id,
      companyId: access.user.companyId,
      title: taskTitle(input),
      goal: input.goal,
      inputMode: inputMode(input),
      market: input.market,
      platform: input.platform,
      status: "draft",
      allowedOperations: input.allowedOperations ?? [
        "trim", "concat", "captions", "voiceover", "stickers", "transitions", "music"
      ],
      referenceGeneration: input.goal === "complete_creation" ? input.referenceGeneration : undefined,
      aiVideoEnabled: input.goal === "complete_creation",
      budgetFen: input.goal === "complete_creation" ? 4_500 : 1_000,
      input,
      createdAt: Date.now()
    });
    return context.json({ task: publicTask(task) }, 201);
  });

  routes.get("/", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const repository = new TaskRepository(context.env.DB);
    const tasks = await repository.listTasksForUser(user.id);
    return context.json({ tasks: await Promise.all(tasks.map(async (task) => ({ ...publicTask(task), costFen: await repository.sumCostFen(task.id, user.id) }))) });
  });

  routes.get("/:taskId", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    return context.json({
      task: publicTask(task),
      assets: (await repository.listAssetsForTask(task.id, user.id)).map(({ objectKey: _objectKey, companyId: _companyId, ...asset }) => asset),
      costFen: await repository.sumCostFen(task.id, user.id),
      versions: await repository.listVersions(task.id, user.id)
    });
  });

  routes.patch("/:taskId/draft", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const body = await jsonBody(context) as Record<string, unknown> | null;
    if (!body || (body.title !== undefined && typeof body.title !== "string") ||
      (body.budgetFen !== undefined && body.budgetFen !== null && (!Number.isInteger(body.budgetFen) || (body.budgetFen as number) < 0))) {
      return context.json(error("INVALID_INPUT", "Draft input is invalid"), 400);
    }
    const task = await new TaskRepository(context.env.DB).updateTaskDraft(
      context.req.param("taskId"), access.user.id,
      { title: body.title as string | undefined, budgetFen: body.budgetFen as number | null | undefined },
      Date.now()
    );
    return task ? context.json({ task: publicTask(task) }) : context.json(error("CONFLICT", "Draft cannot be changed"), 409);
  });

  routes.post("/:taskId/analyze", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    const parsedInput = TaskCreateInput.safeParse(task.input);
    if (!parsedInput.success) return context.json(error("INVALID_INPUT", "Persisted task input is invalid"), 409);
    const assets = await repository.listAssetsForTask(task.id, access.user.id);
    if (!assets.length) return context.json(error("MATERIAL_REQUIRED", "At least one uploaded asset is required"), 409);
    const now = Date.now();
    const reservation = await repository.reserveStepAttempt({
      idempotencyKey: key, companyId: access.user.companyId, userId: access.user.id,
      taskId: task.id, operation: "analyze",
      attempt: { id: `atm_${crypto.randomUUID()}`, step: "analysis", attemptNumber: 1,
        status: "queued", provider: "pending", request: {}, createdAt: now },
      expiresAt: now + 86_400_000
    });
    if (!reservation.reserved) return context.json({ attemptId: reservation.attemptId }, 202);
    await repository.updateTaskStatus(task.id, access.user.id, nextStatus(task, "start_analysis"), now);
    const analysis = await new FakeAnalysisProvider().analyze({
      taskId: task.id, goal: task.goal, market: "ID", platform: "tiktok",
      product: parsedInput.data.goal === "complete_creation" ? {
        name: parsedInput.data.product.name, facts: parsedInput.data.product.facts,
        approvedClaims: parsedInput.data.product.approvedClaims
      } : undefined,
      assets: assets.map((asset) => ({ id: asset.id, kind: asset.kind as "product_image" | "source_video" })),
      allowedOperations: task.allowedOperations as ("trim" | "concat" | "captions" | "voiceover" | "stickers" | "transitions" | "music")[],
      referenceGeneration: (task.referenceGeneration ?? []) as ("three_view" | "nine_grid")[],
      costLimitFen: task.budgetFen ?? 4_500
    });
    await repository.saveVersion({ id: `ver_${crypto.randomUUID()}`, taskId: task.id,
      versionNumber: 1, editPlan: analysis.editPlan, createdAt: now });
    await repository.completeStepAttempt({ attemptId: reservation.attemptId, taskId: task.id,
      userId: access.user.id, provider: "fake_analysis", result: analysis, updatedAt: now });
    await repository.updateTaskStatus(task.id, access.user.id,
      nextStatus({ ...task, status: "analyzing" }, task.goal === "complete_creation" ? "require_generation_approval" : "analysis_ready"), now);
    return context.json({ attemptId: reservation.attemptId }, 202);
  });

  routes.post("/:taskId/approvals", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const body = await jsonBody(context) as Record<string, unknown> | null;
    const kinds = ["reference", "storyboard", "cost", "risk", "content", "final"];
    if (!body || !kinds.includes(String(body.kind)) || !["approved", "rejected"].includes(String(body.decision))) {
      return context.json(error("INVALID_INPUT", "Approval input is invalid"), 400);
    }
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    const approval = {
      id: `apr_${crypto.randomUUID()}`, taskId: task.id, userId: access.user.id,
      kind: String(body.kind), decision: body.decision as "approved" | "rejected",
      note: typeof body.note === "string" ? body.note : undefined,
      snapshot: body.snapshot ?? {}, createdAt: Date.now()
    };
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    try {
      const saved = await repository.saveApprovalWithIdempotency({ ...approval, companyId: access.user.companyId, key });
      if (!saved.created && (saved.approval.kind !== approval.kind || saved.approval.decision !== approval.decision ||
        (saved.approval.note ?? undefined) !== approval.note || JSON.stringify(saved.approval.snapshot) !== JSON.stringify(approval.snapshot))) {
        return context.json(error("CONFLICT", "Idempotency-Key was used with a different approval payload"), 409);
      }
      if (saved.created && task.goal === "complete_creation" && task.status === "awaiting_generation_approval") {
        const required = ["reference", "storyboard", "cost", "risk"];
        const allApproved = (await Promise.all(required.map((kind) => repository.getLatestApproval(task.id, access.user.id, kind))))
          .every((item) => item?.decision === "approved");
        if (allApproved) await repository.transitionTaskStatus(task.id, access.user.id,
          "awaiting_generation_approval", "ready_to_render", Date.now());
      }
      return context.json({ approval: saved.approval }, saved.created ? 201 : 200);
    } catch {
      return context.json(error("CONFLICT", "Idempotency-Key was used for another operation"), 409);
    }
  });

  routes.post("/:taskId/render", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    const body = await jsonBody(context) as Record<string, unknown> | null;
    if (!body || body.estimatedFen !== undefined || body.limitFen !== undefined) {
      return context.json(error("INVALID_INPUT", "Client-provided costs are not accepted"), 400);
    }
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    const previousAttemptId = await repository.getAttemptForIdempotency({ companyId: access.user.companyId,
      key, userId: access.user.id, taskId: task.id, operation: "render" });
    if (previousAttemptId) return context.json({ attemptId: previousAttemptId }, 202);
    if (!["ready_to_render", "failed_retryable"].includes(task.status)) {
      return context.json(error("CONFLICT", "Task is not ready to render"), 409);
    }
    if (task.goal === "complete_creation") {
      const approved = async (kind: string) =>
        (await repository.getLatestApproval(task.id, access.user.id, kind))?.decision === "approved";
      const referenceApproved = await approved("reference");
      const storyboardApproved = await approved("storyboard");
      const costApproved = await approved("cost");
      const riskApproved = await approved("risk");
      const costApproval = await repository.getLatestApproval(task.id, access.user.id, "cost");
      const costSnapshot = costApproval?.snapshot as { versionId?: unknown } | undefined;
      const decision = evaluateGeneration({
        goal: task.goal,
        referenceApproved,
        storyboardApproved,
        costApproved,
        riskApproved,
        estimatedFen: 0,
        limitFen: 1
      });
      if (!decision.allowed) return context.json(error(decision.reason, "Generation is blocked"), 409);
      const latestVersion = (await repository.listVersions(task.id, access.user.id))[0];
      const plan = latestVersion ? EditPlanV1.safeParse(latestVersion.editPlan) : null;
      if (!latestVersion || !plan?.success || costSnapshot?.versionId !== latestVersion.id) {
        return context.json(error("COST_APPROVAL_REQUIRED", "Cost approval must reference the persisted edit plan"), 409);
      }
      const costDecision = evaluateGeneration({
        goal: task.goal,
        referenceApproved,
        storyboardApproved,
        costApproved,
        riskApproved,
        estimatedFen: plan.data.cost.estimatedFen,
        limitFen: task.budgetFen ?? plan.data.cost.limitFen
      });
      if (!costDecision.allowed) return context.json(error(costDecision.reason, "Generation is blocked"), 409);
    }
    const now = Date.now();
    const attemptNumber = await repository.nextStepAttemptNumber(task.id, access.user.id, "render");
    let reservation: { reserved: boolean; attemptId: string };
    try {
      reservation = await repository.reserveStepAttempt({
        idempotencyKey: key, companyId: access.user.companyId, userId: access.user.id,
        taskId: task.id, operation: "render",
        attempt: { id: `atm_${crypto.randomUUID()}`, step: "render", attemptNumber,
          status: "queued", provider: "pending", request: body, createdAt: now },
        expiresAt: now + 86_400_000, expectedStatus: task.status, nextStatus: "rendering"
      });
    } catch {
      return context.json(error("CONFLICT", "Task status changed before rendering started"), 409);
    }
    if (!reservation.reserved) return context.json({ attemptId: reservation.attemptId }, 202);
    try {
      const latestVersion = (await repository.listVersions(task.id, access.user.id))[0];
      if (!latestVersion) throw new Error("EDIT_PLAN_MISSING");
      const plan = EditPlanV1.parse(latestVersion.editPlan);
      const outputAssetId = `ast_${crypto.randomUUID()}`;
      let receipt;
      let outputObjectKey: string | undefined;
      if (context.env.RENDERER_BASE_URL?.trim()) {
        const assets = await repository.listAssetsForTask(task.id, access.user.id);
        const sources = await Promise.all(assets.filter((asset) => asset.kind === "source_video").map(async (asset) => {
          const object = await context.env.MEDIA.get(asset.objectKey);
          if (!object) throw new Error("SOURCE_ASSET_MISSING");
          return {
            assetId: asset.id,
            mimeType: asset.mimeType,
            filename: asset.originalFilename,
            bytes: await object.arrayBuffer()
          };
        }));
        const taskInput = TaskCreateInput.parse(task.input);
        const text = taskInput.goal === "edit_only" ? taskInput.editInstructions ?? "" : taskInput.product.approvedClaims[0] ?? "";
        const cta = taskInput.goal === "complete_creation" ? taskInput.product.callToAction ?? "" : "";
        const rendered = await new HttpRenderProvider({ baseUrl: context.env.RENDERER_BASE_URL }).render({
          plan, outputAssetId, title: task.title, caption: text, cta, sources
        });
        outputObjectKey = `outputs/${task.id}/${crypto.randomUUID()}.mp4`;
        await context.env.MEDIA.put(outputObjectKey, rendered.bytes, {
          httpMetadata: { contentType: "video/mp4" },
          customMetadata: { assetId: outputAssetId, taskId: task.id }
        });
        await repository.saveAsset({
          id: outputAssetId, taskId: task.id, companyId: access.user.companyId,
          kind: "rendered_video", objectKey: outputObjectKey,
          originalFilename: `${task.title.slice(0, 80)}-v${latestVersion.versionNumber + 1}.mp4`,
          mimeType: "video/mp4", sizeBytes: rendered.bytes.byteLength,
          origin: "derived", metadata: { provider: "ffmpeg_renderer" }, createdAt: Date.now()
        });
        receipt = rendered.receipt;
      } else {
        receipt = await new FakeRenderProvider().render(plan);
      }
      await repository.completeRender({ attemptId: reservation.attemptId, taskId: task.id,
        userId: access.user.id, provider: receipt.provider, amountFen: plan.cost.estimatedFen,
        version: { id: `ver_${crypto.randomUUID()}`, versionNumber: latestVersion.versionNumber + 1,
          editPlan: plan, renderReceipt: receipt,
          outputAssetId: outputObjectKey ? outputAssetId : undefined, createdAt: Date.now() }, updatedAt: Date.now() });
      return context.json({ attemptId: reservation.attemptId }, 202);
    } catch (failure) {
      const failureCode = renderFailureCode(failure);
      await repository.failRenderAttempt({ attemptId: reservation.attemptId, taskId: task.id,
        userId: access.user.id, errorCode: failureCode, updatedAt: Date.now() });
      return context.json(error("RENDER_FAILED", "Rendering failed and can be retried", true), 502);
    }
  });

  routes.post("/:taskId/review", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const body = await jsonBody(context) as { action?: WorkflowEvent } | null;
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    if (!body || !["approve_content", "approve_final"].includes(String(body.action))) {
      return context.json(error("INVALID_INPUT", "Review action is invalid"), 400);
    }
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    const previous = await repository.getApprovalForIdempotency({ companyId: access.user.companyId,
      key, userId: access.user.id, taskId: task.id });
    if (previous) {
      const snapshot = previous.snapshot as { action?: unknown; statusAfter?: unknown };
      if (snapshot.action !== body.action || typeof snapshot.statusAfter !== "string") {
        return context.json(error("CONFLICT", "Idempotency-Key was used for another review action"), 409);
      }
      return context.json({ status: snapshot.statusAfter });
    }
    try {
      const status = nextStatus(task, body.action!);
      const approvalKind = body.action === "approve_content" ? "content" : "final";
      const reviewAction = body.action as "approve_content" | "approve_final";
      const saved = await repository.approveReviewTransition({ id: `apr_${crypto.randomUUID()}`, taskId: task.id,
        userId: access.user.id, companyId: access.user.companyId, key, kind: approvalKind,
        action: reviewAction, expectedStatus: task.status, nextStatus: status, createdAt: Date.now() });
      if (!saved.created) {
        const snapshot = saved.approval.snapshot as { action?: unknown; statusAfter?: unknown };
        if (snapshot.action !== body.action || typeof snapshot.statusAfter !== "string") {
          return context.json(error("CONFLICT", "Idempotency-Key was used for another review action"), 409);
        }
        return context.json({ status: snapshot.statusAfter });
      }
      return context.json({ status });
    } catch {
      return context.json(error("CONFLICT", "Review step cannot be skipped"), 409);
    }
  });

  routes.get("/:taskId/versions", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    return context.json({ versions: await repository.listVersions(task.id, user.id) });
  });

  return routes;
}
