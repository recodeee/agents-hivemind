import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Storage } from '../src/index.js';

let dir: string;
let storage: Storage;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-feedback-'));
  storage = new Storage(join(dir, 'test.db'));
});

afterEach(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Storage — feedback (ICM slice 2)', () => {
  it('insertFeedback assigns an id and stores the row verbatim', () => {
    const id = storage.insertFeedback({
      topic: 'frontend.routing',
      prediction: 'useRouter returns null in server components',
      correction: 'useRouter throws in server components',
      context: 'reviewing apps/web App Router migration',
      importance: 'high',
      created_by: 'claude',
      created_at: 1_700_000_000,
    });
    expect(id).toBeGreaterThan(0);

    const row = storage.getFeedback(id);
    expect(row).toMatchObject({
      id,
      topic: 'frontend.routing',
      prediction: 'useRouter returns null in server components',
      correction: 'useRouter throws in server components',
      context: 'reviewing apps/web App Router migration',
      compressed: 1,
      importance: 'high',
      created_at: 1_700_000_000,
      created_by: 'claude',
    });
  });

  it('defaults importance to medium and accepts null context', () => {
    const id = storage.insertFeedback({
      topic: 'pgsql',
      prediction:
        'ALTER TABLE ... DROP CONSTRAINT works inside a transaction on partitioned tables',
      correction: 'must run outside a transaction on partitioned tables in postgres 15',
    });
    const row = storage.getFeedback(id);
    expect(row?.importance).toBe('medium');
    expect(row?.context).toBeNull();
    expect(row?.created_by).toBeNull();
  });

  it('rejects an importance outside the allowed enum', () => {
    expect(() =>
      storage.insertFeedback({
        topic: 't',
        prediction: 'p',
        correction: 'c',
        // intentionally bad — the CHECK constraint should fire
        importance: 'bogus' as 'high',
      }),
    ).toThrow();
  });

  it('searchFeedback returns compact hits ranked by FTS5 (higher = better)', () => {
    storage.insertFeedback({
      topic: 'frontend.routing',
      prediction: 'returns null inside server components',
      correction: 'throws an error inside server components',
      created_at: 1_000,
    });
    storage.insertFeedback({
      topic: 'backend.migrations',
      prediction: 'alter table works inside a transaction',
      correction: 'alter table on partitioned tables must run outside a transaction',
      created_at: 2_000,
    });

    const hits = storage.searchFeedback({ query: 'server components', limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.topic).toBe('frontend.routing');
    expect(hits[0]?.score).toBeGreaterThan(0);
    expect(hits[0]?.snippet).toContain('throws');
  });

  it('searchFeedback honors the topic filter', () => {
    storage.insertFeedback({
      topic: 'frontend.routing',
      prediction: 'returns null in server components',
      correction: 'throws in server components',
    });
    storage.insertFeedback({
      topic: 'backend.migrations',
      prediction: 'server upgrade was easy',
      correction: 'server upgrade was hard on partitioned tables',
    });

    const scoped = storage.searchFeedback({
      query: 'server',
      topic: 'frontend.routing',
      limit: 10,
    });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.topic).toBe('frontend.routing');
  });

  it('empty query with a topic falls back to a newest-first listing', () => {
    storage.insertFeedback({
      topic: 'frontend.routing',
      prediction: 'p1',
      correction: 'c1',
      created_at: 1_000,
    });
    storage.insertFeedback({
      topic: 'frontend.routing',
      prediction: 'p2',
      correction: 'c2',
      created_at: 2_000,
    });
    storage.insertFeedback({
      topic: 'other',
      prediction: 'p3',
      correction: 'c3',
      created_at: 3_000,
    });

    const hits = storage.searchFeedback({ query: '   ', topic: 'frontend.routing' });
    expect(hits).toHaveLength(2);
    expect(hits[0]?.created_at).toBe(2_000);
    expect(hits[1]?.created_at).toBe(1_000);
  });

  it('empty query without a topic returns no hits', () => {
    storage.insertFeedback({ topic: 't', prediction: 'p', correction: 'c' });
    expect(storage.searchFeedback({ query: '' })).toEqual([]);
  });

  it('feedbackStats groups rows by topic with last_created_at + count', () => {
    storage.insertFeedback({
      topic: 'a',
      prediction: 'p',
      correction: 'c',
      created_at: 1_000,
    });
    storage.insertFeedback({
      topic: 'a',
      prediction: 'p2',
      correction: 'c2',
      created_at: 3_000,
    });
    storage.insertFeedback({
      topic: 'b',
      prediction: 'p',
      correction: 'c',
      created_at: 2_000,
    });

    const all = storage.feedbackStats();
    expect(all).toEqual([
      { topic: 'a', count: 2, last_created_at: 3_000 },
      { topic: 'b', count: 1, last_created_at: 2_000 },
    ]);

    const scoped = storage.feedbackStats({ topic: 'a' });
    expect(scoped).toEqual([{ topic: 'a', count: 2, last_created_at: 3_000 }]);

    expect(storage.feedbackStats({ topic: 'missing' })).toEqual([]);
  });

  it('FTS triggers track updates and deletes', () => {
    const id = storage.insertFeedback({
      topic: 'topic',
      prediction: 'alpha beta',
      correction: 'gamma',
    });
    expect(storage.searchFeedback({ query: 'beta' })).toHaveLength(1);

    // Simulate a downstream edit (we don't expose `updateFeedback` yet, but
    // the trigger contract must hold so future surfaces can rely on it).
    const db = (storage as unknown as { db: import('better-sqlite3').Database }).db;
    db.prepare('UPDATE feedback SET prediction = ? WHERE id = ?').run('zeta', id);
    expect(storage.searchFeedback({ query: 'beta' })).toHaveLength(0);
    expect(storage.searchFeedback({ query: 'zeta' })).toHaveLength(1);

    db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
    expect(storage.searchFeedback({ query: 'zeta' })).toHaveLength(0);
  });
});
