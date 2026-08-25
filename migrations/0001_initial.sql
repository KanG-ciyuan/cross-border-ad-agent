PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations > 0),
  created_at INTEGER NOT NULL,
  disabled_at INTEGER
);

CREATE INDEX users_company_idx ON users(company_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL CHECK (goal IN ('complete_creation', 'edit_only')),
  input_mode TEXT NOT NULL CHECK (input_mode IN ('video', 'product_images', 'mixed')),
  market TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  allowed_operations_json TEXT NOT NULL,
  reference_generation_json TEXT,
  ai_video_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_video_enabled IN (0, 1)),
  budget_fen INTEGER CHECK (budget_fen IS NULL OR budget_fen >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX tasks_user_updated_idx ON tasks(user_id, updated_at DESC);
CREATE INDEX tasks_company_updated_idx ON tasks(company_id, updated_at DESC);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  origin TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX assets_task_idx ON assets(task_id, created_at);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note TEXT,
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX approvals_task_kind_idx ON approvals(task_id, kind, created_at DESC);

CREATE TABLE step_attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(task_id, step, attempt_number)
);

CREATE INDEX step_attempts_task_idx ON step_attempts(task_id, step);

CREATE TABLE idempotency_keys (
  company_id TEXT NOT NULL,
  key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  attempt_id TEXT REFERENCES step_attempts(id) ON DELETE SET NULL,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(company_id, key)
);

CREATE INDEX idempotency_expiry_idx ON idempotency_keys(expires_at);

CREATE TABLE cost_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt_id TEXT REFERENCES step_attempts(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  estimated INTEGER NOT NULL CHECK (estimated IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX cost_entries_task_idx ON cost_entries(task_id, created_at);

CREATE TABLE task_versions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  edit_plan_json TEXT NOT NULL,
  render_receipt_json TEXT,
  output_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, version_number)
);

CREATE INDEX task_versions_task_idx ON task_versions(task_id, version_number DESC);
