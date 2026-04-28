import type { ObservationRow, TaskClaimRow, TaskRow } from '@colony/storage';
import { type HivemindSession, readHivemind } from './hivemind.js';
import { inferIdeFromSessionId } from './infer-ide.js';
import type { MemoryStore } from './memory-store.js';
import { type PlanInfo, type SubtaskInfo, listPlans } from './plan.js';
import { type RelayReason, TaskThread } from './task-thread.js';

const DEFAULT_STRANDED_AFTER_MS = 10 * 60_000;
const RESCUE_RELAY_TTL_MS = 30 * 60_000;
const ONE_LINE_LIMIT = 240;

export interface StrandedRescueOptions {
  stranded_after_ms?: number;
  dry_run?: boolean;
}

export interface StrandedRescueOutcome {
  scanned: number;
  rescued: Array<{
    session_id: string;
    task_id: number;
    relay_observation_id: number;
    inherited_claims: string[];
    rescue_reason: string;
    plan_slug?: string;
    wave_index?: number;
    blocked_downstream_count?: number;
    suggested_action?: string;
  }>;
  skipped: Array<{ session_id: string; reason: string }>;
}

interface StrandedSessionRow {
  session_id?: string;
  id?: string;
  repo_root?: string | null;
  cwd?: string | null;
  worktree_path?: string | null;
  branch?: string | null;
  last_observation_ts?: number | string | null;
  last_tool_error?: string | null;
}

interface RecentToolErrorRow {
  tool?: string | null;
  tool_name?: string | null;
  name?: string | null;
  message?: string | null;
  error?: string | null;
  content?: string | null;
  ts?: number | string | null;
}

interface RescueStorage {
  findStrandedSessions(args: { stranded_after_ms: number }): StrandedSessionRow[];
  recentToolErrors?: unknown;
}

interface OrderedPlanContext {
  plan_slug: string;
  wave_index: number;
  blocked_downstream_count: number;
  suggested_action?: string;
}

interface RescueJob {
  session_id: string;
  task_id: number;
  claims: TaskClaimRow[];
  lastToolError: RecentToolErrorRow | null;
  relayReason: RelayReason;
  rescue_reason: string;
  from_agent: string;
  last_observation_ts: number | null;
  one_line: string;
  planContext?: OrderedPlanContext;
}

export function rescueStrandedSessions(
  store: MemoryStore,
  options: StrandedRescueOptions = {},
): StrandedRescueOutcome {
  const stranded_after_ms = options.stranded_after_ms ?? DEFAULT_STRANDED_AFTER_MS;
  const dryRun = options.dry_run ?? false;
  const storage = store.storage as typeof store.storage & RescueStorage;
  const candidates = storage.findStrandedSessions({ stranded_after_ms });
  const outcome: StrandedRescueOutcome = { scanned: candidates.length, rescued: [], skipped: [] };
  const orderedPlanContexts = orderedPlanContextByTask(store);
  const jobs: RescueJob[] = [];

  for (const candidate of candidates) {
    const session_id = candidateSessionId(candidate);
    if (!session_id) {
      outcome.skipped.push({ session_id: '', reason: 'missing session_id' });
      continue;
    }

    const repoRoot = candidateRepoRoot(candidate);
    const snapshot = readHivemind({
      ...(repoRoot !== undefined ? { repoRoot } : {}),
      limit: 100,
    });
    if (!isLiveActiveSession(candidate, snapshot.sessions)) {
      outcome.skipped.push({ session_id, reason: 'session not alive' });
      continue;
    }

    const claimsByTask = groupClaimsByTask(store, session_id);
    if (claimsByTask.size === 0) {
      outcome.skipped.push({ session_id, reason: 'no claims' });
      continue;
    }

    const lastToolError = latestToolError(storage, session_id, candidate);
    const relayReason = relayReasonFor(lastToolError);
    const rescue_reason = rescueReasonFor(lastToolError);
    const from_agent = inferAgent(session_id);
    const last_observation_ts = lastObservationTs(store, session_id, candidate);
    const one_line = rescueOneLine(store, session_id);

    for (const [task_id, claims] of claimsByTask.entries()) {
      const job: RescueJob = {
        session_id,
        task_id,
        claims,
        lastToolError,
        relayReason,
        rescue_reason,
        from_agent,
        one_line,
        last_observation_ts,
      };
      const planContext = orderedPlanContexts.get(task_id);
      if (planContext) job.planContext = planContext;
      jobs.push(job);
    }
  }

  for (const job of jobs.sort(compareRescueJobs)) {
    const inherited_claims = job.claims.map((claim) => claim.file_path);
    const planMetadata = orderedPlanMetadata(job.planContext);
    const observerMetadata = {
      kind: 'observer-note',
      action: 'rescue-relay',
      stranded_session_id: job.session_id,
      task_id: job.task_id,
      last_observation_ts: job.last_observation_ts,
      last_tool_error: renderToolError(job.lastToolError),
      claim_count: inherited_claims.length,
      rescue_reason: job.rescue_reason,
      dry_run: dryRun,
      ...planMetadata,
    };
    store.addObservation({
      session_id: job.session_id,
      kind: 'observer-note',
      task_id: job.task_id,
      content: `Preparing rescue relay for stranded session ${job.session_id} on task ${job.task_id}; ${inherited_claims.length} claim(s) will be released.${orderedPlanSentence(job.planContext)}`,
      metadata: observerMetadata,
    });

    if (dryRun) {
      outcome.rescued.push({
        session_id: job.session_id,
        task_id: job.task_id,
        relay_observation_id: -1,
        inherited_claims,
        rescue_reason: job.rescue_reason,
        ...planMetadata,
      });
      continue;
    }

    const task = store.storage.getTask(job.task_id);
    const relay_observation_id = new TaskThread(store, job.task_id).relay({
      from_session_id: job.session_id,
      from_agent: job.from_agent,
      reason: job.relayReason,
      one_line: job.one_line,
      base_branch: baseBranchFor(task),
      to_agent: 'any',
      expires_in_ms: RESCUE_RELAY_TTL_MS,
    });

    store.addObservation({
      session_id: job.session_id,
      kind: 'rescue-relay',
      task_id: job.task_id,
      content: `Rescue relay emitted for stranded session ${job.session_id}; dropped ${inherited_claims.length} claim(s).${orderedPlanSentence(job.planContext)}`,
      metadata: {
        stranded_session_id: job.session_id,
        last_observation_ts: job.last_observation_ts,
        last_tool_error: renderToolError(job.lastToolError),
        claim_count: inherited_claims.length,
        rescue_reason: job.rescue_reason,
        relay_observation_id,
        ...planMetadata,
      },
    });

    outcome.rescued.push({
      session_id: job.session_id,
      task_id: job.task_id,
      relay_observation_id,
      inherited_claims,
      rescue_reason: job.rescue_reason,
      ...planMetadata,
    });
  }

  return outcome;
}

function compareRescueJobs(left: RescueJob, right: RescueJob): number {
  const impact =
    (right.planContext?.blocked_downstream_count ?? 0) -
    (left.planContext?.blocked_downstream_count ?? 0);
  if (impact !== 0) return impact;
  return left.task_id - right.task_id;
}

function orderedPlanContextByTask(store: MemoryStore): Map<number, OrderedPlanContext> {
  const contexts = new Map<number, OrderedPlanContext>();
  for (const plan of listPlans(store, { limit: 2_000 })) {
    const waveIndexes = waveIndexesFor(plan.subtasks);
    for (const subtask of plan.subtasks) {
      const blocked_downstream_count = blockedDownstreamCount(plan, subtask);
      contexts.set(subtask.task_id, {
        plan_slug: plan.plan_slug,
        wave_index: waveIndexes.get(subtask.subtask_index) ?? 0,
        blocked_downstream_count,
        ...(blocked_downstream_count > 0
          ? {
              suggested_action:
                'message stalled owner or reassign this sub-task before later waves can continue',
            }
          : {}),
      });
    }
  }
  return contexts;
}

function waveIndexesFor(subtasks: SubtaskInfo[]): Map<number, number> {
  const byIndex = new Map(subtasks.map((subtask) => [subtask.subtask_index, subtask]));
  const memo = new Map<number, number>();

  const visit = (index: number): number => {
    const cached = memo.get(index);
    if (cached !== undefined) return cached;
    const subtask = byIndex.get(index);
    if (!subtask || subtask.depends_on.length === 0) {
      memo.set(index, 0);
      return 0;
    }
    const wave = Math.max(...subtask.depends_on.map(visit)) + 1;
    memo.set(index, wave);
    return wave;
  };

  for (const subtask of subtasks) visit(subtask.subtask_index);
  return memo;
}

function blockedDownstreamCount(plan: PlanInfo, blocker: SubtaskInfo): number {
  return plan.subtasks.filter((subtask) => {
    if (subtask.subtask_index === blocker.subtask_index || subtask.status === 'completed') {
      return false;
    }
    return dependsOnTransitive(subtask, blocker.subtask_index, plan.subtasks);
  }).length;
}

function dependsOnTransitive(
  subtask: SubtaskInfo,
  dependencyIndex: number,
  allSubtasks: SubtaskInfo[],
): boolean {
  const byIndex = new Map(allSubtasks.map((item) => [item.subtask_index, item]));
  const visited = new Set<number>();
  const stack = [...subtask.depends_on];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) continue;
    if (current === dependencyIndex) return true;
    visited.add(current);
    stack.push(...(byIndex.get(current)?.depends_on ?? []));
  }
  return false;
}

function orderedPlanMetadata(context: OrderedPlanContext | undefined): Partial<OrderedPlanContext> {
  if (!context) return {};
  return {
    plan_slug: context.plan_slug,
    wave_index: context.wave_index,
    blocked_downstream_count: context.blocked_downstream_count,
    ...(context.suggested_action ? { suggested_action: context.suggested_action } : {}),
  };
}

function orderedPlanSentence(context: OrderedPlanContext | undefined): string {
  if (!context) return '';
  const waveNumber = context.wave_index + 1;
  if (context.blocked_downstream_count === 0) {
    return ` Plan ${context.plan_slug} wave ${waveNumber} has no blocked downstream sub-tasks.`;
  }
  return ` Plan ${context.plan_slug} wave ${waveNumber} blocks ${context.blocked_downstream_count} downstream sub-task(s).`;
}

function groupClaimsByTask(store: MemoryStore, session_id: string): Map<number, TaskClaimRow[]> {
  const grouped = new Map<number, TaskClaimRow[]>();
  for (const task of store.storage.listTasks(1_000)) {
    const claims = store.storage
      .listClaims(task.id)
      .filter((claim) => claim.session_id === session_id);
    if (claims.length > 0) grouped.set(task.id, claims);
  }
  return grouped;
}

function candidateSessionId(candidate: StrandedSessionRow): string | undefined {
  const id = candidate.session_id ?? candidate.id;
  return typeof id === 'string' && id.trim() ? id : undefined;
}

function candidateRepoRoot(candidate: StrandedSessionRow): string | undefined {
  const root = candidate.repo_root ?? candidate.cwd;
  return typeof root === 'string' && root.trim() ? root : undefined;
}

function isLiveActiveSession(candidate: StrandedSessionRow, sessions: HivemindSession[]): boolean {
  const session_id = candidateSessionId(candidate);
  if (!session_id) return false;
  const candidateWorktree = normalizePath(candidate.worktree_path);
  return sessions.some((session) => {
    if (session.source !== 'active-session' || session.activity === 'dead') return false;
    if (session.session_key === session_id) return true;
    if (session.file_path.includes(session_id)) return true;
    if (candidateWorktree && normalizePath(session.worktree_path) === candidateWorktree) {
      return true;
    }
    return false;
  });
}

function latestToolError(
  storage: typeof MemoryStore.prototype.storage & RescueStorage,
  session_id: string,
  candidate: StrandedSessionRow,
): RecentToolErrorRow | null {
  const rows = recentToolErrors(storage, session_id);
  if (rows.length > 0) {
    return rows
      .slice()
      .sort((left, right) => numericTs(right.ts) - numericTs(left.ts))[0] as RecentToolErrorRow;
  }
  if (candidate.last_tool_error) {
    return { message: candidate.last_tool_error };
  }
  return null;
}

function recentToolErrors(storage: RescueStorage, session_id: string): RecentToolErrorRow[] {
  if (typeof storage.recentToolErrors !== 'function') return [];
  const reader = storage.recentToolErrors as (...args: unknown[]) => unknown;

  try {
    const objectRows = reader.call(storage, { session_id, limit: 5 });
    if (Array.isArray(objectRows) && objectRows.length > 0) {
      return objectRows.filter(isRecentToolError);
    }
  } catch {
    // Older storage signatures are handled below.
  }

  try {
    const positionalRows = reader.call(storage, session_id, 5);
    if (Array.isArray(positionalRows)) {
      return positionalRows.filter(isRecentToolError);
    }
  } catch {
    return [];
  }

  return [];
}

function rescueOneLine(store: MemoryStore, session_id: string): string {
  const recent = store.storage.timeline(session_id, undefined, 20);
  const row = recent.find((entry) => !isErrorObservation(entry));
  if (!row) return 'Stranded session - no recent activity, claims held';
  const [expanded] = store.getObservations([row.id], { expand: true });
  return truncateOneLine(expanded?.content ?? row.content);
}

function isErrorObservation(row: ObservationRow): boolean {
  const kind = row.kind.toLowerCase();
  return (
    kind.includes('error') ||
    kind === 'observer-note' ||
    kind === 'rescue-relay' ||
    kind === 'relay'
  );
}

function lastObservationTs(
  store: MemoryStore,
  session_id: string,
  candidate: StrandedSessionRow,
): number | null {
  const candidateTs = numericTs(candidate.last_observation_ts);
  if (candidateTs > 0) return candidateTs;
  return store.storage.timeline(session_id, undefined, 1)[0]?.ts ?? null;
}

function relayReasonFor(error: RecentToolErrorRow | null): RelayReason {
  return quotaText(error) ? 'quota' : 'unspecified';
}

function rescueReasonFor(error: RecentToolErrorRow | null): string {
  if (!error) return 'silent-stranded';
  if (quotaText(error)) return 'quota-rejection';
  return `last-error: ${toolName(error)}`;
}

function quotaText(error: RecentToolErrorRow | null): boolean {
  return error ? /quota/i.test(renderToolError(error) ?? '') : false;
}

function renderToolError(error: RecentToolErrorRow | null): string | null {
  if (!error) return null;
  const text = [toolName(error), error.message, error.error, error.content]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(': ');
  return text || null;
}

function toolName(error: RecentToolErrorRow): string {
  return error.tool ?? error.tool_name ?? error.name ?? 'unknown';
}

function isRecentToolError(value: unknown): value is RecentToolErrorRow {
  return Boolean(value && typeof value === 'object');
}

function inferAgent(session_id: string): string {
  const ide = inferIdeFromSessionId(session_id);
  if (ide === 'claude-code') return 'claude';
  if (ide) return ide;
  const parts = session_id.split(/[@\-:/_]/).filter(Boolean);
  if (parts[0] === 'agent' && parts[1]) return parts[1];
  return parts[0] ?? 'unknown';
}

function baseBranchFor(task: TaskRow | undefined): string {
  const branch = task?.branch.trim();
  if (!branch) return 'main';
  if (branch === 'main' || branch === 'master' || branch === 'dev') return branch;
  return 'main';
}

function truncateOneLine(input: string): string {
  const singleLine = input.replace(/\s+/g, ' ').trim();
  return singleLine.length > ONE_LINE_LIMIT ? singleLine.slice(0, ONE_LINE_LIMIT) : singleLine;
}

function normalizePath(path: string | null | undefined): string | undefined {
  return typeof path === 'string' && path.trim() ? path : undefined;
}

function numericTs(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Date.parse(value) || 0;
  }
  return 0;
}
