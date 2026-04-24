import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore, TASK_THREAD_ERROR_CODES, TaskThread } from '@colony/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

let dir: string;
let store: MemoryStore;
let client: Client;

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
  return JSON.parse(text) as T;
}

async function callError(
  name: string,
  args: Record<string, unknown>,
): Promise<{ code: string; error: string }> {
  const res = await client.callTool({ name, arguments: args });
  expect(res.isError).toBe(true);
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
  return JSON.parse(text) as { code: string; error: string };
}

function seedTwoSessionTask(): { task_id: number; sessionA: string; sessionB: string } {
  store.startSession({ id: 'A', ide: 'claude-code', cwd: '/repo' });
  store.startSession({ id: 'B', ide: 'codex', cwd: '/repo' });
  const thread = TaskThread.open(store, {
    repo_root: '/repo',
    branch: 'feat/messages',
    session_id: 'A',
  });
  thread.join('A', 'claude');
  thread.join('B', 'codex');
  return { task_id: thread.task_id, sessionA: 'A', sessionB: 'B' };
}

function seedThreeSessionTask(): {
  task_id: number;
  sessionA: string;
  sessionB: string;
  sessionC: string;
} {
  store.startSession({ id: 'A', ide: 'claude-code', cwd: '/repo' });
  store.startSession({ id: 'B', ide: 'codex', cwd: '/repo' });
  store.startSession({ id: 'C', ide: 'claude-code', cwd: '/repo' });
  const thread = TaskThread.open(store, {
    repo_root: '/repo',
    branch: 'feat/broadcast',
    session_id: 'A',
  });
  thread.join('A', 'claude');
  thread.join('B', 'codex');
  thread.join('C', 'claude');
  return { task_id: thread.task_id, sessionA: 'A', sessionB: 'B', sessionC: 'C' };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'colony-task-messages-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  const server = buildServer(store, defaultSettings);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
});

afterEach(async () => {
  await client.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('task threads — direct messages', () => {
  it('round-trip: A sends → B sees in inbox → B marks read → B replies → parent flips to replied', async () => {
    const { task_id, sessionA, sessionB } = seedTwoSessionTask();

    const { message_observation_id, status } = await call<{
      message_observation_id: number;
      status: string;
    }>('task_message', {
      task_id,
      session_id: sessionA,
      agent: 'claude',
      to_agent: 'codex',
      content: 'can you re-run the typecheck on your branch?',
      urgency: 'needs_reply',
    });
    expect(status).toBe('unread');

    // B's inbox surfaces the message with the right urgency.
    const bInbox = await call<
      Array<{ id: number; urgency: string; status: string; from_agent: string }>
    >('task_messages', {
      session_id: sessionB,
      agent: 'codex',
      unread_only: true,
    });
    const entry = bInbox.find((m) => m.id === message_observation_id);
    expect(entry?.urgency).toBe('needs_reply');
    expect(entry?.status).toBe('unread');
    expect(entry?.from_agent).toBe('claude');

    // Marking read is idempotent — two calls converge on 'read'.
    const { status: afterRead } = await call<{ status: string }>('task_message_mark_read', {
      message_observation_id,
      session_id: sessionB,
    });
    expect(afterRead).toBe('read');
    const { status: afterReRead } = await call<{ status: string }>('task_message_mark_read', {
      message_observation_id,
      session_id: sessionB,
    });
    expect(afterReRead).toBe('read');

    // B replies. Parent must flip to 'replied' atomically on the send, not
    // on a later fetch — if it didn't, a third agent could see both the
    // original still-live and the reply at the same time.
    const { message_observation_id: replyId } = await call<{ message_observation_id: number }>(
      'task_message',
      {
        task_id,
        session_id: sessionB,
        agent: 'codex',
        to_agent: 'claude',
        content: 'yep, clean.',
        reply_to: message_observation_id,
      },
    );

    const parentRow = store.storage.getObservation(message_observation_id);
    const parentMeta = JSON.parse(parentRow?.metadata ?? '{}');
    expect(parentMeta.status).toBe('replied');
    expect(parentMeta.replied_by_observation_id).toBe(replyId);
    expect(typeof parentMeta.replied_at).toBe('number');

    // Inbox sanity: B's own reply must not bounce back into B's inbox, and
    // A's inbox should surface the reply — addressed by to_agent='claude'.
    const bInboxAfter = await call<Array<{ id: number }>>('task_messages', {
      session_id: sessionB,
      agent: 'codex',
    });
    expect(bInboxAfter.find((m) => m.id === replyId)).toBeUndefined();

    const aInbox = await call<Array<{ id: number; from_agent: string }>>('task_messages', {
      session_id: sessionA,
      agent: 'claude',
    });
    expect(aInbox.find((m) => m.id === replyId)?.from_agent).toBe('codex');
  });

  it('broadcast (to_agent=any) reaches every non-sender participant', async () => {
    const { task_id, sessionA, sessionB, sessionC } = seedThreeSessionTask();

    const { message_observation_id } = await call<{ message_observation_id: number }>(
      'task_message',
      {
        task_id,
        session_id: sessionA,
        agent: 'claude',
        to_agent: 'any',
        content: 'anyone free to take the migration review?',
        urgency: 'fyi',
      },
    );

    for (const [session_id, agent] of [
      [sessionB, 'codex'],
      [sessionC, 'claude'],
    ] as const) {
      const inbox = await call<Array<{ id: number; to_agent: string }>>('task_messages', {
        session_id,
        agent,
        task_ids: [task_id],
      });
      const found = inbox.find((m) => m.id === message_observation_id);
      expect(found?.to_agent).toBe('any');
    }

    // Sender never sees their own broadcast.
    const senderInbox = await call<Array<{ id: number }>>('task_messages', {
      session_id: sessionA,
      agent: 'claude',
      task_ids: [task_id],
    });
    expect(senderInbox.find((m) => m.id === message_observation_id)).toBeUndefined();
  });

  it('to_session_id routes to the target session and stays invisible to mismatched-agent participants', async () => {
    const { task_id, sessionA, sessionB, sessionC } = seedThreeSessionTask();

    const { message_observation_id } = await call<{ message_observation_id: number }>(
      'task_message',
      {
        task_id,
        session_id: sessionA,
        agent: 'claude',
        // to_agent=claude is the default agent class for both A and C, but
        // to_session_id narrows delivery to C only.
        to_agent: 'claude',
        to_session_id: sessionC,
        content: 'C, can you pair on this?',
      },
    );

    const cInbox = await call<Array<{ id: number }>>('task_messages', {
      session_id: sessionC,
      agent: 'claude',
    });
    expect(cInbox.find((m) => m.id === message_observation_id)).toBeDefined();

    // B is a codex session; filter by to_agent='claude' should exclude B
    // *and* a second claude session would also be excluded if to_session_id
    // were honoured strictly. Here we only seed one extra claude session (C),
    // so we assert the negative case via B.
    const bInbox = await call<Array<{ id: number }>>('task_messages', {
      session_id: sessionB,
      agent: 'codex',
    });
    expect(bInbox.find((m) => m.id === message_observation_id)).toBeUndefined();
  });

  it('since_ts cursor filters out older messages', async () => {
    const { task_id, sessionA, sessionB } = seedTwoSessionTask();

    const { message_observation_id: firstId } = await call<{ message_observation_id: number }>(
      'task_message',
      {
        task_id,
        session_id: sessionA,
        agent: 'claude',
        to_agent: 'codex',
        content: 'first',
      },
    );

    // Wait one ms to guarantee monotonic ts even on fast clocks.
    const cursor = Date.now() + 1;
    await new Promise((r) => setTimeout(r, 2));

    const { message_observation_id: secondId } = await call<{ message_observation_id: number }>(
      'task_message',
      {
        task_id,
        session_id: sessionA,
        agent: 'claude',
        to_agent: 'codex',
        content: 'second',
      },
    );

    const scoped = await call<Array<{ id: number }>>('task_messages', {
      session_id: sessionB,
      agent: 'codex',
      since_ts: cursor,
    });
    expect(scoped.find((m) => m.id === secondId)).toBeDefined();
    expect(scoped.find((m) => m.id === firstId)).toBeUndefined();
  });

  it('reply_to pointing at a foreign-task message does not flip that message to replied', async () => {
    // Task 1: A sends to B.
    const { task_id: task1, sessionA, sessionB } = seedTwoSessionTask();
    const { message_observation_id: foreignId } = await call<{ message_observation_id: number }>(
      'task_message',
      {
        task_id: task1,
        session_id: sessionA,
        agent: 'claude',
        to_agent: 'codex',
        content: 'on task 1',
      },
    );

    // Task 2 in the same DB: A starts a new task and posts a reply_to that
    // points at the task-1 message. The guard must refuse to mutate the
    // foreign parent — otherwise a caller could flip any message to
    // 'replied' just by knowing its id.
    const task2 = TaskThread.open(store, {
      repo_root: '/repo',
      branch: 'feat/other',
      session_id: sessionA,
    });
    task2.join(sessionA, 'claude');
    task2.join(sessionB, 'codex');

    await call('task_message', {
      task_id: task2.task_id,
      session_id: sessionA,
      agent: 'claude',
      to_agent: 'codex',
      content: 'reply attempt',
      reply_to: foreignId,
    });

    const foreignRow = store.storage.getObservation(foreignId);
    const foreignMeta = JSON.parse(foreignRow?.metadata ?? '{}');
    expect(foreignMeta.status).toBe('unread');
    expect(foreignMeta.replied_by_observation_id).toBeNull();
  });

  it('mark_read on a non-message observation returns NOT_MESSAGE', async () => {
    const { task_id, sessionA, sessionB } = seedTwoSessionTask();

    // Post a regular note — same storage path, different kind.
    const { id: noteId } = await call<{ id: number }>('task_post', {
      task_id,
      session_id: sessionA,
      kind: 'note',
      content: 'just a note',
    });

    const err = await callError('task_message_mark_read', {
      message_observation_id: noteId,
      session_id: sessionB,
    });
    expect(err.code).toBe(TASK_THREAD_ERROR_CODES.NOT_MESSAGE);
  });
});
