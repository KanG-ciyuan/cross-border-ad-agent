CREATE TABLE product_analyses (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  source_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  analysis_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, version_number)
);

CREATE INDEX product_analyses_task_idx
  ON product_analyses(task_id, version_number DESC);
