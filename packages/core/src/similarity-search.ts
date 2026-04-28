import type { ObservationRow, TaskRow } from '@colony/storage';
import type { Embedder, MemoryStore } from './memory-store.js';
import { getOrComputeTaskEmbedding } from './task-embeddings.js';

const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SIMILARITY = 0.5;
const TASK_SCAN_LIMIT = 10_000;
const ABANDONED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type SimilarTaskStatus = 'completed' | 'abandoned' | 'in-progress';

export interface FindSimilarTasksOptions {
  limit?: number;
  repo_root?: string;
  exclude_task_ids?: readonly number[];
  min_similarity?: number;
  now?: number;
}

export interface SimilarTaskResult {
  task_id: number;
  similarity: number;
  branch: string;
  repo_root: string;
  status: SimilarTaskStatus;
  observation_count: number;
}

export function findSimilarTasks(
  store: MemoryStore,
  embedder: Embedder,
  query_embedding: Float32Array,
  options: FindSimilarTasksOptions = {},
): SimilarTaskResult[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  const query = normalizeQuery(query_embedding, embedder.dim);
  if (!query) return [];

  const excluded = new Set(options.exclude_task_ids ?? []);
  const minSimilarity = options.min_similarity ?? DEFAULT_MIN_SIMILARITY;
  const scored: Array<{ task: TaskRow; similarity: number }> = [];

  for (const task of store.storage.listTasks(TASK_SCAN_LIMIT)) {
    if (options.repo_root !== undefined && task.repo_root !== options.repo_root) continue;
    if (excluded.has(task.id)) continue;

    const taskEmbedding = getOrComputeTaskEmbedding(store, task.id, embedder);
    if (!taskEmbedding || taskEmbedding.length !== embedder.dim) continue;

    const similarity = dot(query, taskEmbedding);
    if (similarity < minSimilarity) continue;
    scored.push({ task, similarity });
  }

  scored.sort((a, b) => b.similarity - a.similarity || a.task.id - b.task.id);

  const now = options.now ?? Date.now();
  return scored.slice(0, limit).map(({ task, similarity }) => {
    const timeline = store.storage.taskTimeline(task.id, 50);
    return {
      task_id: task.id,
      similarity,
      branch: task.branch,
      repo_root: task.repo_root,
      status: classifyStatus(task, timeline, now),
      observation_count: store.storage.countTaskObservations(task.id),
    };
  });
}

function normalizeQuery(vec: Float32Array, expectedDim: number): Float32Array | null {
  if (vec.length !== expectedDim) return null;
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return null;

  const out = new Float32Array(expectedDim);
  for (let i = 0; i < expectedDim; i++) {
    out[i] = (vec[i] ?? 0) / norm;
  }
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

function classifyStatus(task: TaskRow, timeline: ObservationRow[], now: number): SimilarTaskStatus {
  if (isPlanAutoArchived(task, timeline)) return 'completed';

  const last = timeline[0];
  if (last && isAcceptedHandoff(last)) return 'completed';
  if (last && now - last.ts > ABANDONED_AFTER_MS) return 'abandoned';
  return 'in-progress';
}

function isPlanAutoArchived(task: TaskRow, timeline: ObservationRow[]): boolean {
  const taskStatus = task.status.toLowerCase();
  if (['auto-archived', 'archived', 'completed'].includes(taskStatus)) return true;

  return timeline.some((obs) => {
    const kind = obs.kind.toLowerCase();
    if (kind === 'plan-auto-archive' || kind === 'plan_auto_archive') return true;
    const meta = parseMeta(obs.metadata);
    return (
      meta.kind === 'plan-auto-archive' ||
      meta.kind === 'plan_auto_archive' ||
      meta.auto_archived === true ||
      meta.autoArchived === true
    );
  });
}

function isAcceptedHandoff(obs: ObservationRow): boolean {
  if (obs.kind !== 'handoff') return false;
  const meta = parseMeta(obs.metadata);
  return meta.status === 'accepted';
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
