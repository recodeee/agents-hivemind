import type {
  AttentionInbox,
  HivemindOptions,
  HivemindSession,
  HivemindSnapshot,
  MemoryStore,
  SearchResult,
} from '@colony/core';
import {
  NEGATIVE_COORDINATION_KINDS,
  TASK_THREAD_ERROR_CODES,
  TaskThreadError,
  isNegativeCoordinationKind,
} from '@colony/core';
import type { TaskThreadErrorCode } from '@colony/core';

export interface HivemindToolOptions {
  repo_root: string | undefined;
  repo_roots: string[] | undefined;
  include_stale: boolean | undefined;
  limit: number | undefined;
}

export interface HivemindContextBuildOptions {
  maxClaims?: number;
  maxHotFiles?: number;
  attention?: HivemindContextAttentionInput;
}

export interface HivemindContextAttentionInput {
  session_id: string;
  agent: string;
  summary: AttentionInbox['summary'];
  observation_ids: number[];
  observation_ids_truncated: boolean;
}

export interface HivemindContextLane {
  repo_root: string;
  branch: string;
  task: string;
  owner: string;
  activity: HivemindSession['activity'];
  activity_summary: string;
  needs_attention: boolean;
  risk: string;
  source: HivemindSession['source'];
  worktree_path: string;
  updated_at: string;
  elapsed_seconds: number;
  locked_file_count: number;
  locked_file_preview: string[];
}

export interface HivemindContext {
  generated_at: string;
  repo_roots: string[];
  summary: {
    lane_count: number;
    total_lane_count: number;
    lanes_truncated: boolean;
    memory_hit_count: number;
    negative_warning_count: number;
    needs_attention_count: number;
    claim_count: number;
    hot_file_count: number;
    next_action: string;
  };
  counts: HivemindSnapshot['counts'];
  query: string;
  lanes: HivemindContextLane[];
  ownership: HivemindContextOwnership;
  attention: HivemindContextAttention;
  memory_hits: SearchResult[];
  negative_warnings: CompactNegativeWarning[];
}

export interface CompactNegativeWarning {
  id: number;
  kind: string;
  session_id: string;
  snippet: string;
  ts: number;
  task_id: number | null;
}

export interface HivemindContextClaim {
  file_path: string;
  branch: string;
  owner: string;
  source: HivemindSession['source'];
  worktree_path: string;
}

export interface HivemindContextHotFile {
  file_path: string;
  claim_count: number;
  branches: string[];
  owners: string[];
}

export interface HivemindContextOwnership {
  claim_count: number;
  claims: HivemindContextClaim[];
  claims_truncated: boolean;
  hot_files: HivemindContextHotFile[];
  hot_files_truncated: boolean;
}

export interface HivemindContextAttention {
  session_id: string | null;
  agent: string | null;
  counts: {
    lane_needs_attention_count: number;
    pending_handoff_count: number;
    pending_wake_count: number;
    unread_message_count: number;
    stalled_lane_count: number;
    recent_other_claim_count: number;
    blocked: boolean;
  };
  observation_ids: number[];
  observation_ids_truncated: boolean;
  hydration: string;
  next_action: string;
}

export function toHivemindOptions(input: HivemindToolOptions): HivemindOptions {
  const options: HivemindOptions = {};
  if (input.repo_root !== undefined) options.repoRoot = input.repo_root;
  if (input.repo_roots !== undefined) options.repoRoots = input.repo_roots;
  if (input.include_stale !== undefined) options.includeStale = input.include_stale;
  if (input.limit !== undefined) options.limit = input.limit;
  return options;
}

export function mcpError(err: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const error = err instanceof Error ? err.message : String(err);
  const code =
    err instanceof TaskThreadError ? err.code : TASK_THREAD_ERROR_CODES.OBSERVATION_NOT_ON_TASK;
  return {
    content: [{ type: 'text', text: JSON.stringify({ code, error }) }],
    isError: true,
  };
}

export function mcpErrorResponse(
  code:
    | TaskThreadErrorCode
    | 'SPEC_TASK_NOT_FOUND'
    | 'SPEC_CHANGE_NOT_FOUND'
    | 'PLAN_INVALID_DEPENDENCY'
    | 'PLAN_INVALID_WAVE_DEPENDENCY'
    | 'PLAN_SCOPE_OVERLAP'
    | 'PLAN_WAVE_SCOPE_OVERLAP'
    | 'PLAN_FINALIZER_NOT_LAST'
    | 'PLAN_SUBTASK_NOT_FOUND'
    | 'PLAN_SUBTASK_DEPS_UNMET'
    | 'PLAN_SUBTASK_NOT_AVAILABLE'
    | 'PLAN_SUBTASK_NOT_CLAIMED'
    | 'PLAN_SUBTASK_NOT_YOURS',
  error: string,
): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify({ code, error }) }],
    isError: true,
  };
}

export function buildContextQuery(query: string | undefined, sessions: HivemindSession[]): string {
  if (query?.trim()) return query.trim();
  const taskText = sessions
    .flatMap((session) => [
      session.task,
      session.task_name,
      session.routing_reason,
      ...session.locked_file_preview,
    ])
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(taskText)].join(' ').slice(0, 800);
}

export function buildHivemindContext(
  snapshot: HivemindSnapshot,
  memoryHits: SearchResult[],
  negativeWarnings: CompactNegativeWarning[],
  query: string,
  options: HivemindContextBuildOptions = {},
): HivemindContext {
  const lanes = snapshot.sessions.map(toContextLane);
  const needsAttentionCount = lanes.filter((lane) => lane.needs_attention).length;
  const ownership = buildOwnership(lanes, options.maxClaims, options.maxHotFiles);
  const attention = buildAttention(needsAttentionCount, options.attention);

  return {
    generated_at: snapshot.generated_at,
    repo_roots: snapshot.repo_roots,
    summary: {
      lane_count: lanes.length,
      total_lane_count: snapshot.session_count,
      lanes_truncated: snapshot.session_count > lanes.length,
      memory_hit_count: memoryHits.length,
      negative_warning_count: negativeWarnings.length,
      needs_attention_count: needsAttentionCount,
      claim_count: ownership.claim_count,
      hot_file_count: ownership.hot_files.length,
      next_action: nextAction(lanes, memoryHits, negativeWarnings, attention),
    },
    counts: snapshot.counts,
    query,
    lanes,
    ownership,
    attention,
    memory_hits: memoryHits,
    negative_warnings: negativeWarnings,
  };
}

export async function searchNegativeWarnings(
  store: MemoryStore,
  query: string,
  limit = 3,
): Promise<CompactNegativeWarning[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const results = await Promise.all(
    NEGATIVE_COORDINATION_KINDS.map((kind) => store.search(trimmed, limit, undefined, { kind })),
  );
  const byId = new Map<number, SearchResult>();
  for (const hit of results.flat()) {
    if (!isNegativeCoordinationKind(hit.kind)) continue;
    const current = byId.get(hit.id);
    if (
      !current ||
      hit.score > current.score ||
      (hit.score === current.score && hit.ts > current.ts)
    ) {
      byId.set(hit.id, hit);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score || b.ts - a.ts)
    .slice(0, limit)
    .map((hit) => ({
      id: hit.id,
      kind: hit.kind,
      session_id: hit.session_id,
      snippet: hit.snippet,
      ts: hit.ts,
      task_id: hit.task_id,
    }));
}

function toContextLane(session: HivemindSession): HivemindContextLane {
  const risk = laneRisk(session);
  return {
    repo_root: session.repo_root,
    branch: session.branch,
    task: session.task,
    owner: `${session.agent}/${session.cli}`,
    activity: session.activity,
    activity_summary: session.activity_summary,
    needs_attention: risk !== 'none',
    risk,
    source: session.source,
    worktree_path: session.worktree_path,
    updated_at: session.updated_at,
    elapsed_seconds: session.elapsed_seconds,
    locked_file_count: session.locked_file_count,
    locked_file_preview: session.locked_file_preview,
  };
}

function laneRisk(session: HivemindSession): string {
  if (session.source === 'managed-worktree') return 'stranded lane';
  if (session.activity === 'dead') return 'dead session';
  if (session.activity === 'stalled') return 'stale telemetry';
  if (session.activity === 'unknown') return 'unknown runtime state';
  return 'none';
}

function buildOwnership(
  lanes: HivemindContextLane[],
  maxClaims = 12,
  maxHotFiles = 8,
): HivemindContextOwnership {
  const claims = lanes.flatMap((lane) =>
    lane.locked_file_preview.map((filePath) => ({
      file_path: filePath,
      branch: lane.branch,
      owner: lane.owner,
      source: lane.source,
      worktree_path: lane.worktree_path,
    })),
  );
  const claimCount = lanes.reduce((total, lane) => total + lane.locked_file_count, 0);
  const allHotFiles = buildHotFiles(claims);
  const hotFiles = allHotFiles.slice(0, maxHotFiles);

  return {
    claim_count: claimCount,
    claims: claims.slice(0, maxClaims),
    claims_truncated: claimCount > Math.min(claims.length, maxClaims),
    hot_files: hotFiles,
    hot_files_truncated: allHotFiles.length > hotFiles.length,
  };
}

function buildHotFiles(claims: HivemindContextClaim[]): HivemindContextHotFile[] {
  const byFile = new Map<
    string,
    { claim_count: number; branches: Set<string>; owners: Set<string> }
  >();
  for (const claim of claims) {
    const entry = byFile.get(claim.file_path) ?? {
      claim_count: 0,
      branches: new Set<string>(),
      owners: new Set<string>(),
    };
    entry.claim_count += 1;
    entry.branches.add(claim.branch);
    entry.owners.add(claim.owner);
    byFile.set(claim.file_path, entry);
  }

  return [...byFile.entries()]
    .map(([file_path, entry]) => ({
      file_path,
      claim_count: entry.claim_count,
      branches: [...entry.branches].sort(),
      owners: [...entry.owners].sort(),
    }))
    .sort((left, right) => {
      const countDelta = right.claim_count - left.claim_count;
      return countDelta !== 0 ? countDelta : left.file_path.localeCompare(right.file_path);
    });
}

function buildAttention(
  laneNeedsAttentionCount: number,
  input: HivemindContextAttentionInput | undefined,
): HivemindContextAttention {
  return {
    session_id: input?.session_id ?? null,
    agent: input?.agent ?? null,
    counts: {
      lane_needs_attention_count: laneNeedsAttentionCount,
      pending_handoff_count: input?.summary.pending_handoff_count ?? 0,
      pending_wake_count: input?.summary.pending_wake_count ?? 0,
      unread_message_count: input?.summary.unread_message_count ?? 0,
      stalled_lane_count: Math.max(input?.summary.stalled_lane_count ?? 0, laneNeedsAttentionCount),
      recent_other_claim_count: input?.summary.recent_other_claim_count ?? 0,
      blocked: input?.summary.blocked ?? false,
    },
    observation_ids: input?.observation_ids ?? [],
    observation_ids_truncated: input?.observation_ids_truncated ?? false,
    hydration: 'Call get_observations with observation_ids for bodies; context stays compact.',
    next_action: input?.summary.next_action ?? '',
  };
}

function nextAction(
  lanes: HivemindContextLane[],
  memoryHits: SearchResult[],
  negativeWarnings: CompactNegativeWarning[],
  attention: HivemindContextAttention,
): string {
  if (
    attention.counts.blocked ||
    attention.counts.pending_handoff_count > 0 ||
    attention.counts.pending_wake_count > 0
  ) {
    return attention.next_action;
  }
  if (lanes.some((lane) => lane.needs_attention)) {
    return 'Inspect lanes with needs_attention before taking over or editing nearby files.';
  }
  if (negativeWarnings.length > 0) {
    return 'Review compact negative warnings before repeating a known failed path; then use lane ownership.';
  }
  if (lanes.length > 0 && memoryHits.length > 0) {
    return 'Use lane ownership first, then fetch only the specific memory IDs needed.';
  }
  if (lanes.length > 0) {
    return 'Use lane ownership before editing; no matching memory hit was needed.';
  }
  if (memoryHits.length > 0) {
    return 'No live lanes found; fetch only the memory IDs needed.';
  }
  return 'No live lanes or matching memory found.';
}
