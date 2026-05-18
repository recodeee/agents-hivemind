import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore } from '@colony/core';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

let dir: string;
let store: MemoryStore;
let client: Client;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'colony-feedback-mcp-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  const server = buildServer(store, defaultSettings);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
}

function parseTextContent<T>(response: unknown): T {
  const typed = response as ToolResponse;
  const text = typed.content[0]?.text;
  if (typeof text !== 'string') throw new Error('feedback tool returned no text content');
  return JSON.parse(text) as T;
}

describe('feedback MCP surface (ICM slice 2)', () => {
  it('records a correction and surfaces it via search + stats', async () => {
    const recordRes = await client.callTool({
      name: 'feedback_record',
      arguments: {
        topic: 'frontend.routing',
        prediction: 'useRouter returns null in server components',
        correction: 'useRouter throws in server components',
        context: 'reviewing apps/web App Router migration',
        importance: 'high',
        created_by: 'claude',
      },
    });
    const recordPayload = parseTextContent<{ id: number }>(recordRes);
    expect(recordPayload.id).toBeGreaterThan(0);

    await client.callTool({
      name: 'feedback_record',
      arguments: {
        topic: 'backend.migrations',
        prediction: 'ALTER TABLE works inside transactions',
        correction: 'ALTER TABLE must run outside a transaction for partitioned tables',
      },
    });

    const searchRes = await client.callTool({
      name: 'feedback_search',
      arguments: { query: 'router server component', limit: 5 },
    });
    const searchPayload = parseTextContent<{
      hits: Array<{ id: number; topic: string; score: number; snippet: string }>;
    }>(searchRes);
    expect(searchPayload.hits.length).toBeGreaterThan(0);
    expect(searchPayload.hits[0]?.topic).toBe('frontend.routing');

    const statsRes = await client.callTool({
      name: 'feedback_stats',
      arguments: {},
    });
    const statsPayload = parseTextContent<{
      stats: Array<{ topic: string; count: number; last_created_at: number }>;
    }>(statsRes);
    const topics = statsPayload.stats.map((row) => row.topic);
    expect(topics).toContain('frontend.routing');
    expect(topics).toContain('backend.migrations');
  });

  it('returns INTERNAL_ERROR when the prediction redacts to empty', async () => {
    const res = await client.callTool({
      name: 'feedback_record',
      arguments: {
        topic: 'auth',
        prediction: '<private>secret-prediction</private>',
        correction: 'real correction text',
      },
    });
    const typed = res as ToolResponse & { isError?: boolean };
    expect(typed.isError).toBe(true);
    const payload = JSON.parse(typed.content[0]?.text ?? '{}') as { code: string };
    expect(payload.code).toBe('INTERNAL_ERROR');
  });
});
