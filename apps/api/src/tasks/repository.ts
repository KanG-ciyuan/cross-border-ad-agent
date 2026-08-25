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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TaskRepository {
  constructor(private readonly db: D1Database) {}

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
  }): Promise<TaskRecord> {
    await this.db
      .prepare(
        `INSERT INTO tasks (
          id, user_id, company_id, title, goal, input_mode, market, platform,
          status, allowed_operations_json, reference_generation_json,
          ai_video_enabled, budget_fen, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          ai_video_enabled, budget_fen, created_at, updated_at
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
          ai_video_enabled, budget_fen, created_at, updated_at
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
  }): Promise<{ reserved: boolean; attemptId: string }> {
    const existing = await this.findAttemptForIdempotencyKey(
      input.companyId,
      input.idempotencyKey
    );
    if (existing) return { reserved: false, attemptId: existing };

    const attemptStatement = this.db
      .prepare(
        `INSERT INTO step_attempts (
          id, task_id, step, attempt_number, status, provider, request_json,
          created_at, updated_at
        ) SELECT ?, t.id, ?, ?, ?, ?, ?, ?, ?
          FROM tasks t WHERE t.id = ? AND t.user_id = ? AND t.company_id = ?`
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
        input.companyId
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

    try {
      await this.db.batch([attemptStatement, keyStatement]);
      return { reserved: true, attemptId: input.attempt.id };
    } catch (error) {
      const winner = await this.findAttemptForIdempotencyKey(
        input.companyId,
        input.idempotencyKey
      );
      if (winner) return { reserved: false, attemptId: winner };
      throw error;
    }
  }

  private async findAttemptForIdempotencyKey(companyId: string, key: string) {
    const row = await this.db
      .prepare(
        "SELECT attempt_id FROM idempotency_keys WHERE company_id = ? AND key = ?"
      )
      .bind(companyId, key)
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
