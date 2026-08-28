CREATE TABLE product_analyses_without_asset_storage (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  source_asset_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  analysis_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, version_number)
);

INSERT INTO product_analyses_without_asset_storage (
  id, task_id, source_asset_id, version_number, analysis_json, created_at
)
SELECT id, task_id, source_asset_id, version_number, analysis_json, created_at
FROM product_analyses;

DROP TABLE product_analyses;
ALTER TABLE product_analyses_without_asset_storage RENAME TO product_analyses;

CREATE INDEX product_analyses_task_idx
  ON product_analyses(task_id, version_number DESC);
