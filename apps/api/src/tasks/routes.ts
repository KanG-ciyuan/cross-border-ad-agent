import { AnalysisMapV1, EditPlanV1, TaskCreateInput, TaskStatus } from "@ad-agent/contracts";
import { evaluateGeneration, transition, type WorkflowEvent } from "@ad-agent/workflow";
import { Hono } from "hono";
import type { Env } from "../env";
import { getAuthenticatedUser, isSameOrigin } from "../auth/session";
import { FakeAnalysisProvider } from "../providers/fake-analysis";
import { createAnalysisProvider } from "../providers/provider-factory";
import { FakeRenderProvider } from "../providers/fake-renderer";
import { HttpRenderProvider, HttpRendererError } from "../providers/http-renderer";
import { TaskRepository, type TaskRecord } from "./repository";
import { InMemoryAgentHarness } from "../agent/harness";
import { MediaAnalysisSkill } from "../agent/skills/media-analysis-skill";
import { ProductImageAnalysisSkill } from "../agent/skills/product-image-analysis-skill";
import { createProductVisionProvider } from "../providers/product-vision-factory";
import { ProductVisionProviderError } from "../providers/openai-compatible-product-vision";

function error(code: string, message: string, retryable = false) {
  return { error: { code, message, retryable } };
}

function productVisionFailureMessage(code: string) {
  if (/_401(?:_|$)|_403(?:_|$)/.test(code)) return "视觉模型认证失败，请检查 API Key";
  if (/_404(?:_|$)/.test(code)) return "视觉模型接口返回 HTTP 404，请检查模型和接口兼容性";
  if (/_429(?:_|$)/.test(code)) return "视觉模型请求受限，请检查额度或频率限制";
  if (code.includes("JSON_INVALID")) return "视觉模型返回的内容不是有效 JSON";
  if (code.includes("SCHEMA_INVALID")) return `视觉模型返回的字段不符合协议：${code.slice("PRODUCT_VISION_SCHEMA_INVALID_".length)}`;
  if (code.includes("CHAT_CONTENT_MISSING")) return "视觉模型请求成功，但未返回可读内容";
  if (code.includes("CHAT_RESPONSE_NOT_JSON")) return "中转站返回的不是 JSON 响应";
  if (code.includes("CHAT_SHAPE")) return `中转站返回的响应包装不兼容：${code.slice("PRODUCT_VISION_CHAT_SHAPE_".length)}`;
  if (code.includes("INVALID_OUTPUT")) return "视觉模型已返回结果，但结构不符合产品分析协议";
  if (code === "PRODUCT_VISION_NETWORK_FAILED") return "Cloudflare 无法连接视觉模型接口";
  if (code === "PRODUCT_VISION_NETWORK_RESPONSES_AND_CHAT_FAILED") return "Cloudflare 无法连接中转站的 Responses 和 Chat Completions 接口";
  return "视觉模型上游请求失败";
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

const DIRECT_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const productImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasProductImageSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((byte, index) => bytes[index] === byte);
  if (type === "image/webp") {
    const decoder = new TextDecoder();
    return decoder.decode(bytes.slice(0, 4)) === "RIFF" && decoder.decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function publicTask(task: TaskRecord) {
  const { userId: _userId, companyId: _companyId, ...clientTask } = task;
  return clientTask;
}

function buildDemoEditPlan(task: TaskRecord, analysis: ReturnType<typeof AnalysisMapV1.parse>, input: Extract<TaskCreateInput, { goal: "edit_only" }>) {
  const ratio = input.ratio;
  const width = ratio === "16:9" ? 1920 : 1080;
  const height = ratio === "16:9" ? 1080 : 1920;
  const targetMs = input.targetDurationSeconds * 1000;
  let remaining = targetMs;
  const clips = [];
  for (const segment of analysis.segments) {
    if (remaining <= 0) break;
    const duration = Math.min(segment.endMs - segment.startMs, remaining);
    if (duration <= 0) continue;
    const index: number = clips.length + 1;
    clips.push({
      id: `clp_demo${String(index).padStart(7, "0")}`,
      sourceAssetId: segment.sourceAssetId,
      startMs: segment.startMs,
      endMs: segment.startMs + duration,
      origin: "uploaded" as const,
      transition: index === 1 ? "cut" as const : "crossfade" as const
    });
    remaining -= duration;
  }
  if (remaining > 0 || clips.length === 0) throw new Error("DEMO_PLAN_MATERIAL_TOO_SHORT");
  return EditPlanV1.parse({
    version: "edit_plan.v1",
    taskId: task.id,
    output: { width, height, fps: 30, language: "id-ID", ratio, durationSeconds: input.targetDurationSeconds },
    tracks: [{ id: "trk_demo0001", type: "video", clips }],
    processing: {
      cropMode: "crop",
      muteOriginalAudio: input.muteOriginalAudio ?? false,
      captions: input.subtitleLanguage === "id-ID" ? "generate" : "none",
      voiceover: input.voiceoverLanguage === "id-ID" ? "replace" : "none",
      music: "replace"
    },
    explanations: clips.map((clip) => ({ clipId: clip.id, reason: "Demo plan selected a contiguous analyzed source segment" })),
    approvals: []
  });
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
      versions: await repository.listVersions(task.id, user.id),
      analysisMap: await repository.getLatestAnalysisMap(task.id, user.id),
      productAnalysis: await repository.getLatestProductAnalysis(task.id, user.id)
    });
  });

  routes.post("/:taskId/product-analysis", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    const parsedInput = TaskCreateInput.safeParse(task.input);
    if (!parsedInput.success || parsedInput.data.goal !== "complete_creation") {
      return context.json(error("CONFLICT", "Product analysis requires a product-creation task"), 409);
    }
    const requestMimeType = context.req.header("Content-Type")?.split(";", 1)[0]?.trim() ?? "";
    let sourceAssetId: string;
    let imageMimeType: "image/jpeg" | "image/png" | "image/webp";
    let imageBytes: Uint8Array | undefined;
    let storedObjectKey: string | undefined;

    if (productImageTypes.has(requestMimeType)) {
      const lengthHeader = context.req.header("Content-Length") ?? context.req.header("X-File-Size");
      const declaredLength = Number(lengthHeader);
      if (!lengthHeader || !Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
        return context.json(error("INVALID_INPUT", "A valid product image size is required"), 400);
      }
      if (declaredLength > DIRECT_PRODUCT_IMAGE_MAX_BYTES) {
        return context.json(error("FILE_TOO_LARGE", "Product image exceeds 10 MB"), 413);
      }
      imageBytes = new Uint8Array(await context.req.arrayBuffer());
      if (imageBytes.byteLength !== declaredLength || !hasProductImageSignature(requestMimeType, imageBytes)) {
        return context.json(error("UNSUPPORTED_MEDIA_TYPE", "Product image is invalid"), 415);
      }
      sourceAssetId = `ast_${crypto.randomUUID()}`;
      imageMimeType = requestMimeType as typeof imageMimeType;
    } else {
      const body = await jsonBody(context) as { assetId?: unknown } | null;
      if (!body || typeof body.assetId !== "string" || !/^ast_[A-Za-z0-9-]{8,}$/.test(body.assetId)) {
        return context.json(error("INVALID_INPUT", "A product image is required"), 400);
      }
      const asset = (await repository.listAssetsForTask(task.id, access.user.id))
        .find((candidate) => candidate.id === body.assetId && candidate.kind === "product_image");
      if (!asset || !productImageTypes.has(asset.mimeType)) {
        return context.json(error("MATERIAL_REQUIRED", "Selected product image was not found"), 409);
      }
      if (!context.env.MEDIA) {
        return context.json(error("STORAGE_NOT_CONFIGURED", "The selected stored image is unavailable"), 503);
      }
      sourceAssetId = asset.id;
      imageMimeType = asset.mimeType as typeof imageMimeType;
      storedObjectKey = asset.objectKey;
    }

    const now = Date.now();
    const reservation = await repository.reserveStepAttempt({
      idempotencyKey: key,
      companyId: access.user.companyId,
      userId: access.user.id,
      taskId: task.id,
      operation: "product_analysis",
      attempt: {
        id: `atm_${crypto.randomUUID()}`,
        step: "product_image_analysis",
        attemptNumber: await repository.nextStepAttemptNumber(task.id, access.user.id, "product_image_analysis"),
        status: "queued",
        provider: "pending",
        request: { sourceAssetId, transport: imageBytes ? "request" : "object_storage" },
        createdAt: now
      },
      expiresAt: now + 86_400_000
    });
    if (!reservation.reserved) return context.json({ attemptId: reservation.attemptId }, 202);

    try {
      let analysisTask = task;
      if (task.status === "draft" || task.status === "needs_material") {
        const uploadedStatus = nextStatus(task, "upload_complete");
        await repository.updateTaskStatus(task.id, access.user.id, uploadedStatus, now);
        analysisTask = { ...task, status: uploadedStatus };
      }
      await repository.updateTaskStatus(task.id, access.user.id, nextStatus(analysisTask, "start_analysis"), now);
      if (!imageBytes && storedObjectKey) {
        const object = await context.env.MEDIA?.get(storedObjectKey);
        if (!object) throw new Error("PRODUCT_IMAGE_MISSING");
        imageBytes = new Uint8Array(await object.arrayBuffer());
      }
      if (!imageBytes) throw new Error("PRODUCT_IMAGE_MISSING");
      const provider = createProductVisionProvider(context.env);
      const harness = new InMemoryAgentHarness();
      harness.register(new ProductImageAnalysisSkill(provider));
      const result = await harness.run("product-image-analysis", {
        taskId: task.id,
        asset: {
          id: sourceAssetId,
          mimeType: imageMimeType,
          bytes: imageBytes
        },
        product: {
          name: parsedInput.data.product.name,
          suppliedFacts: parsedInput.data.product.facts
        }
      }, `run_${crypto.randomUUID()}`);
      if (result.kind !== "awaiting_approval" || result.approvalKind !== "product_facts") {
        throw new Error("PRODUCT_FACTS_APPROVAL_MISSING");
      }
      const previous = await repository.getLatestProductAnalysis(task.id, access.user.id);
      const versionNumber = (previous?.versionNumber ?? 0) + 1;
      await repository.saveProductAnalysis({
        id: `pan_${crypto.randomUUID()}`,
        taskId: task.id,
        sourceAssetId,
        versionNumber,
        analysis: result.output,
        createdAt: now
      });
      await repository.completeStepAttempt({
        attemptId: reservation.attemptId,
        taskId: task.id,
        userId: access.user.id,
        provider: provider.provider,
        result: result.output,
        updatedAt: now
      });
      await repository.saveUsageRecord({
        id: `use_${crypto.randomUUID()}`,
        taskId: task.id,
        attemptId: reservation.attemptId,
        provider: provider.provider,
        operation: "product_image_analysis",
        calls: 1,
        createdAt: now
      });
      await repository.updateTaskStatus(task.id, access.user.id,
        nextStatus({ ...task, status: "analyzing" }, "require_generation_approval"), now);
      return context.json({ attemptId: reservation.attemptId, version: versionNumber, sourceAssetId }, 202);
    } catch (reason) {
      const errorCode = reason instanceof ProductVisionProviderError
        ? reason.code
        : "PRODUCT_VISION_FAILED";
      await repository.failStepAttempt({
        attemptId: reservation.attemptId,
        taskId: task.id,
        userId: access.user.id,
        errorCode,
        updatedAt: Date.now()
      });
      await repository.updateTaskStatus(task.id, access.user.id, "failed_retryable", Date.now());
      return context.json(error(errorCode, productVisionFailureMessage(errorCode), true), 503);
    }
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
    const analysisInput = {
      taskId: task.id, goal: task.goal, market: "ID" as const, platform: "tiktok" as const,
      product: parsedInput.data.goal === "complete_creation" ? {
        name: parsedInput.data.product.name, facts: parsedInput.data.product.facts,
        approvedClaims: parsedInput.data.product.approvedClaims
      } : undefined,
      assets: assets.map((asset) => ({ id: asset.id, kind: asset.kind as "product_image" | "source_video",
        ...(asset.durationMs ? { durationMs: asset.durationMs } : {}) })),
      allowedOperations: task.allowedOperations as ("trim" | "concat" | "captions" | "voiceover" | "stickers" | "transitions" | "music")[],
      targetDurationSeconds: parsedInput.data.goal === "edit_only" ? parsedInput.data.targetDurationSeconds : undefined,
      ratio: parsedInput.data.goal === "edit_only" ? parsedInput.data.ratio : undefined,
      muteOriginalAudio: parsedInput.data.goal === "edit_only" ? parsedInput.data.muteOriginalAudio ?? false : undefined,
      subtitleLanguage: parsedInput.data.goal === "edit_only" ? parsedInput.data.subtitleLanguage ?? "none" : undefined,
      voiceoverLanguage: parsedInput.data.goal === "edit_only" ? parsedInput.data.voiceoverLanguage ?? "none" : undefined,
      referenceGeneration: (task.referenceGeneration ?? []) as ("three_view" | "nine_grid")[],
      costLimitFen: task.budgetFen ?? 4_500
    };
    if (task.goal === "edit_only") {
      try {
        const analysisProvider = createAnalysisProvider({ APP_ENV: context.env.APP_ENV,
          ANALYSIS_PROVIDER: context.env.ANALYSIS_PROVIDER, ANALYSIS_API_KEY: context.env.ANALYSIS_API_KEY });
        const harness = new InMemoryAgentHarness();
        harness.register(new MediaAnalysisSkill(analysisProvider));
        const result = await harness.run("media-analysis", analysisInput, `run_${crypto.randomUUID()}`);
        if (result.kind !== "completed") throw new Error("ANALYSIS_APPROVAL_UNEXPECTED");
        const analysisMap = result.output;
        await repository.saveAnalysisMap({ id: `anm_${crypto.randomUUID()}`, taskId: task.id,
          versionNumber: 1, analysisMap, createdAt: now });
        await repository.completeStepAttempt({ attemptId: reservation.attemptId, taskId: task.id,
          userId: access.user.id, provider: analysisProvider.provider, result: analysisMap, updatedAt: now });
        await repository.updateTaskStatus(task.id, access.user.id,
          nextStatus({ ...task, status: "analyzing" }, "analysis_ready"), now);
        return context.json({ attemptId: reservation.attemptId }, 202);
      } catch {
        await repository.updateTaskStatus(task.id, access.user.id, "failed_retryable", Date.now());
        return context.json(error("ANALYSIS_FAILED", "Video analysis is not configured or failed", true), 503);
      }
    }
    const analysis = await new FakeAnalysisProvider().analyze(analysisInput);
    await repository.saveVersion({ id: `ver_${crypto.randomUUID()}`, taskId: task.id,
      versionNumber: 1, editPlan: analysis.editPlan, createdAt: now });
    await repository.completeStepAttempt({ attemptId: reservation.attemptId, taskId: task.id,
      userId: access.user.id, provider: "fake_analysis", result: analysis, updatedAt: now });
    await repository.updateTaskStatus(task.id, access.user.id,
      nextStatus({ ...task, status: "analyzing" }, task.goal === "complete_creation" ? "require_generation_approval" : "analysis_ready"), now);
    return context.json({ attemptId: reservation.attemptId }, 202);
  });

  routes.post("/:taskId/plan", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const key = context.req.header("Idempotency-Key");
    if (!key) return context.json(error("CONFLICT", "Idempotency-Key is required"), 409);
    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), access.user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);
    if (task.goal !== "edit_only" || task.status !== "awaiting_plan_approval") return context.json(error("CONFLICT", "Task is not waiting for a plan"), 409);
    const existingAttempt = await repository.getAttemptForIdempotency({ companyId: access.user.companyId, key, userId: access.user.id, taskId: task.id, operation: "plan" });
    if (existingAttempt) return context.json({ attemptId: existingAttempt }, 202);
    const analysis = await repository.getLatestAnalysisMap(task.id, access.user.id);
    const parsedInput = TaskCreateInput.safeParse(task.input);
    if (!analysis || !parsedInput.success || parsedInput.data.goal !== "edit_only") return context.json(error("CONFLICT", "Analysis map is required before planning"), 409);
    const now = Date.now();
    const plan = buildDemoEditPlan(task, AnalysisMapV1.parse(analysis.analysisMap), parsedInput.data);
    const reservation = await repository.reserveStepAttempt({
      idempotencyKey: key, companyId: access.user.companyId, userId: access.user.id, taskId: task.id, operation: "plan",
      attempt: { id: `atm_${crypto.randomUUID()}`, step: "plan", attemptNumber: 1, status: "queued", provider: "demo_agent_planner", request: {}, createdAt: now },
      expiresAt: now + 86_400_000
    });
    if (!reservation.reserved) return context.json({ attemptId: reservation.attemptId }, 202);
    await repository.saveVersion({ id: `ver_${crypto.randomUUID()}`, taskId: task.id, versionNumber: 1, editPlan: plan, createdAt: now });
    await repository.completeStepAttempt({ attemptId: reservation.attemptId, taskId: task.id, userId: access.user.id, provider: "demo_agent_planner", result: plan, updatedAt: now });
    return context.json({ attemptId: reservation.attemptId, version: 1 }, 202);
  });

  routes.post("/:taskId/approvals", async (context) => {
    const access = await requireMutationUser(context);
    if ("failure" in access) return context.json(error("FORBIDDEN", "Request denied"), access.failure === "origin" ? 403 : 401);
    const body = await jsonBody(context) as Record<string, unknown> | null;
    const kinds = ["product_facts", "plan", "reference", "storyboard", "cost", "risk", "content", "final"];
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
        const required = ["reference", "storyboard", "risk"];
        const allApproved = (await Promise.all(required.map((kind) => repository.getLatestApproval(task.id, access.user.id, kind))))
          .every((item) => item?.decision === "approved");
        if (allApproved) await repository.transitionTaskStatus(task.id, access.user.id,
          "awaiting_generation_approval", "ready_to_render", Date.now());
      }
      if (saved.created && task.goal === "edit_only" && task.status === "awaiting_plan_approval" &&
        approval.kind === "plan" && approval.decision === "approved") {
        await repository.transitionTaskStatus(task.id, access.user.id,
          "awaiting_plan_approval", "previewing", Date.now());
      }
      if (saved.created && task.goal === "edit_only" && task.status === "awaiting_plan_approval" &&
        approval.kind === "plan" && approval.decision === "rejected") {
        await repository.transitionTaskStatus(task.id, access.user.id,
          "awaiting_plan_approval", "revision_requested", Date.now());
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
    if (!["ready_to_render", "previewing", "final_rendering", "failed_retryable"].includes(task.status)) {
      return context.json(error("CONFLICT", "Task is not ready to render"), 409);
    }
    if (context.env.RENDERER_BASE_URL?.trim() && !context.env.MEDIA) {
      return context.json(error("STORAGE_NOT_CONFIGURED", "Video rendering requires media storage"), 503);
    }
    if (task.goal === "complete_creation") {
      const approved = async (kind: string) =>
        (await repository.getLatestApproval(task.id, access.user.id, kind))?.decision === "approved";
      const referenceApproved = await approved("reference");
      const storyboardApproved = await approved("storyboard");
      const costApproved = true;
      const riskApproved = await approved("risk");
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
      if (!latestVersion || !plan?.success) return context.json(error("CONFLICT", "A persisted edit plan is required"), 409);
      // Cost is not part of edit_plan.v1. A provider may record an actual
      // amount separately, but planning and approval never depend on estimates.
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
        const media = context.env.MEDIA!;
        const assets = await repository.listAssetsForTask(task.id, access.user.id);
        const sources = await Promise.all(assets.filter((asset) => asset.kind === "source_video").map(async (asset) => {
          const object = await media.get(asset.objectKey);
          if (!object) throw new Error("SOURCE_ASSET_MISSING");
          return {
            assetId: asset.id,
            mimeType: asset.mimeType,
            filename: asset.originalFilename,
            bytes: await object.arrayBuffer()
          };
        }));
        const taskInput = TaskCreateInput.parse(task.input);
        const text = taskInput.goal === "complete_creation" ? taskInput.product.approvedClaims[0] ?? "" : "";
        const cta = taskInput.goal === "complete_creation" ? taskInput.product.callToAction ?? "" : "";
        const rendered = await new HttpRenderProvider({ baseUrl: context.env.RENDERER_BASE_URL }).render({
          plan, outputAssetId, title: taskInput.goal === "edit_only" ? "" : task.title, caption: text, cta, sources,
          muteOriginalAudio: taskInput.goal === "edit_only" ? taskInput.muteOriginalAudio ?? false : false
        });
        outputObjectKey = `outputs/${task.id}/${crypto.randomUUID()}.mp4`;
        await media.put(outputObjectKey, rendered.bytes, {
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
        userId: access.user.id, provider: receipt.provider, amountFen: 0,
        nextStatus: task.status === "previewing" ? "awaiting_preview_review" : task.status === "final_rendering" ? "awaiting_final_approval" : undefined,
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
    if (!body || !["approve_preview", "approve_content", "approve_final"].includes(String(body.action))) {
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
      const approvalKind = body.action === "approve_preview" ? "preview" : body.action === "approve_content" ? "content" : "final";
      const reviewAction = body.action as "approve_preview" | "approve_content" | "approve_final";
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
