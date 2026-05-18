import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compress, expand } from '@colony/compress';
import { defaultSettings } from '@colony/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory-store.js';

let dir: string;
let store: MemoryStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-memory-feedback-'));
  store = new MemoryStore({
    dbPath: join(dir, 'data.db'),
    settings: {
      ...defaultSettings,
      compression: { ...defaultSettings.compression, expandForModel: false },
    },
  });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('MemoryStore feedback (ICM slice 2)', () => {
  it('compresses prediction, correction, and context before persisting', () => {
    const prediction =
      'The authentication middleware is basically really important to refresh on every single request.';
    const correction =
      'The authentication middleware is essentially only important on session creation.';
    const context =
      'The team is reviewing the apps/web authentication middleware refresh logic on the staging branch.';
    const intensity = defaultSettings.compression.intensity;

    const id = store.recordFeedback({
      topic: 'auth.middleware',
      prediction,
      correction,
      context,
      importance: 'high',
      created_by: 'claude',
    });
    expect(id).toBeGreaterThan(0);

    const stored = store.storage.getFeedback(id);
    if (!stored) throw new Error('feedback row missing');
    expect(stored.compressed).toBe(1);
    expect(stored.importance).toBe('high');
    expect(stored.created_by).toBe('claude');

    // Bodies must equal the deterministic compress() output (no raw prose).
    expect(stored.prediction).toBe(compress(prediction, { intensity }));
    expect(stored.correction).toBe(compress(correction, { intensity }));
    expect(stored.context).toBe(compress(context, { intensity }));
  });

  it('strips <private> content before compression and refuses empty rows', () => {
    const id = store.recordFeedback({
      topic: 'auth',
      prediction: '  <private>top-secret-prediction</private>  ',
      correction: 'real answer',
    });
    expect(id).toBe(-1);
  });

  it('round-trips prediction/correction/context via expand on getFeedback', () => {
    const prediction =
      'The team essentially needs to be aware that this routing layer is basically really fragile.';
    const correction =
      'The team essentially needs to roll back to the previous routing implementation immediately.';
    const id = store.recordFeedback({
      topic: 'routing',
      prediction,
      correction,
      context: 'short note',
    });

    const expanded = store.getFeedback(id, { expand: true });
    if (!expanded) throw new Error('feedback row missing');
    expect(expanded.prediction).toBe(
      expand(compress(prediction, { intensity: defaultSettings.compression.intensity })),
    );
    expect(expanded.correction).toBe(
      expand(compress(correction, { intensity: defaultSettings.compression.intensity })),
    );
    expect(expanded.context).toBe(
      expand(compress('short note', { intensity: defaultSettings.compression.intensity })),
    );

    const compressedView = store.getFeedback(id, { expand: false });
    expect(compressedView?.prediction).toBe(
      compress(prediction, { intensity: defaultSettings.compression.intensity }),
    );
  });

  it('searchFeedback returns compact hits and feedbackStats groups by topic', () => {
    // Inline code (`useRouter`) is preserved byte-for-byte by the compressor,
    // so it survives compression and remains FTS-searchable.
    store.recordFeedback({
      topic: 'frontend.routing',
      prediction: '`useRouter` returns null in server components',
      correction: '`useRouter` throws in server components',
    });
    store.recordFeedback({
      topic: 'frontend.routing',
      prediction: '`useRouter` push silently no-ops on missing route',
      correction: '`useRouter` push throws on missing route in next 15',
    });
    store.recordFeedback({
      topic: 'backend.migrations',
      prediction: '`ALTER TABLE` works inside transactions for partitioned tables',
      correction: '`ALTER TABLE` must run outside a transaction for partitioned tables',
    });

    const hits = store.searchFeedback({ query: 'useRouter', limit: 10 });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const hit of hits) {
      expect(typeof hit.snippet).toBe('string');
      expect(hit.snippet.length).toBeGreaterThan(0);
    }

    const stats = store.feedbackStats();
    const topics = stats.map((row) => row.topic);
    expect(topics).toContain('frontend.routing');
    expect(topics).toContain('backend.migrations');
    const routing = stats.find((row) => row.topic === 'frontend.routing');
    expect(routing?.count).toBe(2);
  });
});
