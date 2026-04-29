import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore, TaskThread } from '@colony/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { upsertActiveSession } from '../src/active-session.js';
import { runHook } from '../src/runner.js';
import { recordTaskBindingLifecycleEvent, safePromptSummary } from '../src/task-binding.js';

let dir: string;
let store: MemoryStore;

function fakeGitCheckout(path: string, branch: string): void {
  mkdirSync(join(path, '.git'), { recursive: true });
  writeFileSync(join(path, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`, 'utf8');
}

function metadataOf(row: { metadata: string | Record<string, unknown> | null }): Record<
  string,
  unknown
> {
  return typeof row.metadata === 'string'
    ? (JSON.parse(row.metadata) as Record<string, unknown>)
    : (row.metadata ?? {});
}

function lifecycleEvent(sessionId: string): { metadata: string | Record<string, unknown> | null } {
  const event = store.timeline(sessionId).find((row) => row.kind === 'lifecycle_event');
  if (!event) throw new Error(`Missing lifecycle event for ${sessionId}`);
  return event;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-task-binding-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('task binding handshake', () => {
  it('records session_start identity and writes a short-lived OMX task cache', async () => {
    const repo = join(dir, 'repo-session-start');
    mkdirSync(repo, { recursive: true });
    fakeGitCheckout(repo, 'agent/codex/session-bind');

    const result = await runHook(
      'session-start',
      { session_id: 'codex@session-bind', ide: 'codex', cwd: repo },
      { store },
    );

    expect(result.ok).toBe(true);
    const task = store.storage.findTaskByBranch(repo, 'agent/codex/session-bind');
    expect(task).toBeDefined();
    expect(metadataOf(lifecycleEvent('codex@session-bind'))).toMatchObject({
      event_name: 'session_start',
      session_id: 'codex@session-bind',
      agent: 'codex',
      cwd: repo,
      repo_root: repo,
      branch: 'agent/codex/session-bind',
      worktree_path: repo,
      binding_status: 'bound_task',
      task_id: task?.id,
      binding_confidence: 'high',
    });

    const active = JSON.parse(
      readFileSync(
        join(repo, '.omx', 'state', 'active-sessions', 'codex_session-bind.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(active.taskBinding).toEqual({
      task_id: task?.id,
      expires_at: expect.any(Number),
      binding_confidence: 'high',
    });
    expect(JSON.stringify(active.taskBinding)).not.toContain('prompt');
  });

  it('records task_bind only on the first prompt with a safe prompt summary', async () => {
    const repo = join(dir, 'repo-first-prompt');
    mkdirSync(repo, { recursive: true });
    fakeGitCheckout(repo, 'agent/codex/first-prompt');

    await runHook(
      'user-prompt-submit',
      {
        session_id: 'codex@first-prompt',
        ide: 'codex',
        cwd: repo,
        prompt: 'Add task binding handshake tests',
      },
      { store },
    );
    await runHook(
      'user-prompt-submit',
      {
        session_id: 'codex@first-prompt',
        ide: 'codex',
        cwd: repo,
        prompt: 'Second prompt should not rebind',
      },
      { store },
    );

    const events = store
      .timeline('codex@first-prompt')
      .filter((row) => row.kind === 'lifecycle_event')
      .map(metadataOf);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_name: 'task_bind',
      binding_status: 'bound_task',
      prompt_summary: 'Add task binding handshake tests',
    });
    expect(store.storage.findActiveTaskForSession('codex@first-prompt')).toBeDefined();
  });

  it('returns ambiguous candidates without caching a task id', () => {
    store.startSession({ id: 'codex@ambiguous', ide: 'codex', cwd: null });
    for (const branch of ['agent/codex/one', 'agent/codex/two']) {
      store.startSession({ id: branch, ide: 'codex', cwd: '/repo' });
      const thread = TaskThread.open(store, {
        repo_root: '/repo',
        branch,
        session_id: branch,
      });
      thread.join(branch, 'codex');
    }

    const response = recordTaskBindingLifecycleEvent(
      store,
      { session_id: 'codex@ambiguous', ide: 'codex' },
      'task_bind',
    );

    expect(response).toMatchObject({
      status: 'ambiguous_candidates',
      binding_confidence: 'none',
      candidates: expect.arrayContaining([
        expect.objectContaining({ branch: 'agent/codex/one' }),
        expect.objectContaining({ branch: 'agent/codex/two' }),
      ]),
    });
    expect(response.cache).toBeUndefined();
    expect(metadataOf(lifecycleEvent('codex@ambiguous'))).toMatchObject({
      event_name: 'task_bind',
      binding_status: 'ambiguous_candidates',
      binding_confidence: 'none',
    });
  });

  it('returns no active task without caching a task id when no candidate matches', () => {
    store.startSession({ id: 'codex@no-task', ide: 'codex', cwd: null });

    const response = recordTaskBindingLifecycleEvent(
      store,
      {
        session_id: 'codex@no-task',
        ide: 'codex',
        metadata: { branch: 'agent/codex/no-task' },
      },
      'task_bind',
    );

    expect(response).toMatchObject({
      status: 'no_active_task',
      binding_confidence: 'none',
      candidates: [],
    });
    expect(response.cache).toBeUndefined();
    expect(metadataOf(lifecycleEvent('codex@no-task'))).toMatchObject({
      event_name: 'task_bind',
      binding_status: 'no_active_task',
      binding_confidence: 'none',
    });
  });

  it('drops expired task binding cache entries from active-session state', () => {
    const repo = join(dir, 'repo-expired-cache');
    mkdirSync(repo, { recursive: true });
    fakeGitCheckout(repo, 'agent/codex/expired-cache');

    upsertActiveSession(
      { session_id: 'codex@expired-cache', ide: 'codex', cwd: repo },
      'pre-tool-use',
      {
        task_id: 42,
        expires_at: Date.now() - 1,
        binding_confidence: 'high',
      },
    );

    const active = JSON.parse(
      readFileSync(
        join(repo, '.omx', 'state', 'active-sessions', 'codex_expired-cache.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(active.taskBinding).toBeUndefined();
  });

  it('does not store unsafe or large prompts as task summaries', () => {
    expect(safePromptSummary('TOKEN=abc123 update this')).toBeUndefined();
    expect(safePromptSummary('x'.repeat(500))).toHaveLength(180);
  });
});
