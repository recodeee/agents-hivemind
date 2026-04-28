import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore, TaskThread } from '@colony/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

let dataDir: string;
let repoRoot: string;
let store: MemoryStore;
let client: Client;

interface ReadyEntry {
  plan_slug: string;
  subtask_index: number;
  title: string;
  capability_hint: string | null;
  file_scope: string[];
  fit_score: number;
  reasoning: string;
}

interface ReadyResult {
  ready: ReadyEntry[];
  total_available: number;
}

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
  return JSON.parse(text) as T;
}

function publishArgs(subtasks: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    repo_root: repoRoot,
    slug: 'ready-plan',
    session_id: 'planner',
    agent: 'claude',
    title: 'Ready plan',
    problem: 'Agents need ranked work.',
    acceptance_criteria: ['Ready queue ranks available work'],
    subtasks,
  };
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'colony-ready-data-'));
  repoRoot = mkdtempSync(join(tmpdir(), 'colony-ready-repo-'));
  writeFileSync(join(repoRoot, 'SPEC.md'), '# SPEC\n', 'utf8');
  store = new MemoryStore({ dbPath: join(dataDir, 'data.db'), settings: defaultSettings });
  store.startSession({ id: 'planner', ide: 'claude-code', cwd: repoRoot });
  store.startSession({ id: 'agent-session', ide: 'codex', cwd: repoRoot });
  store.startSession({ id: 'other-session', ide: 'claude-code', cwd: repoRoot });
  const server = buildServer(store, defaultSettings);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
});

afterEach(async () => {
  await client.close();
  store.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('task_ready_for_agent', () => {
  it('returns an empty ready queue when no plans exist', async () => {
    const result = await call<ReadyResult>('task_ready_for_agent', {
      session_id: 'agent-session',
      agent: 'codex',
      repo_root: repoRoot,
    });

    expect(result.ready).toEqual([]);
    expect(result.total_available).toBe(0);
  });

  it('ranks the sub-task matching the agent capability first', async () => {
    await call('agent_upsert_profile', {
      agent: 'codex',
      capabilities: { api_work: 0.9, ui_work: 0.1 },
    });
    await call('task_plan_publish', {
      ...publishArgs([
        {
          title: 'Build page',
          description: 'Render the page.',
          file_scope: ['apps/web/page.tsx'],
          capability_hint: 'ui_work',
        },
        {
          title: 'Build API',
          description: 'Expose the endpoint.',
          file_scope: ['apps/api/widgets.ts'],
          capability_hint: 'api_work',
        },
      ]),
    });

    const result = await call<ReadyResult>('task_ready_for_agent', {
      session_id: 'agent-session',
      agent: 'codex',
      repo_root: repoRoot,
    });

    expect(result.ready.map((entry) => entry.title)).toEqual(['Build API', 'Build page']);
    expect(result.ready[0]?.fit_score).toBeGreaterThan(result.ready[1]?.fit_score ?? 0);
  });

  it('ranks an unconflicted sub-task before an equal-capability scope conflict', async () => {
    await call('agent_upsert_profile', {
      agent: 'codex',
      capabilities: { api_work: 0.8 },
    });
    await call('task_plan_publish', {
      ...publishArgs([
        {
          title: 'Conflicted API',
          description: 'Touches a file currently claimed elsewhere.',
          file_scope: ['apps/api/conflicted.ts'],
          capability_hint: 'api_work',
        },
        {
          title: 'Clear API',
          description: 'Touches a clear file.',
          file_scope: ['apps/api/clear.ts'],
          capability_hint: 'api_work',
        },
      ]),
    });
    const thread = TaskThread.open(store, {
      repo_root: repoRoot,
      branch: 'agent/other/conflict',
      session_id: 'other-session',
    });
    thread.claimFile({ session_id: 'other-session', file_path: 'apps/api/conflicted.ts' });

    const result = await call<ReadyResult>('task_ready_for_agent', {
      session_id: 'agent-session',
      agent: 'codex',
      repo_root: repoRoot,
    });

    expect(result.ready.map((entry) => entry.title)).toEqual(['Clear API', 'Conflicted API']);
    expect(result.ready[0]?.reasoning).toContain('scope clear of live claims');
    expect(result.ready[1]?.reasoning).toContain('1 of 1 files in scope held by');
  });

  it('omits sub-tasks with unmet dependencies', async () => {
    await call('task_plan_publish', {
      ...publishArgs([
        {
          title: 'Build API first',
          description: 'The dependency.',
          file_scope: ['apps/api/widgets.ts'],
          capability_hint: 'api_work',
        },
        {
          title: 'Build UI second',
          description: 'Depends on the API.',
          file_scope: ['apps/web/widgets.tsx'],
          depends_on: [0],
          capability_hint: 'ui_work',
        },
      ]),
    });

    const result = await call<ReadyResult>('task_ready_for_agent', {
      session_id: 'agent-session',
      agent: 'codex',
      repo_root: repoRoot,
    });

    expect(result.ready.map((entry) => entry.title)).toEqual(['Build API first']);
    expect(result.total_available).toBe(1);
  });

  it('returns non-empty reasoning with score components for every entry', async () => {
    await call('agent_upsert_profile', {
      agent: 'codex',
      capabilities: { api_work: 0.84 },
    });
    await call('task_plan_publish', {
      ...publishArgs([
        {
          title: 'Build API',
          description: 'Expose the endpoint.',
          file_scope: ['apps/api/widgets.ts'],
          capability_hint: 'api_work',
        },
        {
          title: 'Build UI after API',
          description: 'Depends on the endpoint.',
          file_scope: ['apps/web/widgets.tsx'],
          depends_on: [0],
          capability_hint: 'ui_work',
        },
      ]),
    });

    const result = await call<ReadyResult>('task_ready_for_agent', {
      session_id: 'agent-session',
      agent: 'codex',
      repo_root: repoRoot,
    });

    expect(result.ready).toHaveLength(1);
    for (const entry of result.ready) {
      expect(entry.reasoning).not.toHaveLength(0);
      expect(entry.reasoning).toContain('strong api_work fit (0.84)');
      expect(entry.reasoning).toContain('scope clear of live claims');
      expect(entry.reasoning).toContain('recent claim density 0');
    }
  });
});
