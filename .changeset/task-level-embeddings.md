---
"@colony/core": minor
"@colony/storage": minor
---

Add task-level embeddings — a per-task vector representing the task's
"meaning" in the same embedding space the observations live in. This is
the foundation sub-system for the predictive-suggestions layer
(`task_suggest_approach`) and includes the core similarity scan used by
later surface tools.

`@colony/storage`:

- New `task_embeddings` table (schema version 10). One row per task with
  `(task_id, model, dim, embedding, observation_count, computed_at)`.
  `observation_count` is the cache invalidation key — recomputation
  triggers when the actual count drifts more than 20% from the cached
  value.
- New methods: `upsertTaskEmbedding(p)`, `getTaskEmbedding(task_id)`,
  `countTaskObservations(task_id)`, `hasEmbedding(observation_id, model?)`.
  All four are used by the core embedding-compute path; none are
  exposed to MCP yet.
- `getTaskEmbedding`, `upsertTaskEmbedding`, and
  `countTaskObservations` use cached prepared statements for the
  similarity scan hot path.

`@colony/core`:

- New module `task-embeddings.ts` exporting `computeTaskEmbedding(store,
  task_id, embedder)` and `getOrComputeTaskEmbedding(store, task_id,
  embedder)`. The compute function is a kind-weighted centroid of the
  task's observation embeddings — handoffs and decisions count 2×, claims
  and messages 1×, tool-use 0.25× — normalized to unit length so cosine
  similarity reduces to a dot product.
- Returns null when fewer than `MIN_EMBEDDED_OBSERVATIONS` (5) embeddings
  exist for the task. The honesty discipline: sparse data must produce
  honest no-results rather than invented vectors.
- Cache invalidation triggers on observation-count drift > 20% OR model
  mismatch. `KIND_WEIGHTS`, `MIN_EMBEDDED_OBSERVATIONS`, and
  `CACHE_DRIFT_TOLERANCE` are all exported so the suggestion layer can
  reference them as the load-bearing constants they are.
- New `findSimilarTasks(store, embedder, query_embedding, options)` scans
  up to 10,000 tasks, computes or reuses task embeddings, filters by repo,
  exclusions, and minimum cosine similarity, then returns top-N task
  summaries sorted by similarity.
