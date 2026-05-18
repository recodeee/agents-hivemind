export const version = 15;
export const name = 'icm-feedback';

// ICM slice 2 (`docs/icm-integration-plan.md`) — feedback lane.
// One row per "AI predicted X, real answer was Y" correction. Bodies are
// compressed via @colony/core MemoryStore.recordFeedback (same path as
// observations), so direct INSERTs that bypass the facade are a defect.
// The FTS5 mirror lets searchFeedback use bm25 across topic/prediction/
// correction/context without scanning the base table.
export const sql = `
CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic       TEXT NOT NULL,
  prediction  TEXT NOT NULL,
  correction  TEXT NOT NULL,
  context     TEXT,
  compressed  INTEGER NOT NULL DEFAULT 1,
  importance  TEXT NOT NULL DEFAULT 'medium'
              CHECK(importance IN ('critical','high','medium','low')),
  created_at  INTEGER NOT NULL,
  created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_topic ON feedback(topic);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS feedback_fts USING fts5(
  topic, prediction, correction, context,
  content='feedback', content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS feedback_ai AFTER INSERT ON feedback BEGIN
  INSERT INTO feedback_fts(rowid, topic, prediction, correction, context)
  VALUES (new.id, new.topic, new.prediction, new.correction, new.context);
END;
CREATE TRIGGER IF NOT EXISTS feedback_ad AFTER DELETE ON feedback BEGIN
  INSERT INTO feedback_fts(feedback_fts, rowid, topic, prediction, correction, context)
  VALUES ('delete', old.id, old.topic, old.prediction, old.correction, old.context);
END;
CREATE TRIGGER IF NOT EXISTS feedback_au AFTER UPDATE ON feedback BEGIN
  INSERT INTO feedback_fts(feedback_fts, rowid, topic, prediction, correction, context)
  VALUES ('delete', old.id, old.topic, old.prediction, old.correction, old.context);
  INSERT INTO feedback_fts(rowid, topic, prediction, correction, context)
  VALUES (new.id, new.topic, new.prediction, new.correction, new.context);
END;
`;
