import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Embedder } from '../src/memory-store.js';
import { MemoryStore } from '../src/memory-store.js';
import { findSimilarTasks } from '../src/similarity-search.js';

let dir: string;
let store: MemoryStore;

const DIM = 4;
const MODEL = 'm1';

class FakeEmbedder implements Embedder {
  readonly model = MODEL;
  readonly dim = DIM;
  embed(_text: string): Promise<Float32Array> {
    return Promise.resolve(new Float32Array(this.dim));
  }
}

function createTask(repo_root: string, branch: string): number {
  const row = store.storage.findOrCreateTask({
    title: branch,
    repo_root,
    branch,
    created_by: 'codex',
  });
  return row.id;
}

function seedTask(repo_root: string, branch: string, vec: Float32Array): number {
  const task_id = createTask(repo_root, branch);
  for (let i = 0; i < 5; i++) {
    const obs_id = store.addObservation({
      session_id: 'codex',
      task_id,
      kind: 'note',
      content: `${branch} observation ${i}`,
    });
    store.storage.putEmbedding(obs_id, MODEL, vec);
  }
  return task_id;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-similarity-search-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  store.startSession({ id: 'codex', ide: 'codex', cwd: '/repo' });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('findSimilarTasks', () => {
  it('returns [] on an empty corpus', () => {
    expect(findSimilarTasks(store, new FakeEmbedder(), new Float32Array([1, 0, 0, 0]))).toEqual([]);
  });

  it('removes exclude_task_ids from results', () => {
    const excluded = seedTask('/repo', 'feat/excluded', new Float32Array([1, 0, 0, 0]));
    const included = seedTask('/repo', 'feat/included', new Float32Array([1, 0, 0, 0]));

    const results = findSimilarTasks(store, new FakeEmbedder(), new Float32Array([1, 0, 0, 0]), {
      exclude_task_ids: [excluded],
      min_similarity: 0.9,
    });

    expect(results.map((r) => r.task_id)).toEqual([included]);
  });

  it('scopes results by repo_root', () => {
    seedTask('/repo/a', 'feat/shared-name', new Float32Array([1, 0, 0, 0]));
    const scoped = seedTask('/repo/b', 'feat/shared-name', new Float32Array([1, 0, 0, 0]));

    const results = findSimilarTasks(store, new FakeEmbedder(), new Float32Array([1, 0, 0, 0]), {
      repo_root: '/repo/b',
      min_similarity: 0.9,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      task_id: scoped,
      branch: 'feat/shared-name',
      repo_root: '/repo/b',
      status: 'in-progress',
      observation_count: 5,
    });
  });

  it('sorts by similarity descending and respects min_similarity', () => {
    const exact = seedTask('/repo', 'feat/exact', new Float32Array([1, 0, 0, 0]));
    const near = seedTask('/repo', 'feat/near', new Float32Array([0.8, 0.6, 0, 0]));
    seedTask('/repo', 'feat/low', new Float32Array([0.4, 0.9165151, 0, 0]));

    const results = findSimilarTasks(store, new FakeEmbedder(), new Float32Array([1, 0, 0, 0]), {
      limit: 2,
      min_similarity: 0.7,
    });

    expect(results.map((r) => r.task_id)).toEqual([exact, near]);
    expect(results[0]?.similarity).toBeGreaterThan(results[1]?.similarity ?? 0);
    expect(results.every((r) => r.similarity >= 0.7)).toBe(true);
  });
});
