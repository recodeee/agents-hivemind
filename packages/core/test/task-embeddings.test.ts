import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Embedder } from '../src/memory-store.js';
import { MemoryStore } from '../src/memory-store.js';
import {
  CACHE_DRIFT_TOLERANCE,
  computeTaskEmbedding,
  getOrComputeTaskEmbedding,
} from '../src/task-embeddings.js';

let dir: string;
let store: MemoryStore;

const DIM = 4;

class FakeEmbedder implements Embedder {
  readonly model: string;
  readonly dim = DIM;
  constructor(model: string) {
    this.model = model;
  }
  // The compute path doesn't call embed() — it reads pre-stored vectors
  // from storage. We provide a stub so the type contract is satisfied.
  embed(_text: string): Promise<Float32Array> {
    return Promise.resolve(new Float32Array(this.dim));
  }
}

function seed(...ids: string[]): void {
  for (const id of ids) {
    store.startSession({ id, ide: 'claude-code', cwd: '/r' });
  }
}

function createTask(branch: string): number {
  const row = store.storage.findOrCreateTask({
    title: branch,
    repo_root: '/r',
    branch,
    created_by: 'claude',
  });
  return row.id;
}

// Add an observation on the task and store an embedding for it. The
// embedding is a unit vector aligned with `axis` (0..DIM-1), which lets
// tests verify directional properties of the centroid.
function addEmbeddedObservation(p: {
  task_id: number;
  kind: string;
  axis: number;
  model: string;
}): number {
  const obs_id = store.addObservation({
    session_id: 'claude',
    task_id: p.task_id,
    kind: p.kind,
    content: `${p.kind} obs aligned with axis ${p.axis}`,
  });
  const vec = new Float32Array(DIM);
  vec[p.axis] = 1;
  store.storage.putEmbedding(obs_id, p.model, vec);
  return obs_id;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-task-embeddings-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  seed('claude');
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('computeTaskEmbedding', () => {
  it('returns null for an empty task (no observations)', () => {
    const task_id = createTask('empty/task');
    const result = computeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(result).toBeNull();
  });

  it('returns null when fewer than 5 observations have embeddings', () => {
    const task_id = createTask('sparse/task');
    // Three observations with embeddings, one without — total 4 embedded.
    for (let i = 0; i < 3; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm1' });
    }
    store.addObservation({
      session_id: 'claude',
      task_id,
      kind: 'note',
      content: 'no embedding for this one',
    });
    const result = computeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(result).toBeNull();
  });

  it('biases the centroid toward heavily-weighted kinds (decisions over tool-use)', () => {
    // Two synthetic tasks with the SAME shape:
    //   - 1 observation aligned with axis 0, kind 'decision' (weight 2.0)
    //   - 10 observations aligned with axis 1, kind 'tool-use' (weight 0.25)
    // With kind weights, axis 0's contribution is 1 * 2.0 = 2.0 and axis 1's
    // is 10 * 0.25 = 2.5 — comparable magnitudes, so the centroid is roughly
    // balanced between axes. With UNIFORM weights it would be 1 vs 10,
    // strongly pulling toward axis 1.
    //
    // The test asserts the kind-weighted centroid is closer to axis 0 than
    // a uniform-mean centroid would have been — i.e. the bias toward
    // decision actually shows up.
    const task_id = createTask('weighted/task');
    addEmbeddedObservation({ task_id, kind: 'decision', axis: 0, model: 'm1' });
    for (let i = 0; i < 10; i++) {
      addEmbeddedObservation({ task_id, kind: 'tool-use', axis: 1, model: 'm1' });
    }
    const weighted = computeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(weighted).not.toBeNull();
    if (!weighted) return;

    // Manually compute the uniform-mean centroid for comparison.
    const uniform = new Float32Array(DIM);
    // 1 axis-0 vector + 10 axis-1 vectors, mean.
    uniform[0] = 1 / 11;
    uniform[1] = 10 / 11;
    // Normalize uniform.
    let n = 0;
    for (let i = 0; i < DIM; i++) {
      const u = uniform[i] ?? 0;
      n += u * u;
    }
    n = Math.sqrt(n);
    for (let i = 0; i < DIM; i++) {
      uniform[i] = (uniform[i] ?? 0) / n;
    }

    // weighted[0] should be larger (closer to axis-0) than uniform[0].
    expect(weighted[0] ?? 0).toBeGreaterThan(uniform[0] ?? 0);
  });

  it('returned embeddings are unit-length (cosine reduces to dot product)', () => {
    const task_id = createTask('normalize/task');
    for (let i = 0; i < 5; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: i % DIM, model: 'm1' });
    }
    const result = computeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(result).not.toBeNull();
    if (!result) return;
    let norm = 0;
    for (let i = 0; i < DIM; i++) {
      const r = result[i] ?? 0;
      norm += r * r;
    }
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });
});

describe('getOrComputeTaskEmbedding', () => {
  it('caches on first call and serves the cache when the count has not drifted', () => {
    const task_id = createTask('cache/fresh');
    for (let i = 0; i < 10; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: i % DIM, model: 'm1' });
    }
    const first = getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(first).not.toBeNull();

    const cached = store.storage.getTaskEmbedding(task_id);
    expect(cached).toBeDefined();
    expect(cached?.observation_count).toBe(10);
    const cachedComputedAt = cached?.computed_at;

    // Add one observation — count goes to 11. 1/10 = 10% drift, well
    // below the 20% tolerance, so the cache should still serve.
    addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm1' });
    expect(CACHE_DRIFT_TOLERANCE).toBe(0.2);
    const second = getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(second).not.toBeNull();

    const stillCached = store.storage.getTaskEmbedding(task_id);
    // computed_at should be unchanged: cache served, not recomputed.
    expect(stillCached?.computed_at).toBe(cachedComputedAt);
    expect(stillCached?.observation_count).toBe(10);
  });

  it('recomputes when observation count drifts above the tolerance', () => {
    const task_id = createTask('cache/drift');
    for (let i = 0; i < 5; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm1' });
    }
    getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    const cached = store.storage.getTaskEmbedding(task_id);
    expect(cached?.observation_count).toBe(5);

    // Add 3 more observations → count 8, drift = 3/5 = 60% > 20%.
    for (let i = 0; i < 3; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 1, model: 'm1' });
    }
    getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    const recomputed = store.storage.getTaskEmbedding(task_id);
    expect(recomputed?.observation_count).toBe(8);
  });

  it('recomputes when the embedder model differs from the cached model', () => {
    const task_id = createTask('cache/model');
    for (let i = 0; i < 5; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm1' });
    }
    getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    const firstCache = store.storage.getTaskEmbedding(task_id);
    expect(firstCache?.model).toBe('m1');

    // Re-stamp embeddings under a different model so the new computation
    // can find them. (In production, dropEmbeddingsWhereModelNot keeps the
    // observation embeddings consistent with the active model.)
    for (let i = 0; i < 5; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm2' });
    }
    getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m2'));
    const secondCache = store.storage.getTaskEmbedding(task_id);
    expect(secondCache?.model).toBe('m2');
  });
});
