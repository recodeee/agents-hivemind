import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore, TaskThread } from '@colony/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runHook } from '../src/runner.js';

let dir: string;
let store: MemoryStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-task-mirror-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('TaskCreate/TaskUpdate mirrors', () => {
  it('mirrors TaskCreate onto the active colony task for the session', async () => {
    store.startSession({ id: 'codex@mirror', ide: 'codex', cwd: '/repo' });
    const thread = TaskThread.open(store, {
      repo_root: '/repo',
      branch: 'agent/codex/task-mirror',
      session_id: 'codex@mirror',
    });
    thread.join('codex@mirror', 'codex');

    const toolInput = {
      title: 'Mirror TaskCreate calls',
      description: 'Capture built-in task creation without changing the tool.',
    };
    const result = await runHook(
      'post-tool-use',
      {
        session_id: 'codex@mirror',
        ide: 'codex',
        tool_name: 'TaskCreate',
        tool_input: toolInput,
        tool_response: { ok: true },
      },
      { store },
    );

    expect(result.ok).toBe(true);
    const rows = store.storage.taskObservationsByKind(thread.task_id, 'task-create-mirror', 10);
    expect(rows).toHaveLength(1);
    const [mirror] = store.getObservations([rows[0]?.id ?? -1], { expand: true });
    expect(mirror?.task_id).toBe(thread.task_id);
    expect(mirror?.content).toBe('Mirror TaskCreate calls');
    expect(mirror?.metadata).toMatchObject({
      mirror_schema: 1,
      source_tool: 'TaskCreate',
      source_tool_input: toolInput,
    });
  });

  it('ensures a branch task from cwd when TaskUpdate has no active task yet', async () => {
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/agent/codex/task-update\n', 'utf8');

    const result = await runHook(
      'post-tool-use',
      {
        session_id: 'codex@late-task',
        ide: 'codex',
        cwd: repo,
        tool_name: 'TaskUpdate',
        tool_input: {
          task_id: 'task-7',
          previous_status: 'in_progress',
          status: 'completed',
        },
        tool_response: { ok: true },
      },
      { store },
    );

    expect(result.ok).toBe(true);
    const task = store.storage.findTaskByBranch(repo, 'agent/codex/task-update');
    expect(task).toBeDefined();
    expect(store.storage.getParticipantAgent(task?.id ?? -1, 'codex@late-task')).toBe('codex');

    const rows = store.storage.taskObservationsByKind(task?.id ?? -1, 'task-update-mirror', 10);
    expect(rows).toHaveLength(1);
    const [mirror] = store.getObservations([rows[0]?.id ?? -1], { expand: true });
    expect(mirror?.metadata).toMatchObject({
      mirror_schema: 1,
      source_tool: 'TaskUpdate',
      status_delta: {
        task_id: 'task-7',
        from_status: 'in_progress',
        to_status: 'completed',
      },
    });
  });
});
