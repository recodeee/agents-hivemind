import type { MemoryStore } from './memory-store.js';
import type { SimilarTask } from './similarity-search.js';
import { SUGGESTION_THRESHOLDS } from './suggestion-thresholds.js';

// Pattern kinds that indicate trouble in similar past tasks. The set is
// deliberately narrow — we want to surface decision-relevant warnings,
// not every observation that ever existed.
export type WarnPatternKind =
  | 'expired-handoff'
  | 'cancelled-handoff'
  | 'plan-archive-blocked'
  | 'stalled-subtask';

export interface SuggestionFileRanking {
  file_path: string;
  appears_in_count: number;
  confidence: number;
}

export interface SuggestionPattern {
  description: string;
  seen_in_task_id: number;
  kind: WarnPatternKind;
}

export interface SuggestionResolutionHints {
  median_elapsed_minutes: number;
  median_handoff_count: number;
  // Null when no completed similar task used a plan (i.e. the median is
  // not meaningful). Reading callers should not interpret 0 as "the
  // median is zero" — it would mean "all completed similar tasks had
  // zero sub-tasks" which is the same as "didn't use a plan".
  median_subtask_count: number | null;
  completed_sample_size: number;
}

export interface SuggestionPayload {
  similar_tasks: SimilarTask[];
  first_files_likely_claimed: SuggestionFileRanking[];
  patterns_to_watch: SuggestionPattern[];
  resolution_hints: SuggestionResolutionHints | null;
  // The honesty field. When set, the structured fields above are empty
  // (or null) — the colony has too little data to suggest anything
  // confidently. Set this rather than producing low-quality suggestions
  // that train agents to ignore the suggestion surface.
  insufficient_data_reason: string | null;
}

export interface BuildSuggestionPayloadOptions {
  // How many of the first claimed files (per task) to count toward the
  // ranking. Default 3 — wide enough to catch common patterns, narrow
  // enough that high-volume tasks don't dominate.
  first_n_claims_per_task?: number;
  // Cap on patterns_to_watch surfaced. Default 5 — beyond that the
  // receiver tunes them out.
  max_patterns?: number;
  // Half-life (in days) for the recency-decay weighting on file rankings.
  // 30 days matches the brief's default.
  recency_half_life_days?: number;
}

const DEFAULT_FIRST_N_CLAIMS = 3;
const DEFAULT_MAX_PATTERNS = 5;
const DEFAULT_RECENCY_HALF_LIFE_DAYS = 30;
const PATTERN_DESCRIPTION_MAX_CHARS = 100;

// Build the structured suggestion payload from a list of similar tasks.
// All field-level work — ranking files, scanning patterns, computing
// medians — happens in this single pass over the similar tasks'
// observations, so cost stays linear in the corpus the caller already
// chose to surface.
//
// The honesty discipline lives at the top: when the caller couldn't find
// enough similar tasks (or the corpus is too small to begin with), the
// function short-circuits with `insufficient_data_reason` set and the
// structured fields cleared. The suggestion surface (MCP tool, CLI,
// SessionStart preface) reads that field first and refuses to suggest
// anything when it is non-null. That refusal is the load-bearing UX
// choice — agents who get noisy suggestions stop reading them, which
// destroys the feature's value permanently.
export function buildSuggestionPayload(
  store: MemoryStore,
  similar_tasks: SimilarTask[],
  options: BuildSuggestionPayloadOptions = {},
): SuggestionPayload {
  const firstN = options.first_n_claims_per_task ?? DEFAULT_FIRST_N_CLAIMS;
  const maxPatterns = options.max_patterns ?? DEFAULT_MAX_PATTERNS;
  const halfLifeDays = options.recency_half_life_days ?? DEFAULT_RECENCY_HALF_LIFE_DAYS;

  // Honesty gate 1: corpus too sparse for similarity to mean anything.
  // Checked against the store, not the input array — a small input
  // could just be a tightly-scoped query, not a hint the colony is new.
  const totalTasks = store.storage.listTasks(10_000).length;
  if (totalTasks < SUGGESTION_THRESHOLDS.MIN_CORPUS_SIZE) {
    return emptyPayload(
      similar_tasks,
      `colony has only ${totalTasks} tasks total (minimum ${SUGGESTION_THRESHOLDS.MIN_CORPUS_SIZE} for meaningful similarity)`,
    );
  }

  // Honesty gate 2: caller surfaced fewer matches than the threshold.
  if (similar_tasks.length < SUGGESTION_THRESHOLDS.MIN_SIMILAR_TASKS_FOR_SUGGESTION) {
    return emptyPayload(
      similar_tasks,
      `only ${similar_tasks.length} similar task(s) above the similarity floor (minimum ${SUGGESTION_THRESHOLDS.MIN_SIMILAR_TASKS_FOR_SUGGESTION} required)`,
    );
  }

  // Build the structured fields.
  const first_files_likely_claimed = rankFirstClaimedFiles(store, similar_tasks, {
    firstN,
    halfLifeDays,
  });
  const patterns_to_watch = collectPatternsToWatch(store, similar_tasks, maxPatterns);
  const resolution_hints = computeResolutionHints(store, similar_tasks);

  return {
    similar_tasks,
    first_files_likely_claimed,
    patterns_to_watch,
    resolution_hints,
    insufficient_data_reason: null,
  };
}

function emptyPayload(similar_tasks: SimilarTask[], reason: string): SuggestionPayload {
  return {
    similar_tasks,
    first_files_likely_claimed: [],
    patterns_to_watch: [],
    resolution_hints: null,
    insufficient_data_reason: reason,
  };
}

interface FileAccumulator {
  appears_in_count: number;
  // Sum of recency weights from the tasks in which this file appears.
  // Used to break ties in the final ranking — among files that appear
  // in the same number of tasks, the one weighted toward more recent
  // tasks ranks higher.
  weighted_count: number;
}

function rankFirstClaimedFiles(
  store: MemoryStore,
  similar_tasks: SimilarTask[],
  opts: { firstN: number; halfLifeDays: number },
): SuggestionFileRanking[] {
  const now = Date.now();
  const halfLifeMs = opts.halfLifeDays * 24 * 60 * 60 * 1000;
  const aggregate = new Map<string, FileAccumulator>();

  for (const task of similar_tasks) {
    const claims = store.storage
      .taskTimeline(task.task_id, 500)
      .filter((o) => o.kind === 'claim')
      // taskTimeline returns DESC by ts; reverse so the earliest claim
      // is first — the brief's "first claimed" rule is about which
      // files the agent reached for at the start of the task, not at
      // the end.
      .slice()
      .reverse();

    const seen = new Set<string>();
    const taskAge = task.observation_count > 0 ? now - (claims[0]?.ts ?? now) : 0;
    // Exponential decay so a task from 60 days ago contributes ~25%
    // of the weight of a task from today (with a 30-day half-life).
    const recencyWeight = 0.5 ** (taskAge / halfLifeMs);

    for (const obs of claims) {
      const meta = parseMeta(obs.metadata);
      const file_path = typeof meta.file_path === 'string' ? meta.file_path : null;
      if (!file_path) continue;
      if (seen.has(file_path)) continue;
      seen.add(file_path);
      const cur = aggregate.get(file_path) ?? { appears_in_count: 0, weighted_count: 0 };
      cur.appears_in_count += 1;
      cur.weighted_count += recencyWeight;
      aggregate.set(file_path, cur);
      if (seen.size >= opts.firstN) break;
    }
  }

  const N = similar_tasks.length;
  const ranked: SuggestionFileRanking[] = [];
  for (const [file_path, acc] of aggregate.entries()) {
    ranked.push({
      file_path,
      appears_in_count: acc.appears_in_count,
      confidence: wilsonConfidence(acc.appears_in_count, N),
    });
  }

  // Sort by confidence descending, breaking ties by recency-weighted
  // count (more recent appearances win) and then by file_path to keep
  // output deterministic.
  ranked.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const aw = aggregate.get(a.file_path)?.weighted_count ?? 0;
    const bw = aggregate.get(b.file_path)?.weighted_count ?? 0;
    if (bw !== aw) return bw - aw;
    return a.file_path.localeCompare(b.file_path);
  });

  return ranked;
}

// Wilson lower-bound for a 1-of-N proportion. Dampens the "1 of 1
// task → 100% confidence" spike that would otherwise dominate the
// ranking when the similar-task set is small. Approx 0.5 for 1/1,
// approx 0.85 for 3/3, approaches 1.0 only with larger samples.
function wilsonConfidence(positives: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96; // 95% confidence
  const p = positives / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return Math.max(0, Math.min(1, (center - margin) / denom));
}

function collectPatternsToWatch(
  store: MemoryStore,
  similar_tasks: SimilarTask[],
  cap: number,
): SuggestionPattern[] {
  const out: SuggestionPattern[] = [];
  for (const task of similar_tasks) {
    if (out.length >= cap) break;
    const observations = store.storage.taskTimeline(task.task_id, 500);
    for (const obs of observations) {
      const kind = classifyPatternKind(obs.kind, parseMeta(obs.metadata));
      if (!kind) continue;
      out.push({
        description: truncate(obs.content, PATTERN_DESCRIPTION_MAX_CHARS),
        seen_in_task_id: task.task_id,
        kind,
      });
      if (out.length >= cap) break;
    }
  }
  return out;
}

function classifyPatternKind(
  obs_kind: string,
  meta: Record<string, unknown>,
): WarnPatternKind | null {
  if (obs_kind === 'plan-archive-blocked') return 'plan-archive-blocked';
  if (obs_kind === 'stalled-subtask') return 'stalled-subtask';
  if (obs_kind === 'handoff') {
    if (meta.status === 'expired') return 'expired-handoff';
    if (meta.status === 'cancelled') return 'cancelled-handoff';
  }
  return null;
}

function computeResolutionHints(
  store: MemoryStore,
  similar_tasks: SimilarTask[],
): SuggestionResolutionHints | null {
  const completed = similar_tasks.filter((t) => t.status === 'completed');
  if (completed.length < 2) return null;

  const elapsedMinutes: number[] = [];
  const handoffCounts: number[] = [];
  const subtaskCounts: number[] = [];

  for (const task of completed) {
    const observations = store.storage.taskTimeline(task.task_id, 1000);
    if (observations.length === 0) continue;

    // taskTimeline returns DESC by ts. The latest is observations[0],
    // the earliest is the last element.
    const latest = observations[0]?.ts ?? 0;
    const earliest = observations[observations.length - 1]?.ts ?? latest;
    elapsedMinutes.push(Math.max(0, (latest - earliest) / 60000));

    let handoffs = 0;
    let subtasks = 0;
    for (const obs of observations) {
      const meta = parseMeta(obs.metadata);
      if (obs.kind === 'handoff' && meta.status === 'accepted') handoffs += 1;
      if (obs.kind === 'plan-subtask') subtasks += 1;
    }
    handoffCounts.push(handoffs);
    if (subtasks > 0) subtaskCounts.push(subtasks);
  }

  return {
    median_elapsed_minutes: median(elapsedMinutes),
    median_handoff_count: median(handoffCounts),
    median_subtask_count: subtaskCounts.length > 0 ? median(subtaskCounts) : null,
    completed_sample_size: completed.length,
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
