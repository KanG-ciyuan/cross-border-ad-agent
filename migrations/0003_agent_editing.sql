CREATE TABLE analysis_maps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  analysis_map_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, version_number)
);

CREATE INDEX analysis_maps_task_idx
  ON analysis_maps(task_id, version_number DESC);

CREATE TABLE revision_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  instruction TEXT NOT NULL,
  base_version_number INTEGER NOT NULL CHECK (base_version_number > 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX revision_requests_task_idx
  ON revision_requests(task_id, created_at DESC);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt_id TEXT REFERENCES step_attempts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  calls INTEGER NOT NULL CHECK (calls > 0),
  actual_amount_fen INTEGER CHECK (actual_amount_fen IS NULL OR actual_amount_fen >= 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX usage_records_task_idx
  ON usage_records(task_id, created_at DESC);
