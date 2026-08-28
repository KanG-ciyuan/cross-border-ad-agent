type TaskGoal = "complete_creation" | "edit_only";
type InputMode = "video" | "product_images" | "mixed";

export interface TaskRecord {
  id: string;
  userId: string;
  companyId: string;
  title: string;
  goal: TaskGoal;
  inputMode: InputMode;
  market: string;
  platform: string;
  status: string;
  allowedOperations: string[];
  referenceGeneration: string[] | null;
  aiVideoEnabled: boolean;
  budgetFen: number | null;
  input: unknown;
  createdAt: number;
  updatedAt: number;
}

interface TaskRow {
  id: string;
  user_id: string;
  company_id: string;
  title: string;
  goal: TaskGoal;
  input_mode: InputMode;
  market: string;
  platform: string;
  status: string;
  allowed_operations_json: string;
  reference_generation_json: string | null;
  ai_video_enabled: number;
  budget_fen: number | null;
  input_json: string;
  created_at: number;
  updated_at: number;
}

interface AssetRow {
  id: string;
  task_id: string;
  company_id: string;
  kind: string;
  object_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  origin: string;
  metadata_json: string;
  created_at: number;
}

interface ApprovalRow {
  id: string;
  task_id: string;
  user_id: string;
  kind: string;
  decision: "approved" | "rejected";
  note: string | null;
  snapshot_json: string;
  created_at: number;
}

interface AttemptRow {
  id: string;
  task_id: string;
  step: string;
  attempt_number: number;
  status: string;
  provider: string;
  request_json: string;
  result_json: string | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
}

interface VersionRow {
  id: string;
  task_id: string;
  version_number: number;
  edit_plan_json: string;
  render_receipt_json: string | null;
  output_asset_id: string | null;
  created_at: number;
}

interface AnalysisMapRow {
  id: string;
  task_id: string;
  version_number: number;
  analysis_map_json: string;
  created_at: number;
}

interface ProductAnalysisRow {
  id: string;
  task_id: string;
  source_asset_id: string;
  version_number: number;
  analysis_json: string;
  created_at: number;
}

interface RevisionRequestRow {
  id: string;
  task_id: string;
  user_id: string;
  instruction: string;
  base_version_number: number;
  created_at: number;
}

interface UsageRecordRow {
  id: string;
  task_id: string;
  attempt_id: string | null;
  provider: string;
  operation: string;
  calls: number;
  actual_amount_fen: number | null;
  created_at: number;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function mapTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    title: row.title,
    goal: row.goal,
    inputMode: row.input_mode,
    market: row.market,
    platform: row.platform,
    status: row.status,
    allowedOperations: parseJson<string[]>(row.allowed_operations_json),
    referenceGeneration: row.reference_generation_json
      ? parseJson<string[]>(row.reference_generation_json)
      : null,
    aiVideoEnabled: row.ai_video_enabled === 1,
    budgetFen: row.budget_fen,
    input: parseJson<unknown>(row.input_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TaskRepository {
  constructor(private readonly db: D1Database) {}

  async saveProductAnalysis(input: {
    id: string;
    taskId: string;
    sourceAssetId: string;
    versionNumber: number;
    analysis: unknown;
    createdAt: number;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO product_analyses (
        id, task_id, source_asset_id, version_number, analysis_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      input.id,
      input.taskId,
      input.sourceAssetId,
      input.versionNumber,
      JSON.stringify(input.analysis),
      input.createdAt
    ).run();
  }

  async getLatestProductAnalysis(taskId: string, userId: string) {
    const row = await this.db.prepare(
      `SELECT p.id, p.task_id, p.source_asset_id, p.version_number,
        p.analysis_json, p.created_at
       FROM product_analyses p
       INNER JOIN tasks t ON t.id = p.task_id
       WHERE p.task_id = ? AND t.user_id = ?
       ORDER BY p.version_number DESC LIMIT 1`
    ).bind(taskId, userId).first<ProductAnalysisRow>();

    return row ? {
      id: row.id,
      taskId: row.task_id,
      sourceAssetId: row.source_asset_id,
      versionNumber: row.version_number,
      analysis: parseJson<unknown>(row.analysis_json),
      createdAt: row.created_at
    } : null;
  }

  async saveAnalysisMap(input: {
    id: string;
    taskId: string;
    versionNumber: number;
    analysisMap: unknown;
    createdAt: number;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO analysis_maps (
        id, task_id, version_number, analysis_map_json, created_at
      ) VALUES (?, ?, ?, ?, ?)`
    ).bind(
      input.id,
      input.taskId,
      input.versionNumber,
      JSON.stringify(input.analysisMap),
      input.createdAt
    ).run();
  }

  async getLatestAnalysisMap(taskId: string, userId: string) {
    const row = await this.db.prepare(
      `SELECT m.id, m.task_id, m.version_number, m.analysis_map_json, m.created_at
       FROM analysis_maps m
       INNER JOIN tasks t ON t.id = m.task_id
       WHERE m.task_id = ? AND t.user_id = ?
       ORDER BY m.version_number DESC LIMIT 1`
    ).bind(taskId, userId).first<AnalysisMapRow>();

    return row ? {
      id: row.id,
      taskId: row.task_id,
      versionNumber: row.version_number,
      analysisMap: parseJson<unknown>(row.analysis_map_json),
      createdAt: row.created_at
    } : null;
  }

  async saveRevisionRequest(input: {
    id: string;
    taskId: string;
    userId: string;
    instruction: string;
    baseVersionNumber: number;
    createdAt: number;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO revision_requests (
        id, task_id, user_id, instruction, base_version_number, created_at
      ) SELECT ?, t.id, ?, ?, ?, ? FROM tasks t
        WHERE t.id = ? AND t.user_id = ?`
    ).bind(
      input.id,
      input.userId,
      input.instruction,
      input.baseVersionNumber,
      input.createdAt,
      input.taskId,
      input.userId
    ).run();
  }

  async listRevisionRequests(taskId: string, userId: string) {
    const result = await this.db.prepare(
      `SELECT r.id, r.task_id, r.user_id, r.instruction,
        r.base_version_number, r.created_at
       FROM revision_requests r
       INNER JOIN tasks t ON t.id = r.task_id
       WHERE r.task_id = ? AND t.user_id = ?
       ORDER BY r.created_at DESC, r.id DESC`
    ).bind(taskId, userId).all<RevisionRequestRow>();

    return result.results.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      instruction: row.instruction,
      baseVersionNumber: row.base_version_number,
      createdAt: row.created_at
    }));
  }

  async saveUsageRecord(input: {
    id: string;
    taskId: string;
    attemptId?: string;
    provider: string;
    operation: string;
    calls: number;
    actualAmountFen?: number;
    createdAt: number;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO usage_records (
        id, task_id, attempt_id, provider, operation, calls,
        actual_amount_fen, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      input.id,
      input.taskId,
      input.attemptId ?? null,
      input.provider,
      input.operation,
      input.calls,
      input.actualAmountFen ?? null,
      input.createdAt
    ).run();
  }

  async listUsageRecords(taskId: string, userId: string) {
    const result = await this.db.prepare(
      `SELECT u.id, u.task_id, u.attempt_id, u.provider, u.operation,
        u.calls, u.actual_amount_fen, u.created_at
       FROM usage_records u
       INNER JOIN tasks t ON t.id = u.task_id
       WHERE u.task_id = ? AND t.user_id = ?
       ORDER BY u.created_at DESC, u.id DESC`
    ).bind(taskId, userId).all<UsageRecordRow>();

    return result.results.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      attemptId: row.attempt_id,
      provider: row.provider,
      operation: row.operation,
      calls: row.calls,
      actualAmountFen: row.actual_amount_fen,
      createdAt: row.created_at
    }));
  }

  async createTask(input: {
    id: string;
    userId: string;
    companyId: string;
    title: string;
    goal: TaskGoal;
    inputMode: InputMode;
    market: string;
    platform: string;
    status: string;
    allowedOperations: string[];
    referenceGeneration?: string[];
    aiVideoEnabled: boolean;
    budgetFen?: number;
    createdAt: number;
    input?: unknown;
  }): Promise<TaskRecord> {
    await this.db
      .prepare(
        `INSERT INTO tasks (
          id, user_id, company_id, title, goal, input_mode, market, platform,
          status, allowed_operations_json, reference_generation_json,
          ai_video_enabled, budget_fen, input_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.userId,
        input.companyId,
        input.title,
        input.goal,
        input.inputMode,
        input.market,
        input.platform,
        input.status,
        JSON.stringify(input.allowedOperations),
        input.referenceGeneration ? JSON.stringify(input.referenceGeneration) : null,
        input.aiVideoEnabled ? 1 : 0,
        input.budgetFen ?? null,
        JSON.stringify(input.input ?? {}),
        input.createdAt,
        input.createdAt
      )
      .run();

    const task = await this.getTaskForUser(input.id, input.userId);
    if (!task) throw new Error("Created task could not be read back");
    return task;
  }

  async getTaskForUser(taskId: string, userId: string): Promise<TaskRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, user_id, company_id, title, goal, input_mode, market, platform,
          status, allowed_operations_json, reference_generation_json,
          ai_video_enabled, budget_fen, input_json, created_at, updated_at
         FROM tasks WHERE id = ? AND user_id = ?`
      )
      .bind(taskId, userId)
      .first<TaskRow>();

    return row ? mapTask(row) : null;
  }

  async listTasksForUser(userId: string): Promise<TaskRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, user_id, company_id, title, goal, input_mode, market, platform,
          status, allowed_operations_json, reference_generation_json,
          ai_video_enabled, budget_fen, input_json, created_at, updated_at
         FROM tasks WHERE user_id = ? ORDER BY updated_at DESC`
      )
      .bind(userId)
      .all<TaskRow>();

    return result.results.map(mapTask);
  }

  async updateTaskStatus(
    taskId: string,
    userId: string,
    status: string,
    updatedAt: number
  ): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(status, updatedAt, taskId, userId)
      .run();
    return result.meta.changes === 1;
  }

  async transitionTaskStatus(
    taskId: string,
    userId: string,
    expectedStatus: string,
    nextStatus: string,
    updatedAt: number
  ): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = ?"
    ).bind(nextStatus, updatedAt, taskId, userId, expectedStatus).run();
    return result.meta.changes === 1;
  }

  async updateTaskDraft(
    taskId: string,
    userId: string,
    input: { title?: string; budgetFen?: number | null },
    updatedAt: number
  ): Promise<TaskRecord | null> {
    const current = await this.getTaskForUser(taskId, userId);
    if (!current || current.status !== "draft") return null;
    await this.db
      .prepare(
        "UPDATE tasks SET title = ?, budget_fen = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'draft'"
      )
      .bind(
        input.title ?? current.title,
        input.budgetFen === undefined ? current.budgetFen : input.budgetFen,
        updatedAt,
        taskId,
        userId
      )
      .run();
    return this.getTaskForUser(taskId, userId);
  }

  async saveAsset(input: {
    id: string;
    taskId: string;
    companyId: string;
    kind: string;
    objectKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationMs?: number;
    origin: string;
    metadata: unknown;
    createdAt: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO assets (
          id, task_id, company_id, kind, object_key, original_filename, mime_type,
          size_bytes, width, height, duration_ms, origin, metadata_json, created_at
        ) SELECT ?, t.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM tasks t WHERE t.id = ? AND t.company_id = ?`
      )
      .bind(
        input.id,
        input.companyId,
        input.kind,
        input.objectKey,
        input.originalFilename,
        input.mimeType,
        input.sizeBytes,
        input.width ?? null,
        input.height ?? null,
        input.durationMs ?? null,
        input.origin,
        JSON.stringify(input.metadata),
        input.createdAt,
        input.taskId,
        input.companyId
      )
      .run();
  }

  async listAssetsForTask(taskId: string, userId: string) {
    const result = await this.db
      .prepare(
        `SELECT a.id, a.task_id, a.company_id, a.kind, a.object_key,
          a.original_filename, a.mime_type, a.size_bytes, a.width, a.height,
          a.duration_ms, a.origin, a.metadata_json, a.created_at
         FROM assets a
         INNER JOIN tasks t ON t.id = a.task_id
         WHERE a.task_id = ? AND t.user_id = ?
         ORDER BY a.created_at, a.id`
      )
      .bind(taskId, userId)
      .all<AssetRow>();

    return result.results.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      companyId: row.company_id,
      kind: row.kind,
      objectKey: row.object_key,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      origin: row.origin,
      metadata: parseJson<unknown>(row.metadata_json),
      createdAt: row.created_at
    }));
  }

  async saveApproval(input: {
    id: string;
    taskId: string;
    userId: string;
    kind: string;
    decision: "approved" | "rejected";
    note?: string;
    snapshot: unknown;
    createdAt: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO approvals (
          id, task_id, user_id, kind, decision, note, snapshot_json, created_at
        ) SELECT ?, t.id, ?, ?, ?, ?, ?, ?
          FROM tasks t WHERE t.id = ? AND t.user_id = ?`
      )
      .bind(
        input.id,
        input.userId,
        input.kind,
        input.decision,
        input.note ?? null,
        JSON.stringify(input.snapshot),
        input.createdAt,
        input.taskId,
        input.userId
      )
      .run();
  }

  async saveApprovalWithIdempotency(input: {
    id: string;
    taskId: string;
    userId: string;
    companyId: string;
    key: string;
    kind: string;
    decision: "approved" | "rejected";
    note?: string;
    snapshot: unknown;
    createdAt: number;
  }): Promise<{ approval: { id: string; taskId: string; userId: string; kind: string; decision: "approved" | "rejected"; note?: string | null; snapshot: unknown; createdAt: number }; created: boolean }> {
    const approval = {
      id: input.id,
      taskId: input.taskId,
      userId: input.userId,
      kind: input.kind,
      decision: input.decision,
      note: input.note,
      snapshot: input.snapshot,
      createdAt: input.createdAt
    };
    const approvalStatement = this.db.prepare(
      `INSERT INTO approvals (id, task_id, user_id, kind, decision, note, snapshot_json, created_at)
       SELECT ?, t.id, ?, ?, ?, ?, ?, ? FROM tasks t WHERE t.id = ? AND t.user_id = ?`
    ).bind(input.id, input.userId, input.kind, input.decision, input.note ?? null,
      JSON.stringify(input.snapshot), input.createdAt, input.taskId, input.userId);
    const keyStatement = this.db.prepare(
      `INSERT INTO idempotency_keys (company_id, key, user_id, task_id, operation, attempt_id, response_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(input.companyId, input.key, input.userId, input.taskId, "approval",
      JSON.stringify({ approvalId: input.id }), input.createdAt, input.createdAt + 86_400_000);
    try {
      await this.db.batch([approvalStatement, keyStatement]);
      return { approval, created: true };
    } catch {
      const existing = await this.db.prepare(
        `SELECT response_json FROM idempotency_keys WHERE company_id = ? AND key = ? AND user_id = ? AND task_id = ? AND operation = 'approval'`
      ).bind(input.companyId, input.key, input.userId, input.taskId).first<{ response_json: string | null }>();
      if (!existing?.response_json) throw new Error("APPROVAL_IDEMPOTENCY_CONFLICT");
      const approvalId = parseJson<{ approvalId: string }>(existing.response_json).approvalId;
      const row = await this.db.prepare(
        `SELECT id, task_id, user_id, kind, decision, note, snapshot_json, created_at FROM approvals WHERE id = ?`
      ).bind(approvalId).first<ApprovalRow>();
      if (!row) throw new Error("APPROVAL_IDEMPOTENCY_MISSING");
      return { approval: { id: row.id, taskId: row.task_id, userId: row.user_id, kind: row.kind,
        decision: row.decision, note: row.note, snapshot: parseJson<unknown>(row.snapshot_json), createdAt: row.created_at }, created: false };
    }
  }

  async getApprovalForIdempotency(input: {
    companyId: string;
    key: string;
    userId: string;
    taskId: string;
  }) {
    const row = await this.db.prepare(
      `SELECT a.id, a.task_id, a.user_id, a.kind, a.decision, a.note, a.snapshot_json, a.created_at
       FROM idempotency_keys k
       INNER JOIN approvals a ON a.id = json_extract(k.response_json, '$.approvalId')
       WHERE k.company_id = ? AND k.key = ? AND k.user_id = ? AND k.task_id = ? AND k.operation = 'approval'`
    ).bind(input.companyId, input.key, input.userId, input.taskId).first<ApprovalRow>();
    return row ? { id: row.id, taskId: row.task_id, userId: row.user_id, kind: row.kind,
      decision: row.decision, note: row.note, snapshot: parseJson<unknown>(row.snapshot_json), createdAt: row.created_at } : null;
  }

  async approveReviewTransition(input: {
    id: string;
    taskId: string;
    userId: string;
    companyId: string;
    key: string;
    kind: "preview" | "content" | "final";
    action: "approve_preview" | "approve_content" | "approve_final";
    expectedStatus: string;
    nextStatus: string;
    createdAt: number;
  }) {
    const existing = await this.getApprovalForIdempotency(input);
    if (existing) return { approval: existing, created: false };
    const snapshot = { statusBefore: input.expectedStatus, statusAfter: input.nextStatus, action: input.action };
    const approvalStatement = this.db.prepare(
      `INSERT INTO approvals (id, task_id, user_id, kind, decision, note, snapshot_json, created_at)
       SELECT ?, t.id, ?, ?, 'approved', NULL, ?, ? FROM tasks t
       WHERE t.id = ? AND t.user_id = ? AND t.company_id = ? AND t.status = ?`
    ).bind(input.id, input.userId, input.kind, JSON.stringify(snapshot), input.createdAt,
      input.taskId, input.userId, input.companyId, input.expectedStatus);
    const keyStatement = this.db.prepare(
      `INSERT INTO idempotency_keys (company_id, key, user_id, task_id, operation, attempt_id, response_json, created_at, expires_at)
       SELECT ?, ?, ?, ?, 'approval', NULL, ?, ?, ? FROM approvals WHERE id = ?`
    ).bind(input.companyId, input.key, input.userId, input.taskId,
      JSON.stringify({ approvalId: input.id }), input.createdAt, input.createdAt + 86_400_000, input.id);
    const transitionStatement = this.db.prepare(
      `UPDATE tasks SET status = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = ? AND EXISTS (SELECT 1 FROM approvals WHERE id = ?)`
    ).bind(input.nextStatus, input.createdAt, input.taskId, input.userId, input.expectedStatus, input.id);
    try {
      await this.db.batch([approvalStatement, keyStatement, transitionStatement]);
    } catch {
      const winner = await this.getApprovalForIdempotency(input);
      if (winner) return { approval: winner, created: false };
      throw new Error("REVIEW_TRANSITION_CONFLICT");
    }
    const approval = await this.getApprovalForIdempotency(input);
    if (!approval) throw new Error("REVIEW_TRANSITION_CONFLICT");
    return { approval, created: true };
  }

  async getLatestApproval(taskId: string, userId: string, kind: string) {
    const row = await this.db
      .prepare(
        `SELECT a.id, a.task_id, a.user_id, a.kind, a.decision, a.note,
          a.snapshot_json, a.created_at
         FROM approvals a
         INNER JOIN tasks t ON t.id = a.task_id
         WHERE a.task_id = ? AND t.user_id = ? AND a.kind = ?
         ORDER BY a.created_at DESC, a.id DESC LIMIT 1`
      )
      .bind(taskId, userId, kind)
      .first<ApprovalRow>();

    return row
      ? {
          id: row.id,
          taskId: row.task_id,
          userId: row.user_id,
          kind: row.kind,
          decision: row.decision,
          note: row.note,
          snapshot: parseJson<unknown>(row.snapshot_json),
          createdAt: row.created_at
        }
      : null;
  }

  async reserveStepAttempt(input: {
    idempotencyKey: string;
    companyId: string;
    userId: string;
    taskId: string;
    operation: string;
    attempt: {
      id: string;
      step: string;
      attemptNumber: number;
      status: string;
      provider: string;
      request: unknown;
      createdAt: number;
    };
    expiresAt: number;
    expectedStatus?: string;
    nextStatus?: string;
  }): Promise<{ reserved: boolean; attemptId: string }> {
    const existing = await this.findIdempotencyKey(input.companyId, input.idempotencyKey);
    if (existing) {
      if (existing.userId !== input.userId || existing.taskId !== input.taskId ||
        existing.operation !== input.operation || !existing.attemptId) throw new Error("IDEMPOTENCY_SCOPE_CONFLICT");
      return { reserved: false, attemptId: existing.attemptId };
    }

    const attemptStatement = this.db
      .prepare(
        `INSERT INTO step_attempts (
          id, task_id, step, attempt_number, status, provider, request_json,
          created_at, updated_at
        ) SELECT ?, t.id, ?, ?, ?, ?, ?, ?, ?
          FROM tasks t WHERE t.id = ? AND t.user_id = ? AND t.company_id = ?
          AND (? IS NULL OR t.status = ?)`
      )
      .bind(
        input.attempt.id,
        input.attempt.step,
        input.attempt.attemptNumber,
        input.attempt.status,
        input.attempt.provider,
        JSON.stringify(input.attempt.request),
        input.attempt.createdAt,
        input.attempt.createdAt,
        input.taskId,
        input.userId,
        input.companyId,
        input.expectedStatus ?? null,
        input.expectedStatus ?? null
      );
    const keyStatement = this.db
      .prepare(
        `INSERT INTO idempotency_keys (
          company_id, key, user_id, task_id, operation, attempt_id, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.companyId,
        input.idempotencyKey,
        input.userId,
        input.taskId,
        input.operation,
        input.attempt.id,
        input.attempt.createdAt,
        input.expiresAt
      );

    const statements = [attemptStatement, keyStatement];
    if (input.expectedStatus && input.nextStatus) {
      statements.push(this.db.prepare(
        `UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = ?
         AND EXISTS (SELECT 1 FROM step_attempts WHERE id = ?)`
      ).bind(input.nextStatus, input.attempt.createdAt, input.taskId, input.userId,
        input.expectedStatus, input.attempt.id));
    }
    try {
      await this.db.batch(statements);
      const winner = await this.findIdempotencyKey(input.companyId, input.idempotencyKey);
      if (!winner?.attemptId || winner.userId !== input.userId || winner.taskId !== input.taskId || winner.operation !== input.operation) {
        throw new Error("ATTEMPT_STATE_CONFLICT");
      }
      return { reserved: winner.attemptId === input.attempt.id, attemptId: winner.attemptId };
    } catch (error) {
      const winner = await this.findIdempotencyKey(input.companyId, input.idempotencyKey);
      if (winner?.attemptId && winner.userId === input.userId && winner.taskId === input.taskId && winner.operation === input.operation) {
        return { reserved: false, attemptId: winner.attemptId };
      }
      throw error;
    }
  }

  private async findIdempotencyKey(companyId: string, key: string) {
    const row = await this.db
      .prepare(
        "SELECT user_id, task_id, operation, attempt_id FROM idempotency_keys WHERE company_id = ? AND key = ?"
      )
      .bind(companyId, key)
      .first<{ user_id: string; task_id: string; operation: string; attempt_id: string | null }>();
    return row ? { userId: row.user_id, taskId: row.task_id, operation: row.operation, attemptId: row.attempt_id } : null;
  }

  async getAttemptForIdempotency(input: {
    companyId: string;
    key: string;
    userId: string;
    taskId: string;
    operation: string;
  }) {
    const row = await this.db.prepare(
      `SELECT attempt_id FROM idempotency_keys
       WHERE company_id = ? AND key = ? AND user_id = ? AND task_id = ? AND operation = ?`
    ).bind(input.companyId, input.key, input.userId, input.taskId, input.operation)
      .first<{ attempt_id: string | null }>();
    return row?.attempt_id ?? null;
  }

  async listStepAttempts(taskId: string, userId: string) {
    const result = await this.db
      .prepare(
        `SELECT a.id, a.task_id, a.step, a.attempt_number, a.status, a.provider,
          a.request_json, a.result_json, a.error_code, a.created_at, a.updated_at
         FROM step_attempts a
         INNER JOIN tasks t ON t.id = a.task_id
         WHERE a.task_id = ? AND t.user_id = ?
         ORDER BY a.created_at, a.id`
      )
      .bind(taskId, userId)
      .all<AttemptRow>();

    return result.results.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      step: row.step,
      attemptNumber: row.attempt_number,
      status: row.status,
      provider: row.provider,
      request: parseJson<unknown>(row.request_json),
      result: row.result_json ? parseJson<unknown>(row.result_json) : null,
      errorCode: row.error_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async nextStepAttemptNumber(taskId: string, userId: string, step: string): Promise<number> {
    const row = await this.db.prepare(
      `SELECT COALESCE(MAX(a.attempt_number), 0) + 1 AS next_number
       FROM step_attempts a
       INNER JOIN tasks t ON t.id = a.task_id
       WHERE a.task_id = ? AND t.user_id = ? AND a.step = ?`
    ).bind(taskId, userId, step).first<{ next_number: number }>();
    return row?.next_number ?? 1;
  }

  async completeStepAttempt(input: {
    attemptId: string;
    taskId: string;
    userId: string;
    provider: string;
    result: unknown;
    updatedAt: number;
  }) {
    const result = await this.db.prepare(
      `UPDATE step_attempts SET status = 'completed', provider = ?, result_json = ?, updated_at = ?
       WHERE id = ? AND task_id = ? AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND user_id = ?)`
    ).bind(input.provider, JSON.stringify(input.result), input.updatedAt, input.attemptId,
      input.taskId, input.taskId, input.userId).run();
    return result.meta.changes === 1;
  }

  async failStepAttempt(input: {
    attemptId: string;
    taskId: string;
    userId: string;
    errorCode: string;
    updatedAt: number;
  }): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE step_attempts SET status = 'failed', error_code = ?, updated_at = ?
       WHERE id = ? AND task_id = ? AND status = 'queued'
       AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND user_id = ?)`
    ).bind(input.errorCode, input.updatedAt, input.attemptId, input.taskId,
      input.taskId, input.userId).run();
    return result.meta.changes === 1;
  }

  async failRenderAttempt(input: {
    attemptId: string;
    taskId: string;
    userId: string;
    errorCode: string;
    updatedAt: number;
  }): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `UPDATE step_attempts SET status = 'failed', error_code = ?, updated_at = ?
         WHERE id = ? AND task_id = ? AND status = 'queued'
         AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND user_id = ?)`
      ).bind(input.errorCode, input.updatedAt, input.attemptId, input.taskId, input.taskId, input.userId),
      this.db.prepare(
        `UPDATE tasks SET status = 'failed_retryable', updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'rendering'`
      ).bind(input.updatedAt, input.taskId, input.userId)
    ]);
  }

  async completeRender(input: {
    attemptId: string;
    taskId: string;
    userId: string;
    version: {
      id: string;
      versionNumber: number;
      editPlan: unknown;
      renderReceipt: unknown;
      outputAssetId?: string;
      createdAt: number;
    };
    provider: string;
    amountFen: number;
    nextStatus?: string;
    updatedAt: number;
  }): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO task_versions (
          id, task_id, version_number, edit_plan_json, render_receipt_json,
          output_asset_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(input.version.id, input.taskId, input.version.versionNumber,
        JSON.stringify(input.version.editPlan), JSON.stringify(input.version.renderReceipt),
        input.version.outputAssetId ?? null, input.version.createdAt),
      this.db.prepare(
        `UPDATE step_attempts SET status = 'completed', provider = ?, result_json = ?, updated_at = ?
         WHERE id = ? AND task_id = ? AND status = 'queued'
         AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND user_id = ?)`
      ).bind(input.provider, JSON.stringify(input.version.renderReceipt), input.updatedAt,
        input.attemptId, input.taskId, input.taskId, input.userId),
      this.db.prepare(
        `INSERT INTO cost_entries (
          id, task_id, attempt_id, category, provider, amount_fen, estimated, created_at
        ) VALUES (?, ?, ?, 'render', ?, ?, 0, ?)`
      ).bind(`cost_${crypto.randomUUID()}`, input.taskId, input.attemptId,
        input.provider, input.amountFen, input.updatedAt),
      this.db.prepare(
      `UPDATE tasks SET status = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'rendering'
         AND EXISTS (SELECT 1 FROM step_attempts WHERE id = ? AND status = 'completed')`
      ).bind(input.nextStatus ?? 'pending_content_review', input.updatedAt, input.taskId, input.userId, input.attemptId)
    ]);
  }

  async appendCostEntry(input: {
    id: string;
    taskId: string;
    attemptId?: string;
    category: string;
    provider: string;
    amountFen: number;
    estimated: boolean;
    createdAt: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO cost_entries (
          id, task_id, attempt_id, category, provider, amount_fen, estimated, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.taskId,
        input.attemptId ?? null,
        input.category,
        input.provider,
        input.amountFen,
        input.estimated ? 1 : 0,
        input.createdAt
      )
      .run();
  }

  async sumCostFen(taskId: string, userId: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(SUM(c.amount_fen), 0) AS total_fen
         FROM cost_entries c
         INNER JOIN tasks t ON t.id = c.task_id
         WHERE c.task_id = ? AND t.user_id = ?`
      )
      .bind(taskId, userId)
      .first<{ total_fen: number }>();
    return row?.total_fen ?? 0;
  }

  async saveVersion(input: {
    id: string;
    taskId: string;
    versionNumber: number;
    editPlan: unknown;
    renderReceipt?: unknown;
    outputAssetId?: string;
    createdAt: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO task_versions (
          id, task_id, version_number, edit_plan_json, render_receipt_json,
          output_asset_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.taskId,
        input.versionNumber,
        JSON.stringify(input.editPlan),
        input.renderReceipt === undefined ? null : JSON.stringify(input.renderReceipt),
        input.outputAssetId ?? null,
        input.createdAt
      )
      .run();
  }

  async listVersions(taskId: string, userId: string) {
    const result = await this.db
      .prepare(
        `SELECT v.id, v.task_id, v.version_number, v.edit_plan_json,
          v.render_receipt_json, v.output_asset_id, v.created_at
         FROM task_versions v
         INNER JOIN tasks t ON t.id = v.task_id
         WHERE v.task_id = ? AND t.user_id = ?
         ORDER BY v.version_number DESC`
      )
      .bind(taskId, userId)
      .all<VersionRow>();

    return result.results.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      versionNumber: row.version_number,
      editPlan: parseJson<unknown>(row.edit_plan_json),
      renderReceipt: row.render_receipt_json
        ? parseJson<unknown>(row.render_receipt_json)
        : null,
      outputAssetId: row.output_asset_id,
      createdAt: row.created_at
    }));
  }
}
