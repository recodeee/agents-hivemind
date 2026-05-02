import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore, TaskThread, detectRepoBranch } from '@colony/core';
import { publishPlan } from '@colony/spec';
import kleur from 'kleur';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOmxLifecycleEnvelope } from '../../../packages/hooks/src/lifecycle-envelope.js';
import { buildColonyHealthPayload, formatColonyHealthOutput } from '../src/commands/health.js';

const BASE_TS = Date.parse('2026-05-02T10:00:00.000Z');
const HEALTH_SINCE = BASE_TS - 24 * 60 * 60_000;
const BRANCH = 'agent/codex/health-repair-loop-smoke';
const SESSION_ID = 'codex@health-repair-loop-smoke';
const QUOTA_SESSION_ID = 'codex@health-repair-loop-quota';
const FILE_PATH = 'src/health-repair-target.ts';
const NO_CODEX_ROOT = '/var/empty/colony-health-repair-loop-smoke-no-codex';

let dir: string;
let repoRoot: string;
let store: MemoryStore;

interface ClaimSubtaskResult {
  task_id: number;
  branch: string;
  file_scope: string[];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TS);
  kleur.enabled = false;

  dir = mkdtempSync(join(tmpdir(), 'colony-health-repair-loop-smoke-'));
  repoRoot = tempGitRepo('repo', BRANCH);
  writeFileSync(join(repoRoot, 'SPEC.md'), '# SPEC\n', 'utf8');
  store = new MemoryStore({ dbPath: join(dir, 'state', 'colony.db'), settings: defaultSettings });
  store.startSession({ id: SESSION_ID, ide: 'codex', cwd: repoRoot });
  store.startSession({ id: QUOTA_SESSION_ID, ide: 'codex', cwd: repoRoot });
  store.startSession({ id: 'queen-session', ide: 'queen', cwd: repoRoot });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
  kleur.enabled = true;
});

describe('health repair loop smoke', () => {
  it('turns pasted health red areas green or ok after bridge, quota, and Queen fixes', async () => {
    await emitLifecycle(10, {
      event_id: 'evt_health_repair_session_start',
      event_name: 'session_start',
    });
    await emitLifecycle(20, {
      event_id: 'evt_health_repair_task_bind',
      event_name: 'task_bind',
    });

    const taskId = store.storage.findActiveTaskForSession(SESSION_ID);
    expect(taskId).toBeDefined();
    if (taskId === undefined) throw new Error('health repair task was not bound');
    expect(detectRepoBranch(repoRoot)).toEqual({ repo_root: repoRoot, branch: BRANCH });

    await recordMcpCall('mcp__colony__hivemind_context', 25);
    await recordMcpCall('mcp__colony__attention_inbox', 26);
    await recordMcpCall('mcp__colony__task_ready_for_agent', 27);

    const thread = new TaskThread(store, taskId);
    const claimId = thread.claimFile({
      session_id: SESSION_ID,
      file_path: FILE_PATH,
      note: 'health repair smoke claims before edit',
    });
    expect(store.storage.getObservation(claimId)).toMatchObject({ kind: 'claim' });
    expect(store.storage.getClaim(taskId, FILE_PATH)).toMatchObject({
      file_path: FILE_PATH,
      session_id: SESSION_ID,
    });
    await recordMcpCall('mcp__colony__task_claim_file', 30);

    const absoluteToolPath = join(repoRoot, FILE_PATH);
    expect(existsSync(absoluteToolPath)).toBe(true);
    expect(readFileSync(absoluteToolPath, 'utf8')).toBe('export const before = 1;\n');

    await emitLifecycle(
      40,
      editEnvelope('evt_health_repair_pre', 'pre_tool_use', absoluteToolPath),
    );
    expect(readFileSync(absoluteToolPath, 'utf8')).toBe('export const before = 1;\n');

    vi.setSystemTime(BASE_TS + 50);
    writeFileSync(absoluteToolPath, 'export const after = 2;\n', 'utf8');

    await emitLifecycle(60, {
      ...editEnvelope('evt_health_repair_post', 'post_tool_use', absoluteToolPath),
      parent_event_id: 'evt_health_repair_pre',
      tool_response: { success: true },
    });

    const editStats = store.storage.claimBeforeEditStats(HEALTH_SINCE);
    expect(editStats.edit_tool_calls).toBe(1);
    expect(editStats.edits_with_file_path).toBe(1);
    expect(editStats.edits_claimed_before).toBe(1);
    expect(editStats.pre_tool_use_signals).toBeGreaterThan(0);

    const quota = await seedExpiredQuotaRelay();
    const beforeCleanup = healthPayload();
    expect(beforeCleanup.signal_health.quota_pending_claims).toBeGreaterThan(0);

    vi.setSystemTime(BASE_TS + 5 * 60_000);
    const released = new TaskThread(store, quota.taskId).releaseExpiredQuotaClaims({
      session_id: SESSION_ID,
      handoff_observation_id: quota.relayId,
    });
    expect(released).toMatchObject({
      status: 'released_expired',
      released_claims: [{ file_path: quota.filePath, state: 'weak_expired' }],
    });
    await recordMcpCall('mcp__colony__task_claim_quota_release_expired', 5 * 60_000 + 1);

    const claimedSubtask = await publishAndClaimRepairPlan();
    expect(claimedSubtask).toMatchObject({
      branch: 'spec/health-repair-loop-smoke/sub-0',
      file_scope: ['apps/cli/test/health-repair-loop-smoke.test.ts'],
    });

    const payload = healthPayload();
    const output = formatColonyHealthOutput(payload);

    expect(payload.readiness_summary.execution_safety.status).not.toBe('bad');
    expect(payload.task_claim_file_before_edits.pre_tool_use_signals).toBeGreaterThan(0);
    expect(
      payload.task_claim_file_before_edits.edit_source_breakdown.hook_capable_edits,
    ).toBeGreaterThan(0);
    expect(payload.task_claim_file_before_edits.measurable_edits).toBeGreaterThan(0);
    expect(payload.task_claim_file_before_edits.edits_claimed_before).toBeGreaterThan(0);
    expect(payload.task_claim_file_before_edits.edits_missing_claim).toBe(0);
    expect(payload.signal_health.quota_pending_claims).toBe(0);
    expect(payload.queen_wave_health.active_plans).toBeGreaterThan(0);
    expect(payload.queen_wave_health.claimed_subtasks).toBeGreaterThan(0);
    expect(payload.readiness_summary.queen_plan_readiness.status).not.toBe('bad');
    expect(Object.values(payload.readiness_summary).map((entry) => entry.status)).not.toContain(
      'bad',
    );
    expect(output).not.toContain('Call task_claim_file');
    expect(output).not.toContain('mcp__colony__task_claim_file({ task_id: <task_id>');
  });
});

async function emitLifecycle(tsOffset: number, overrides: Record<string, unknown>): Promise<void> {
  vi.setSystemTime(BASE_TS + tsOffset);
  const result = await runOmxLifecycleEnvelope(envelope(overrides), { store });
  expect(result.ok).toBe(true);
}

function envelope(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    event_id: 'evt_default',
    event_name: 'session_start',
    session_id: SESSION_ID,
    agent: 'codex',
    cwd: repoRoot,
    repo_root: repoRoot,
    branch: BRANCH,
    timestamp: new Date(Date.now()).toISOString(),
    source: 'omx',
    ...overrides,
  };
}

function editEnvelope(
  eventId: string,
  eventName: 'pre_tool_use' | 'post_tool_use',
  filePath: string,
): Record<string, unknown> {
  return {
    event_id: eventId,
    event_name: eventName,
    tool_name: 'Edit',
    tool_input: {
      operation: 'replace',
      paths: [{ path: filePath, role: 'target', kind: 'file' }],
    },
  };
}

async function recordMcpCall(tool: string, tsOffset: number): Promise<void> {
  vi.setSystemTime(BASE_TS + tsOffset);
  store.addObservation({
    session_id: SESSION_ID,
    kind: 'tool_use',
    content: tool,
    metadata: { tool },
  });
}

async function seedExpiredQuotaRelay(): Promise<{
  taskId: number;
  relayId: number;
  filePath: string;
}> {
  vi.setSystemTime(BASE_TS + 90);
  const filePath = 'src/quota-handoff.ts';
  const thread = TaskThread.open(store, {
    repo_root: repoRoot,
    branch: 'agent/codex/health-repair-loop-quota',
    session_id: QUOTA_SESSION_ID,
    title: 'Expired quota relay cleanup',
  });
  thread.join(QUOTA_SESSION_ID, 'codex');
  thread.join(SESSION_ID, 'codex');

  thread.claimFile({
    session_id: QUOTA_SESSION_ID,
    file_path: filePath,
    note: 'quota owner claims before stopping',
  });
  const relayId = thread.relay({
    from_session_id: QUOTA_SESSION_ID,
    from_agent: 'codex',
    reason: 'quota',
    one_line: 'quota stopped health repair smoke',
    base_branch: 'main',
    expires_in_ms: 60_000,
  });

  return { taskId: thread.task_id, relayId, filePath };
}

async function publishAndClaimRepairPlan(): Promise<ClaimSubtaskResult> {
  vi.setSystemTime(BASE_TS + 5 * 60_000 + 10);
  const published = publishPlan({
    store,
    repo_root: repoRoot,
    slug: 'health-repair-loop-smoke',
    session_id: 'queen-session',
    agent: 'queen',
    title: 'Health repair loop smoke',
    problem: 'Agents need one smoke that proves health red areas clear after source fixes.',
    acceptance_criteria: ['Health over the last 24h is green or ok after repair actions'],
    subtasks: [
      {
        title: 'Claim health repair smoke',
        description: 'Claim the smoke that proves bridge, quota, and Queen fixes compose.',
        file_scope: ['apps/cli/test/health-repair-loop-smoke.test.ts'],
        capability_hint: 'test_work',
      },
      {
        title: 'Follow-up health repair docs',
        description: 'Dependent docs stay blocked until the repair smoke is claimed.',
        file_scope: ['README.md'],
        depends_on: [0],
        capability_hint: 'doc_work',
      },
    ],
    auto_archive: false,
  });

  expect(published.subtasks[0]).toMatchObject({
    branch: 'spec/health-repair-loop-smoke/sub-0',
    title: 'Claim health repair smoke',
  });
  await recordMcpCall('mcp__colony__task_ready_for_agent', 5 * 60_000 + 11);

  const firstSubtask = published.subtasks[0];
  if (!firstSubtask) throw new Error('expected published health repair subtask');
  const fileScope = ['apps/cli/test/health-repair-loop-smoke.test.ts'];
  const thread = new TaskThread(store, firstSubtask.task_id);
  store.addObservation({
    session_id: SESSION_ID,
    task_id: firstSubtask.task_id,
    kind: 'plan-subtask-claim',
    content: 'codex claimed sub-task 0 of plan health-repair-loop-smoke',
    metadata: {
      status: 'claimed',
      session_id: SESSION_ID,
      agent: 'codex',
      plan_slug: 'health-repair-loop-smoke',
      subtask_index: 0,
    },
  });
  thread.join(SESSION_ID, 'codex');
  for (const file of fileScope) {
    thread.claimFile({ session_id: SESSION_ID, file_path: file });
  }
  await recordMcpCall('mcp__colony__task_plan_claim_subtask', 5 * 60_000 + 12);
  return {
    task_id: firstSubtask.task_id,
    branch: firstSubtask.branch,
    file_scope: fileScope,
  };
}

function healthPayload(): ReturnType<typeof buildColonyHealthPayload> {
  return buildColonyHealthPayload(store.storage, {
    since: HEALTH_SINCE,
    window_hours: 24,
    now: Date.now(),
    codex_sessions_root: NO_CODEX_ROOT,
    repo_root: repoRoot,
    mcp_capability_sources: [],
  });
}

function tempGitRepo(name: string, branch: string): string {
  const repo = join(dir, name);
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '--quiet', '-b', branch, repo], { stdio: 'ignore' });
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, FILE_PATH), 'export const before = 1;\n', 'utf8');
  return repo;
}
