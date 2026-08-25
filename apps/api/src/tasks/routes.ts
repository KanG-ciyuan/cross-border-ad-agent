import { TaskCreateInput, TaskStatus } from "@ad-agent/contracts";
import { evaluateGeneration, transition, type WorkflowEvent } from "@ad-agent/workflow";
import { Hono } from "hono";
import type { Env } from "../env";
import { getAuthenticatedUser, isSameOrigin } from "../auth/session";
import { TaskRepository, type TaskRecord } from "./repository";

function error(code: string, message: string) {
  return { error: { code, message, retryable: false } };
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
      createdAt: Date.now()
    });
    return context.json({ task }, 201);
  });

  routes.get("/", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const tasks = await new TaskRepository(context.env.DB).listTasksForUser(user.id);
    return context.json({ tasks });
  });

  routes.get("/:taskId", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    return context.json({
      task,
      assets: await repository.listAssetsForTask(task.id, user.id),
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
    return task ? context.json({ task }) : context.json(error("CONFLICT", "Draft cannot be changed"), 409);
  });

  routes.post("/:taskId/analyze", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    const now = Date.now();
    const reservation = await repository.reserveStepAttempt({
      idempotencyKey: key, companyId: access.user.companyId, userId: access.user.id,
      taskId: task.id, operation: "analyze",
      attempt: { id: `atm_${crypto.randomUUID()}`, step: "analysis", attemptNumber: 1,
        status: "queued", provider: "pending", request: {}, createdAt: now },
      expiresAt: now + 86_400_000
    });
    if (reservation.reserved) {
      await repository.updateTaskStatus(task.id, access.user.id, nextStatus(task, "start_analysis"), now);
    }
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
    await repository.saveApproval(approval);
    return context.json({ approval }, 201);
  });

  routes.post("/:taskId/render", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    const body = await jsonBody(context) as Record<string, unknown> | null;
    if (!body || !Number.isInteger(body.estimatedFen) || !Number.isInteger(body.limitFen)) {
      return context.json(error("INVALID_INPUT", "Cost input is invalid"), 400);
    }
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    if (task.goal === "complete_creation") {
      const approved = async (kind: string) =>
        (await repository.getLatestApproval(task.id, access.user.id, kind))?.decision === "approved";
      const decision = evaluateGeneration({
        goal: task.goal,
        referenceApproved: await approved("reference"),
        storyboardApproved: await approved("storyboard"),
        costApproved: await approved("cost"),
        riskApproved: await approved("risk"),
        estimatedFen: body.estimatedFen as number,
        limitFen: body.limitFen as number
      });
      if (!decision.allowed) return context.json(error(decision.reason, "Generation is blocked"), 409);
    }
    const now = Date.now();
    const reservation = await repository.reserveStepAttempt({
      idempotencyKey: key, companyId: access.user.companyId, userId: access.user.id,
      taskId: task.id, operation: "render",
      attempt: { id: `atm_${crypto.randomUUID()}`, step: "render", attemptNumber: 1,
        status: "queued", provider: "pending", request: body, createdAt: now },
      expiresAt: now + 86_400_000
    });
    if (reservation.reserved) await repository.updateTaskStatus(task.id, access.user.id, "rendering", now);
    return context.json({ attemptId: reservation.attemptId }, 202);
  });

  routes.post("/:taskId/review", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const body = await jsonBody(context) as { action?: WorkflowEvent } | null;
    if (!body || !["approve_content", "approve_final"].includes(String(body.action))) {
      return context.json(error("INVALID_INPUT", "Review action is invalid"), 400);
    }
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    try {
      const status = nextStatus(task, body.action!);
      await repository.updateTaskStatus(task.id, access.user.id, status, Date.now());
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
