import { type MemoryStore, TaskThread, detectRepoBranch } from '@colony/core';
import { type ActiveTaskCandidate, activeTaskCandidatesForSession } from './auto-claim.js';
import type { HookInput } from './types.js';

export type TaskBindingEventName = 'session_start' | 'task_bind';
export type TaskBindingStatus = 'bound_task' | 'ambiguous_candidates' | 'no_active_task';
export type BindingConfidence = 'high' | 'medium' | 'none';

export interface TaskBindingCache {
  task_id: number;
  expires_at: number;
  binding_confidence: Exclude<BindingConfidence, 'none'>;
}

export interface TaskBindingIdentity {
  session_id: string;
  agent: string;
  cwd?: string;
  repo_root?: string;
  branch?: string;
  worktree_path?: string;
}

export interface CompactTaskBindingCandidate {
  task_id: number;
  title: string;
  repo_root: string;
  branch: string;
  status: string;
  updated_at: number;
  agent: string;
}

export interface TaskBindingResponse {
  event_name: TaskBindingEventName;
  status: TaskBindingStatus;
  session_id: string;
  agent: string;
  binding_confidence: BindingConfidence;
  expires_at: number;
  candidates: CompactTaskBindingCandidate[];
  task_id?: number;
  cache?: TaskBindingCache;
}

const TASK_BINDING_CACHE_TTL_MS = 10 * 60_000;
const PROMPT_SUMMARY_LIMIT = 180;
const SECRET_MARKER_RE =
  /\b(?:authorization|bearer|token|secret|password|passwd|credential|api[_-]?key)\b|sk-[A-Za-z0-9_-]{12,}/i;

export function shouldEmitTaskBindingEvent(input: HookInput): boolean {
  const identity = taskBindingIdentity(input);
  return identity.repo_root !== undefined || identity.branch !== undefined;
}

export function taskBindingIdentity(input: HookInput): TaskBindingIdentity {
  const metadataScope = input.metadata ? metadataIdentityScope(input.metadata) : {};
  const cwd = input.cwd ?? metadataScope.cwd;
  const detected = cwd ? safeDetectRepoBranch(cwd) : null;
  const repo_root = metadataScope.repo_root ?? detected?.repo_root;
  const branch = metadataScope.branch ?? detected?.branch;
  const worktree_path = metadataScope.worktree_path ?? detected?.repo_root;

  return compactIdentity({
    session_id: input.session_id,
    agent: normalizeAgent(input.ide ?? metadataScope.agent ?? input.session_id),
    cwd,
    repo_root,
    branch,
    worktree_path,
  });
}

export function taskBindingSessionMetadata(input: HookInput): Record<string, unknown> | null {
  const identity = taskBindingIdentity(input);
  const metadata = compactRecord({
    agent: identity.agent,
    cwd: identity.cwd,
    repo_root: identity.repo_root,
    branch: identity.branch,
    worktree_path: identity.worktree_path,
  });
  return Object.keys(metadata).length > 0 ? metadata : null;
}

export function recordTaskBindingLifecycleEvent(
  store: MemoryStore,
  input: HookInput,
  event_name: TaskBindingEventName,
  opts: { now?: number } = {},
): TaskBindingResponse {
  const now = opts.now ?? Date.now();
  const identity = taskBindingIdentity(input);

  ensureScopedTask(store, identity);

  const candidates = activeTaskCandidatesForSession(store, {
    session_id: identity.session_id,
    agent: identity.agent,
    ...(identity.repo_root !== undefined ? { repo_root: identity.repo_root } : {}),
    ...(identity.branch !== undefined ? { branch: identity.branch } : {}),
    ...(identity.worktree_path !== undefined ? { worktree_path: identity.worktree_path } : {}),
  });
  const response = bindingResponse(event_name, identity, candidates, now);
  const promptSummary = event_name === 'task_bind' ? safePromptSummary(input.prompt) : undefined;

  store.addObservation({
    session_id: input.session_id,
    kind: 'lifecycle_event',
    content: `${event_name}: ${response.status}`,
    ...(response.task_id !== undefined ? { task_id: response.task_id } : {}),
    metadata: compactRecord({
      event_name,
      session_id: input.session_id,
      agent: identity.agent,
      cwd: identity.cwd,
      repo_root: identity.repo_root,
      branch: identity.branch,
      worktree_path: identity.worktree_path,
      binding_status: response.status,
      task_id: response.task_id,
      binding_confidence: response.binding_confidence,
      expires_at: response.expires_at,
      candidates: response.candidates,
      prompt_summary: promptSummary,
    }),
  });

  return response;
}

export function safePromptSummary(prompt: string | undefined): string | undefined {
  if (!prompt) return undefined;
  const oneLine = prompt.replace(/\s+/g, ' ').trim();
  if (!oneLine) return undefined;
  if (SECRET_MARKER_RE.test(oneLine)) return undefined;
  return oneLine.slice(0, PROMPT_SUMMARY_LIMIT);
}

function bindingResponse(
  event_name: TaskBindingEventName,
  identity: TaskBindingIdentity,
  candidates: ActiveTaskCandidate[],
  now: number,
): TaskBindingResponse {
  const expires_at = now + TASK_BINDING_CACHE_TTL_MS;
  const compactCandidates = candidates.map(compactCandidate);
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (!candidate) throw new Error('binding candidate disappeared');
    const binding_confidence = identity.repo_root && identity.branch ? 'high' : 'medium';
    const cache = {
      task_id: candidate.task_id,
      expires_at,
      binding_confidence,
    } satisfies TaskBindingCache;
    return {
      event_name,
      status: 'bound_task',
      session_id: identity.session_id,
      agent: identity.agent,
      task_id: candidate.task_id,
      binding_confidence,
      expires_at,
      candidates: compactCandidates,
      cache,
    };
  }
  return {
    event_name,
    status: candidates.length > 1 ? 'ambiguous_candidates' : 'no_active_task',
    session_id: identity.session_id,
    agent: identity.agent,
    binding_confidence: 'none',
    expires_at,
    candidates: compactCandidates,
  };
}

function ensureScopedTask(store: MemoryStore, identity: TaskBindingIdentity): void {
  if (!identity.repo_root || !identity.branch) return;
  const thread = TaskThread.open(store, {
    repo_root: identity.repo_root,
    branch: identity.branch,
    session_id: identity.session_id,
  });
  thread.join(identity.session_id, identity.agent);
}

function compactCandidate(candidate: ActiveTaskCandidate): CompactTaskBindingCandidate {
  return {
    task_id: candidate.task_id,
    title: candidate.title,
    repo_root: candidate.repo_root,
    branch: candidate.branch,
    status: candidate.status,
    updated_at: candidate.updated_at,
    agent: candidate.agent,
  };
}

function metadataIdentityScope(metadata: Record<string, unknown>): {
  cwd?: string;
  repo_root?: string;
  branch?: string;
  worktree_path?: string;
  agent?: string;
} {
  return {
    ...optionalString('cwd', readString(metadata.cwd)),
    ...optionalString('repo_root', readString(metadata.repo_root) ?? readString(metadata.repoRoot)),
    ...optionalString('branch', readString(metadata.branch)),
    ...optionalString(
      'worktree_path',
      readString(metadata.worktree_path) ?? readString(metadata.worktreePath),
    ),
    ...optionalString(
      'agent',
      readString(metadata.agent) ??
        readString(metadata.agent_name) ??
        readString(metadata.agentName) ??
        readString(metadata.cli) ??
        readString(metadata.cli_name) ??
        readString(metadata.cliName),
    ),
  };
}

function safeDetectRepoBranch(cwd: string): { repo_root: string; branch: string } | null {
  try {
    return detectRepoBranch(cwd);
  } catch {
    return null;
  }
}

function normalizeAgent(value: string | undefined): string {
  const raw = (value ?? 'agent').toLowerCase();
  const prefix = raw.includes('@')
    ? raw.split('@')[0]
    : raw.includes('/')
      ? raw.split('/')[0]
      : raw;
  if (prefix === 'claude-code') return 'claude';
  if (prefix === 'claude' || prefix === 'codex') return prefix;
  return prefix || 'agent';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalString<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}

function compactIdentity(input: {
  session_id: string;
  agent: string;
  cwd: string | undefined;
  repo_root: string | undefined;
  branch: string | undefined;
  worktree_path: string | undefined;
}): TaskBindingIdentity {
  return compactRecord(input) as TaskBindingIdentity;
}

function compactRecord<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    }),
  ) as Partial<T>;
}
