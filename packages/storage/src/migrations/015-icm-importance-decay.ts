/**
 * ICM slice 3 — observation importance + temporal decay.
 *
 * Every observation gains four columns:
 *
 *   importance        TEXT   ('critical' | 'high' | 'medium' | 'low'), default 'medium'.
 *   access_count      INTEGER, default 0. Bumped lazily on read paths.
 *   last_accessed_at  INTEGER, nullable. Wall-clock ms of last recordAccess call.
 *   weight            REAL,   default 1.0. Recomputed on access from
 *                              baseWeight(importance) / (1 + access_count * 0.1)
 *                              for medium/low. critical/high are pinned to their
 *                              base weight and never decay.
 *
 * Critical/high are never pruned; medium/low fade as access_count grows unless
 * the row is re-touched. `pruneLowDecay({ minWeight })` is an opt-in storage
 * method (no automatic deletion).
 *
 * In this codebase, the runtime schema is bootstrapped by re-executing
 * `SCHEMA_SQL` (idempotent `CREATE TABLE IF NOT EXISTS`) plus `COLUMN_MIGRATIONS`
 * (`ALTER TABLE ADD COLUMN` guarded by `PRAGMA table_info`). This file is the
 * canonical reference for the slice 3 columns; the live add happens via the
 * SCHEMA_SQL DDL update (fresh DBs) and COLUMN_MIGRATIONS (existing DBs).
 */

export const version = 15;
export const name = 'icm-importance-decay';

export const sql = `
ALTER TABLE observations ADD COLUMN importance TEXT NOT NULL DEFAULT 'medium'
  CHECK(importance IN ('critical','high','medium','low'));
ALTER TABLE observations ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE observations ADD COLUMN last_accessed_at INTEGER;
ALTER TABLE observations ADD COLUMN weight REAL NOT NULL DEFAULT 1.0;
CREATE INDEX IF NOT EXISTS idx_observations_importance ON observations(importance);
CREATE INDEX IF NOT EXISTS idx_observations_weight ON observations(weight);
`;
