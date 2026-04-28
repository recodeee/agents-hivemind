import type { Embedder, MemoryStore } from './memory-store.js';

// Kind weights for the task-level centroid. Tasks are characterized by
// where intent gets articulated (handoffs, decisions, blockers) more than
// by tool-use chatter. Tool-use observations flood the corpus in proportion
// to the volume of automated edits, not the importance of the task — so
// they get heavily downweighted. The defaults below are the starting point;
// tune from evidence in `colony debrief` once the predictive layer ships.
export const KIND_WEIGHTS: Record<string, number> = {
  // Intent-bearing — heavily weighted.
  handoff: 2.0,
  decision: 2.0,
  blocker: 1.5,
  proposal: 1.0,
  message: 1.0,
  // Coordination substrate — moderately weighted.
  claim: 1.0,
  note: 1.0,
  // Tool-use observations are noisy by volume.
  'tool-use': 0.25,
  tool_use: 0.25,
};

const DEFAULT_KIND_WEIGHT = 1.0;

// Minimum number of embedded observations required before computing a task
// embedding. Below this floor the centroid is dominated by individual
// observation noise — better to return null and let the suggestion layer
// honestly refuse than to invent a vector from too little signal.
export const MIN_EMBEDDED_OBSERVATIONS = 5;

// Cache freshness window. The cache is considered fresh when
// |cached_count - current_count| / cached_count < CACHE_DRIFT_TOLERANCE.
// 0.2 = 20% drift before recomputation, the same tolerance the brief calls
// out as the load-bearing tradeoff between cost and freshness.
export const CACHE_DRIFT_TOLERANCE = 0.2;

// Compute the task-level embedding as a kind-weighted centroid of its
// observation embeddings. Returns null when the task is too sparse to
// produce a meaningful vector (the honesty discipline — sparse data
// must produce honest no-results). The function is pure: no I/O side
// effects, no caching. The caller decides when to persist via
// getOrComputeTaskEmbedding.
export function computeTaskEmbedding(
  store: MemoryStore,
  task_id: number,
  embedder: Embedder,
): Float32Array | null {
  const observations = store.storage.taskTimeline(task_id, 1000);

  const dim = embedder.dim;
  const centroid = new Float32Array(dim);
  let totalWeight = 0;
  let embeddedCount = 0;

  for (const obs of observations) {
    const row = store.storage.getEmbedding(obs.id);
    if (!row || row.model !== embedder.model || row.dim !== dim) continue;
    const weight = KIND_WEIGHTS[obs.kind] ?? DEFAULT_KIND_WEIGHT;
    if (weight <= 0) continue;
    const vec = row.vec;
    // The `?? 0` guards are unreachable at runtime — `Float32Array` always
    // returns `number` for in-range indices — but TypeScript's
    // `noUncheckedIndexedAccess` types each access as `number | undefined`.
    // Using `?? 0` instead of a `!` assertion keeps biome's lint happy.
    for (let i = 0; i < dim; i++) {
      centroid[i] = (centroid[i] ?? 0) + (vec[i] ?? 0) * weight;
    }
    totalWeight += weight;
    embeddedCount += 1;
  }

  if (embeddedCount < MIN_EMBEDDED_OBSERVATIONS) return null;
  if (totalWeight === 0) return null;
  for (let i = 0; i < dim; i++) {
    centroid[i] = (centroid[i] ?? 0) / totalWeight;
  }

  // Normalize to unit length so cosine similarity reduces to a dot
  // product downstream — meaningful speed win once a corpus has more
  // than a few hundred tasks.
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const c = centroid[i] ?? 0;
    norm += c * c;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return null;
  for (let i = 0; i < dim; i++) {
    centroid[i] = (centroid[i] ?? 0) / norm;
  }

  return centroid;
}

// Memoizing wrapper. Reads the cached embedding when fresh; recomputes
// and persists otherwise. Cache invalidation is tied to the task's
// observation count drifting more than CACHE_DRIFT_TOLERANCE relative
// to the cached value, OR the cached model not matching the current
// embedder. Either signal means the cached vector is no longer
// representative of the task.
export function getOrComputeTaskEmbedding(
  store: MemoryStore,
  task_id: number,
  embedder: Embedder,
): Float32Array | null {
  const cached = store.storage.getTaskEmbedding(task_id);
  const currentObsCount = store.storage.countTaskObservations(task_id);

  if (cached && cached.model === embedder.model && cached.dim === embedder.dim) {
    // Avoid divide-by-zero when the cached row was computed from a
    // (now-impossible) zero-observation state. Treat cached_count = 0
    // as "always recompute" — the row should not have existed.
    const drift =
      cached.observation_count > 0
        ? Math.abs(cached.observation_count - currentObsCount) / cached.observation_count
        : Number.POSITIVE_INFINITY;
    if (drift <= CACHE_DRIFT_TOLERANCE) {
      // Return a fresh copy so callers can mutate without poisoning
      // the cache row's underlying buffer.
      return new Float32Array(cached.vec);
    }
  }

  const fresh = computeTaskEmbedding(store, task_id, embedder);
  if (fresh) {
    store.storage.upsertTaskEmbedding({
      task_id,
      model: embedder.model,
      dim: embedder.dim,
      vec: fresh,
      observation_count: currentObsCount,
      computed_at: Date.now(),
    });
  }
  return fresh;
}
