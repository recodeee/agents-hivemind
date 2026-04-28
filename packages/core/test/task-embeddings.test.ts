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

function normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = (vec[i] ?? 0) / norm;
  }
  return out;
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
    // Four observations with embeddings, two without — still sparse.
    for (let i = 0; i < 4; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm1' });
    }
    for (let i = 0; i < 2; i++) {
      store.addObservation({
        session_id: 'claude',
        task_id,
        kind: 'note',
        content: `no embedding for this one ${i}`,
      });
    }
    const result = computeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(result).toBeNull();
  });

  it('biases the centroid toward heavily-weighted kinds (decisions over tool-use)', () => {
    const weightedTask = createTask('weighted/task');
    addEmbeddedObservation({ task_id: weightedTask, kind: 'decision', axis: 0, model: 'm1' });
    for (let i = 0; i < 10; i++) {
      addEmbeddedObservation({ task_id: weightedTask, kind: 'tool-use', axis: 1, model: 'm1' });
    }

    const uniformTask = createTask('uniform/task');
    addEmbeddedObservation({ task_id: uniformTask, kind: 'note', axis: 0, model: 'm1' });
    for (let i = 0; i < 10; i++) {
      addEmbeddedObservation({ task_id: uniformTask, kind: 'note', axis: 1, model: 'm1' });
    }

    const weighted = computeTaskEmbedding(store, weightedTask, new FakeEmbedder('m1'));
    const uniformFromTask = computeTaskEmbedding(store, uniformTask, new FakeEmbedder('m1'));
    expect(weighted).not.toBeNull();
    expect(uniformFromTask).not.toBeNull();
    if (!weighted || !uniformFromTask) return;

    const handWeighted = normalize(new Float32Array([2, 2.5, 0, 0]));
    const handUniform = normalize(new Float32Array([1, 10, 0, 0]));

    expect(Array.from(weighted)).toEqual(Array.from(handWeighted).map((x) => expect.closeTo(x, 5)));
    expect(Array.from(uniformFromTask)).toEqual(
      Array.from(handUniform).map((x) => expect.closeTo(x, 5)),
    );
    expect(weighted[0] ?? 0).toBeGreaterThan(uniformFromTask[0] ?? 0);
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
  it('serves cache at count 11 from 10, then recomputes at count 13', () => {
    const task_id = createTask('cache/drift-threshold');
    for (let i = 0; i < 10; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 0, model: 'm1' });
    }
    const first = getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(first).not.toBeNull();

    const cached = store.storage.getTaskEmbedding(task_id);
    expect(cached).toBeDefined();
    expect(cached?.observation_count).toBe(10);
    const cachedComputedAt = cached?.computed_at;

    // Count 11: 10% drift, so cache still serves.
    addEmbeddedObservation({ task_id, kind: 'note', axis: 1, model: 'm1' });
    expect(CACHE_DRIFT_TOLERANCE).toBe(0.2);
    const second = getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    expect(second).not.toBeNull();

    const stillCached = store.storage.getTaskEmbedding(task_id);
    // computed_at should be unchanged: cache served, not recomputed.
    expect(stillCached?.computed_at).toBe(cachedComputedAt);
    expect(stillCached?.observation_count).toBe(10);

    // Count 13: 30% drift, so recompute and refresh cache metadata.
    for (let i = 0; i < 2; i++) {
      addEmbeddedObservation({ task_id, kind: 'note', axis: 1, model: 'm1' });
    }
    getOrComputeTaskEmbedding(store, task_id, new FakeEmbedder('m1'));
    const recomputed = store.storage.getTaskEmbedding(task_id);
    expect(recomputed?.observation_count).toBe(13);
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
