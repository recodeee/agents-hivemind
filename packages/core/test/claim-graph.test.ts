import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimsForPaths, pairwiseScopeOverlap, scopeOverlap } from '../src/claim-graph.js';
import { MemoryStore } from '../src/memory-store.js';
import { TaskThread } from '../src/task-thread.js';

let dir: string;
let store: MemoryStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-claim-graph-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
});

afterEach(() => {
  vi.useRealTimers();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('claimsForPaths', () => {
  it('returns null for every requested path when the store is empty', () => {
    expect([...claimsForPaths(store, ['src/foo.ts', 'src/bar.ts']).entries()]).toEqual([
      ['src/foo.ts', null],
      ['src/bar.ts', null],
    ]);
  });

  it('returns the current holder with age rounded down to whole minutes', () => {
    const t0 = 1_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const thread = seedThread('codex@holder', 'feat/claim-graph');
    thread.claimFile({ session_id: 'codex@holder', file_path: 'src/foo.ts' });

    vi.setSystemTime(t0 + 2 * 60_000 + 59_999);

    expect(claimsForPaths(store, ['src/foo.ts']).get('src/foo.ts')).toEqual({
      session_id: 'codex@holder',
      agent: 'codex',
      task_id: thread.task_id,
      claimed_at: t0,
      age_minutes: 2,
    });
  });

  it('sets agent to null when session id inference fails', () => {
    const thread = seedThread('opaque-session', 'feat/opaque-claim');
    thread.claimFile({ session_id: 'opaque-session', file_path: 'src/foo.ts' });

    expect(claimsForPaths(store, ['src/foo.ts']).get('src/foo.ts')?.agent).toBeNull();
  });
});

describe('scopeOverlap', () => {
  it("does not report the holder's own session as an overlap", () => {
    const thread = seedThread('codex@holder', 'feat/self-overlap');
    thread.claimFile({ session_id: 'codex@holder', file_path: 'src/foo.ts' });

    expect(
      scopeOverlap(store, {
        intended_paths: ['src/foo.ts'],
        my_session_id: 'codex@holder',
      }),
    ).toEqual([]);
  });

  it('reports files held by a different session', () => {
    const thread = seedThread('codex@holder', 'feat/other-overlap');
    thread.claimFile({ session_id: 'codex@holder', file_path: 'src/foo.ts' });

    expect(
      scopeOverlap(store, {
        intended_paths: ['src/foo.ts', 'src/bar.ts'],
        my_session_id: 'claude@other',
      }),
    ).toEqual([
      {
        file_path: 'src/foo.ts',
        held_by: {
          session_id: 'codex@holder',
          agent: 'codex',
          task_id: thread.task_id,
          claimed_at: expect.any(Number),
          age_minutes: 0,
        },
      },
    ]);
  });
});

describe('pairwiseScopeOverlap', () => {
  it('returns one entry for two declarations that share one file', () => {
    expect(
      pairwiseScopeOverlap([
        { session_id: 'codex@a', agent: 'codex', intended_paths: ['src/foo.ts', 'src/a.ts'] },
        {
          session_id: 'claude@b',
          agent: 'claude-code',
          intended_paths: ['src/foo.ts', 'src/b.ts'],
        },
      ]),
    ).toEqual([{ a: 'codex@a', b: 'claude@b', shared: ['src/foo.ts'] }]);
  });

  it('returns no entries when declarations do not overlap', () => {
    expect(
      pairwiseScopeOverlap([
        { session_id: 'codex@a', agent: 'codex', intended_paths: ['src/a.ts'] },
        { session_id: 'claude@b', agent: 'claude-code', intended_paths: ['src/b.ts'] },
      ]),
    ).toEqual([]);
  });
});

function seedThread(sessionId: string, branch: string): TaskThread {
  store.startSession({ id: sessionId, ide: 'unknown', cwd: '/repo' });
  const thread = TaskThread.open(store, {
    repo_root: '/repo',
    branch,
    session_id: sessionId,
  });
  thread.join(sessionId, 'agent');
  return thread;
}
