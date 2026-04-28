import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { type Embedder, MemoryStore, type SuggestionPayload } from '@colony/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolContext } from '../src/tools/context.js';
import * as suggest from '../src/tools/suggest.js';

let dir: string;
let store: MemoryStore;
let client: Client;
let embedderFactory: () => Embedder | null;

const DIM = 4;

class FakeEmbedder implements Embedder {
  readonly model = 'm1';
  readonly dim = DIM;
  // Deterministic embed: takes the FIRST four characters of the query
  // string as a one-hot signal. Tests construct queries to land on a
  // known axis without coupling to a real model.
  embed(text: string): Promise<Float32Array> {
    const v = new Float32Array(DIM);
    if (text.includes('axis-0')) v[0] = 1;
    else if (text.includes('axis-1')) v[1] = 1;
    else if (text.includes('axis-2')) v[2] = 1;
    else v[3] = 1;
    return Promise.resolve(v);
  }
}

function unitVec(axis: number): Float32Array {
  const v = new Float32Array(DIM);
  v[axis] = 1;
  return v;
}

function seed(...ids: string[]): void {
  for (const id of ids) {
    store.startSession({ id, ide: 'claude-code', cwd: '/r' });
  }
}

function createTask(branch: string, repo_root = '/r'): number {
  const row = store.storage.findOrCreateTask({
    title: branch,
    repo_root,
    branch,
    created_by: 'claude',
  });
  return row.id;
}

function fillCorpusWithBackground(count: number): void {
  for (let i = 0; i < count; i++) createTask(`background/${i}`);
}

function seedTaskWithEmbeddings(p: { branch: string; axis: number; count?: number }): number {
  const task_id = createTask(p.branch);
  const count = p.count ?? 6;
  for (let i = 0; i < count; i++) {
    const id = store.addObservation({
      session_id: 'claude',
      task_id,
      kind: 'note',
      content: `obs ${i} of ${p.branch}`,
    });
    store.storage.putEmbedding(id, 'm1', unitVec(p.axis));
  }
  return task_id;
}

function buildTestServer(): McpServer {
  const server = new McpServer({ name: 'colony-test', version: '0.0.0' });
  const ctx: ToolContext = {
    store,
    settings: defaultSettings,
    resolveEmbedder: async () => embedderFactory(),
  };
  suggest.register(server, ctx);
  return server;
}

async function callSuggest(args: Record<string, unknown>): Promise<SuggestionPayload> {
  const res = await client.callTool({ name: 'task_suggest_approach', arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
  return JSON.parse(text) as SuggestionPayload;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'colony-suggest-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  seed('claude');
  embedderFactory = () => new FakeEmbedder();

  const server = buildTestServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
});

afterEach(async () => {
  await client.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('task_suggest_approach', () => {
  it('returns insufficient_data_reason when the embedder is unavailable', async () => {
    embedderFactory = () => null;
    // Re-bind: the existing client uses the old factory closure, so we
    // need a fresh server connection.
    await client.close();
    const server = buildTestServer();
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);

    const payload = await callSuggest({ query: 'anything' });
    expect(payload.insufficient_data_reason).toBe('embedder unavailable');
    expect(payload.similar_tasks).toEqual([]);
  });

  it('returns insufficient_data_reason when the corpus is too small', async () => {
    // Only 3 tasks in the corpus — well below MIN_CORPUS_SIZE (10).
    seedTaskWithEmbeddings({ branch: 'one', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'two', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'three', axis: 0 });

    const payload = await callSuggest({ query: 'axis-0 task description' });
    expect(payload.insufficient_data_reason).toMatch(/colony has only/);
  });

  it('surfaces similar tasks and structured fields when corpus is rich enough', async () => {
    fillCorpusWithBackground(20);
    // Seed three tasks aligned with axis 0 (auth-related, say) and three
    // unrelated tasks aligned with axis 1.
    seedTaskWithEmbeddings({ branch: 'auth-1', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'auth-2', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'auth-3', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'other-1', axis: 1 });
    seedTaskWithEmbeddings({ branch: 'other-2', axis: 1 });
    seedTaskWithEmbeddings({ branch: 'other-3', axis: 1 });

    const payload = await callSuggest({ query: 'axis-0 query' });

    expect(payload.insufficient_data_reason).toBeNull();
    // The three axis-0 tasks should be in similar_tasks; the axis-1
    // tasks should not (they are orthogonal, sim 0, below the floor).
    const branches = payload.similar_tasks.map((t) => t.branch).sort();
    expect(branches).toEqual(['auth-1', 'auth-2', 'auth-3']);
  });

  it('honors current_task_id by excluding the task from results', async () => {
    fillCorpusWithBackground(20);
    const self = seedTaskWithEmbeddings({ branch: 'auth-self', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'auth-1', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'auth-2', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'auth-3', axis: 0 });

    const without = await callSuggest({ query: 'axis-0 query' });
    expect(without.similar_tasks.map((t) => t.task_id)).toContain(self);

    const with_exclusion = await callSuggest({
      query: 'axis-0 query',
      current_task_id: self,
    });
    expect(with_exclusion.similar_tasks.map((t) => t.task_id)).not.toContain(self);
  });

  it('scopes results to the requested repo_root', async () => {
    fillCorpusWithBackground(20);
    seedTaskWithEmbeddings({ branch: 'r1-auth-1', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'r1-auth-2', axis: 0 });
    seedTaskWithEmbeddings({ branch: 'r1-auth-3', axis: 0 });
    // Drop the same shape on a different repo via direct task creation —
    // a quick fixture that bypasses the helper.
    const altIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = createTask(`r2-auth-${i}`, '/r2');
      altIds.push(t);
      for (let j = 0; j < 6; j++) {
        const obsId = store.addObservation({
          session_id: 'claude',
          task_id: t,
          kind: 'note',
          content: `obs ${j} of /r2`,
        });
        store.storage.putEmbedding(obsId, 'm1', unitVec(0));
      }
    }

    const r1 = await callSuggest({ query: 'axis-0 query', repo_root: '/r' });
    expect(r1.similar_tasks.every((t) => t.repo_root === '/r')).toBe(true);

    const r2 = await callSuggest({ query: 'axis-0 query', repo_root: '/r2' });
    expect(r2.similar_tasks.every((t) => t.repo_root === '/r2')).toBe(true);
    expect(r2.similar_tasks).toHaveLength(3);
  });
});
