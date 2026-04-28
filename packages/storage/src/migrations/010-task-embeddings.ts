export const version = 10;
export const name = 'task-embeddings';

export const sql = `
CREATE TABLE IF NOT EXISTS task_embeddings (
  task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  embedding BLOB NOT NULL,
  observation_count INTEGER NOT NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_embeddings_model ON task_embeddings(model, dim);
`;
